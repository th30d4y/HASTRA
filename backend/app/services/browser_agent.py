"""
Browser agent — multi-step Playwright sessions for the AI assistant.

The LLM calls browser_open, browser_read, browser_click, browser_fill, etc.
in a tool loop. Each call returns observations (screenshot + page state).
Sessions are keyed by conversation/chat context and cleaned up when done.
"""
import asyncio
import base64
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ── Session registry ───────────────────────────────────────────────────────────

@dataclass
class BrowserSession:
    session_id: str
    loop: asyncio.AbstractEventLoop
    browser: Any = None
    page: Any = None
    context: Any = None
    history: List[dict] = field(default_factory=list)
    stop_event: threading.Event = field(default_factory=threading.Event)
    ready: threading.Event = field(default_factory=threading.Event)
    error: Optional[str] = None


_sessions: Dict[str, BrowserSession] = {}
_lock = threading.Lock()


def _get_or_create_session(session_id: str) -> BrowserSession:
    with _lock:
        if session_id not in _sessions:
            sess = BrowserSession(session_id=session_id, loop=None)
            _sessions[session_id] = sess
            _start_session_thread(sess)
        return _sessions[session_id]


def _close_session(session_id: str):
    with _lock:
        sess = _sessions.pop(session_id, None)
    if sess:
        sess.stop_event.set()


def _start_session_thread(sess: BrowserSession):
    def run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        sess.loop = loop
        try:
            loop.run_until_complete(_init_browser(sess))
            loop.run_until_complete(_keep_alive(sess))
        except Exception as e:
            sess.error = str(e)
        finally:
            try:
                if sess.browser:
                    loop.run_until_complete(sess.browser.close())
            except Exception:
                pass
            loop.close()

    t = threading.Thread(target=run, daemon=True)
    t.start()


async def _init_browser(sess: BrowserSession):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        sess.browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox",
                  "--disable-blink-features=AutomationControlled"],
        )
        sess.context = await sess.browser.new_context(
            viewport={"width": 1280, "height": 800},
            ignore_https_errors=True,
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
        )
        sess.page = await sess.context.new_page()
        sess.ready.set()
        # Keep alive until stopped
        while not sess.stop_event.is_set():
            await asyncio.sleep(0.5)


async def _keep_alive(sess: BrowserSession):
    pass  # handled in _init_browser loop


def _run_in_session(session_id: str, coro_factory) -> dict:
    """Run an async coroutine in the session's event loop. Returns result dict."""
    sess = _get_or_create_session(session_id)
    if not sess.ready.wait(timeout=20):
        return {"error": "Browser failed to start", "session_id": session_id}
    if sess.error:
        return {"error": sess.error}
    if not sess.loop or sess.loop.is_closed():
        return {"error": "Browser session loop closed"}

    future = asyncio.run_coroutine_threadsafe(coro_factory(sess), sess.loop)
    try:
        return future.result(timeout=30)
    except Exception as e:
        return {"error": str(e)}


# ── Page state extraction ──────────────────────────────────────────────────────

async def _get_page_state(page) -> dict:
    """Extract current page URL, title, visible text, interactive elements."""
    try:
        url = page.url
        title = await page.title()
        # Get accessible text (compressed)
        text = await page.evaluate("""() => {
            const walker = document.createTreeWalker(
                document.body, NodeFilter.SHOW_TEXT, null
            );
            const lines = [];
            let node;
            while (node = walker.nextNode()) {
                const t = node.textContent.trim();
                if (t.length > 2 && t.length < 200) lines.push(t);
            }
            return [...new Set(lines)].slice(0, 80).join(' | ');
        }""")
        # Get interactive elements
        elements = await page.evaluate("""() => {
            const els = [];
            const sel = 'a[href], button, input, select, textarea, [role="button"], [role="link"]';
            document.querySelectorAll(sel).forEach(el => {
                const label = el.getAttribute('aria-label') ||
                              el.getAttribute('placeholder') ||
                              el.textContent?.trim().substring(0, 60) ||
                              el.getAttribute('name') ||
                              el.type || el.tagName.toLowerCase();
                if (label) {
                    const info = {
                        tag: el.tagName.toLowerCase(),
                        label,
                        type: el.type || '',
                        id: el.id || '',
                        name: el.name || '',
                        href: el.href || '',
                    };
                    els.push(info);
                }
            });
            return els.slice(0, 30);
        }""")
        # Screenshot
        png = await page.screenshot(type="jpeg", quality=65, timeout=5000)
        screenshot_b64 = base64.b64encode(png).decode()
        return {
            "url": url, "title": title,
            "visible_text": text[:2000],
            "interactive_elements": elements,
            "screenshot_b64": screenshot_b64,
        }
    except Exception as e:
        return {"url": page.url if page else "unknown", "error": str(e)}


# ── Public tool functions ──────────────────────────────────────────────────────

def browser_open(session_id: str, url: str) -> dict:
    """Navigate to URL and return page state + screenshot."""
    async def _do(sess: BrowserSession):
        try:
            resp = await sess.page.goto(url, timeout=20000, wait_until="domcontentloaded")
            state = await _get_page_state(sess.page)
            result = {
                "action": "open",
                "url": url,
                "http_status": resp.status if resp else None,
                **state,
            }
            sess.history.append({"action": "open", "url": url, "status": "success"})
            return result
        except Exception as e:
            return {"action": "open", "url": url, "error": str(e)}

    return _run_in_session(session_id, _do)


def browser_click(session_id: str, selector: str) -> dict:
    """Click an element by selector or text. Returns updated page state."""
    async def _do(sess: BrowserSession):
        page = sess.page
        clicked = False
        error_msg = ""
        used_selector = selector

        # Try exact selector
        candidates = [
            selector,
            f"text={selector}",
            f"role=button[name='{selector}']",
            f"role=link[name='{selector}']",
            f"[aria-label='{selector}']",
            f"[placeholder='{selector}']",
        ]
        for cand in candidates:
            try:
                await page.locator(cand).first.click(timeout=4000)
                used_selector = cand
                clicked = True
                break
            except Exception as e:
                error_msg = str(e)

        if not clicked:
            return {"action": "click", "selector": selector, "error": f"Element not found: {error_msg[:150]}"}

        await asyncio.sleep(0.5)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        state = await _get_page_state(page)
        sess.history.append({"action": "click", "selector": used_selector, "status": "success"})
        return {"action": "click", "selector": selector, "used_selector": used_selector, **state}

    return _run_in_session(session_id, _do)


def browser_fill(session_id: str, selector: str, value: str) -> dict:
    """Fill an input field. Masks password fields."""
    async def _do(sess: BrowserSession):
        page = sess.page
        filled = False
        error_msg = ""
        is_password = False

        candidates = [
            selector,
            f"[placeholder='{selector}']",
            f"[name='{selector}']",
            f"[id='{selector}']",
            f"[aria-label='{selector}']",
        ]
        for cand in candidates:
            try:
                loc = page.locator(cand).first
                is_password = await loc.evaluate("el => el.type === 'password'") == True
                await loc.fill(value, timeout=4000)
                filled = True
                break
            except Exception as e:
                error_msg = str(e)

        if not filled:
            return {"action": "fill", "selector": selector, "error": f"Field not found: {error_msg[:150]}"}

        display_value = "••••••••" if is_password else value[:20]
        sess.history.append({"action": "fill", "selector": selector, "value": display_value})
        return {"action": "fill", "selector": selector, "value": display_value, "status": "success"}

    return _run_in_session(session_id, _do)


def browser_press(session_id: str, key: str) -> dict:
    """Press a keyboard key (Enter, Tab, Escape, etc.)."""
    async def _do(sess: BrowserSession):
        try:
            await sess.page.keyboard.press(key)
            await asyncio.sleep(0.5)
            try:
                await sess.page.wait_for_load_state("domcontentloaded", timeout=3000)
            except Exception:
                pass
            state = await _get_page_state(sess.page)
            sess.history.append({"action": "press", "key": key})
            return {"action": "press", "key": key, **state}
        except Exception as e:
            return {"action": "press", "key": key, "error": str(e)}

    return _run_in_session(session_id, _do)


def browser_read_page(session_id: str) -> dict:
    """Read the current page state without any action."""
    async def _do(sess: BrowserSession):
        state = await _get_page_state(sess.page)
        return {"action": "read", **state}

    return _run_in_session(session_id, _do)


def browser_navigate(session_id: str, url: str) -> dict:
    """Navigate to a URL (same as open but semantically clearer for in-session nav)."""
    return browser_open(session_id, url)


def browser_wait(session_id: str, milliseconds: int = 1000) -> dict:
    """Wait for a given time and return updated page state."""
    async def _do(sess: BrowserSession):
        await asyncio.sleep(min(milliseconds, 5000) / 1000)
        state = await _get_page_state(sess.page)
        return {"action": "wait", "waited_ms": milliseconds, **state}

    return _run_in_session(session_id, _do)


def browser_find_element(session_id: str, description: str) -> dict:
    """Find an element by description and return its details."""
    async def _do(sess: BrowserSession):
        page = sess.page
        result = await page.evaluate(f"""() => {{
            const desc = {json.dumps(description.lower())};
            const all = document.querySelectorAll('*');
            const matches = [];
            for (const el of all) {{
                const text = (el.textContent || '').trim().toLowerCase();
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
                const id = (el.id || '').toLowerCase();
                if (text.includes(desc) || label.includes(desc) ||
                    placeholder.includes(desc) || id.includes(desc)) {{
                    matches.push({{
                        tag: el.tagName.toLowerCase(),
                        id: el.id,
                        text: el.textContent?.trim().substring(0, 50),
                        ariaLabel: el.getAttribute('aria-label'),
                        placeholder: el.getAttribute('placeholder'),
                    }});
                    if (matches.length >= 5) break;
                }}
            }}
            return matches;
        }}""")
        return {"action": "find", "description": description, "matches": result}

    return _run_in_session(session_id, _do)


def browser_get_console_errors(session_id: str) -> dict:
    """Get any console errors captured during the session."""
    async def _do(sess: BrowserSession):
        # Console messages are set up on context creation
        errors = getattr(sess, '_console_errors', [])
        return {"action": "console", "errors": errors[:20]}

    return _run_in_session(session_id, _do)


def browser_close(session_id: str) -> dict:
    """Close the browser session and return the action history."""
    sess = _sessions.get(session_id)
    history = sess.history if sess else []
    _close_session(session_id)
    return {"action": "close", "status": "closed", "total_actions": len(history), "history": history}
