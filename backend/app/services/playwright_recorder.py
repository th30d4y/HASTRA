"""
Playwright recording engine — proper server-side architecture.

Each recording creates an isolated Playwright session stored in _sessions.
The frontend polls /screenshot for a live view and POSTs /interact to forward
clicks/keystrokes. All events are saved to a fresh DB session (not the request session).
SSE via /live-events streams new events in real-time.

Stop signal: threading.Event so the main thread and background tasks can coordinate.
"""
import asyncio
import base64
import json
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from dataclasses import dataclass, field

# ── Session registry ───────────────────────────────────────────────────────────

@dataclass
class RecordingSession:
    recording_id: int
    url: str
    loop: asyncio.AbstractEventLoop
    browser: Any = None
    page: Any = None
    context: Any = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    events: list = field(default_factory=list)   # unsaved queue for SSE
    last_screenshot_b64: Optional[str] = None
    screenshot_lock: threading.Lock = field(default_factory=threading.Lock)
    start_ms: float = field(default_factory=time.monotonic)
    error: Optional[str] = None
    ready: threading.Event = field(default_factory=threading.Event)  # set when browser is up


_sessions: Dict[int, RecordingSession] = {}
_sessions_lock = threading.Lock()


def get_session(recording_id: int) -> Optional[RecordingSession]:
    with _sessions_lock:
        return _sessions.get(recording_id)


def _elapsed_ms(session: RecordingSession) -> int:
    return int((time.monotonic() - session.start_ms) * 1000)


# ── Smart selector generation ─────────────────────────────────────────────────

SELECTOR_JS = """
(el) => {
    if (!el || el === document.body) return 'body';
    // Priority 1: data-testid
    const tid = el.getAttribute('data-testid');
    if (tid) return `[data-testid="${tid}"]`;
    // Priority 2: aria-label
    const al = el.getAttribute('aria-label');
    if (al) return `[aria-label="${al.replace(/"/g, '\\\\"')}"]`;
    // Priority 3: id
    if (el.id) return `#${el.id}`;
    // Priority 4: name
    if (el.name) return `[name="${el.name}"]`;
    // Priority 5: placeholder
    if (el.placeholder) return `[placeholder="${el.placeholder}"]`;
    // Priority 6: role + accessible text
    const role = el.getAttribute('role');
    const text = (el.textContent || '').trim().substring(0, 40);
    if (role && text) return `[role="${role}"]:has-text("${text}")`;
    // Priority 7: tag + text
    if (text && el.tagName) return `${el.tagName.toLowerCase()}:has-text("${text.replace(/"/g, '\\"')}")`;
    // Fallback: CSS path (simple)
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList).slice(0, 2).join('.');
    return cls ? `${tag}.${cls}` : tag;
}
"""

RECORD_SCRIPT = """
() => {
    if (window.__hastra_recording) return;
    window.__hastra_recording = true;
    window.__hastra_events = [];

    const push = (type, data) => {
        window.__hastra_events.push({ type, ts: Date.now(), ...data });
    };

    const getSelector = """ + SELECTOR_JS.strip() + """;

    const getElementInfo = (el) => ({
        tag: el.tagName ? el.tagName.toLowerCase() : '',
        id: el.id || '',
        name: el.name || '',
        text: (el.textContent || '').trim().substring(0, 80),
        role: el.getAttribute ? (el.getAttribute('role') || '') : '',
        ariaLabel: el.getAttribute ? (el.getAttribute('aria-label') || '') : '',
        placeholder: el.placeholder || '',
        type: el.type || '',
        className: Array.from(el.classList || []).slice(0, 3).join(' '),
    });

    // Clicks
    document.addEventListener('click', (e) => {
        const el = e.target;
        if (!el) return;
        const sel = getSelector(el);
        const info = getElementInfo(el);
        // Skip our own injected UI if any
        if (el.closest && el.closest('[data-hastra]')) return;
        push('click', {
            selector: sel,
            selectors: {
                primary: sel,
                byText: info.text ? `text=${info.text.substring(0, 40)}` : null,
                byRole: info.role ? `role=${info.role}` : null,
            },
            element: info,
            url: window.location.href,
            x: e.clientX, y: e.clientY,
        });
    }, true);

    // Input / fill
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el) return;
        const isPassword = el.type === 'password';
        const sel = getSelector(el);
        push('fill', {
            selector: sel,
            value: isPassword ? '[REDACTED]' : el.value,
            masked: isPassword,
            element: getElementInfo(el),
            url: window.location.href,
        });
    }, true);

    // Change (select, checkbox, radio)
    document.addEventListener('change', (e) => {
        const el = e.target;
        if (!el) return;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (!['select', 'input'].includes(tag)) return;
        const sel = getSelector(el);
        if (el.type === 'checkbox' || el.type === 'radio') {
            push('check', { selector: sel, checked: el.checked, element: getElementInfo(el), url: window.location.href });
        } else if (tag === 'select') {
            push('select', { selector: sel, value: el.value, text: el.options[el.selectedIndex]?.text, element: getElementInfo(el), url: window.location.href });
        }
    }, true);

    // Key presses worth recording
    document.addEventListener('keydown', (e) => {
        const meaningful = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'];
        if (meaningful.includes(e.key)) {
            push('keydown', { key: e.key, url: window.location.href });
        }
    }, true);

    // Form submit
    document.addEventListener('submit', (e) => {
        const form = e.target;
        const sel = getSelector(form);
        push('submit', { selector: sel, url: window.location.href });
    }, true);

    // Scroll (debounced, only significant scrolls)
    let lastScrollY = 0, scrollTimer = null;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const dy = Math.abs(window.scrollY - lastScrollY);
            if (dy > 100) {
                push('scroll', { x: window.scrollX, y: window.scrollY, url: window.location.href });
                lastScrollY = window.scrollY;
            }
        }, 300);
    }, { passive: true });
}
"""


def _describe(ev: dict) -> str:
    t = ev.get("type", "")
    sel = ev.get("selector", "")
    el = ev.get("element", {})
    label = el.get("ariaLabel") or el.get("text", "")[:40] or el.get("placeholder", "") or el.get("name", "") or sel
    url = ev.get("url", "")

    if t == "click":      return f"Click: {label}" + (f" — {url}" if url else "")
    if t == "fill":       val = ev.get("value", ""); return f"Fill '{label}': {val if not ev.get('masked') else '••••••••'}"
    if t == "check":      return f"{'Check' if ev.get('checked') else 'Uncheck'}: {label}"
    if t == "select":     return f"Select '{ev.get('text', ev.get('value', ''))}' in {label}"
    if t == "keydown":    return f"Press {ev.get('key', '')}"
    if t == "submit":     return f"Submit form: {label}"
    if t == "scroll":     return f"Scroll to ({ev.get('x',0)}, {ev.get('y',0)})"
    if t == "navigate":   return f"Navigate: {ev.get('url', url)}"
    if t == "navigation": return f"Page loaded: {ev.get('url', url)}"
    return f"{t}: {label or sel}"


# ── DB helpers (own session per call) ─────────────────────────────────────────

def _new_db():
    from app.core.database import SessionLocal
    return SessionLocal()


def _save_event_db(recording_id: int, event: dict):
    """Save one event using a fresh DB session."""
    from app.models.recording import RecordingEvent, Recording
    db = _new_db()
    try:
        ev = RecordingEvent(
            recording_id=recording_id,
            event_type=event["event_type"],
            timestamp_ms=event["timestamp_ms"],
            actor=event.get("actor", "user"),
            content=event.get("content", ""),
            extra_metadata=event.get("extra_metadata"),
        )
        db.add(ev)
        db.query(Recording).filter(Recording.id == recording_id).update(
            {"event_count": Recording.event_count + 1}
        )
        db.commit()
    except Exception as e:
        db.rollback()
    finally:
        db.close()


def _mark_recording_status(recording_id: int, status: str):
    from app.models.recording import Recording
    db = _new_db()
    try:
        rec = db.query(Recording).filter(Recording.id == recording_id).first()
        if rec:
            rec.status = status
            if status == "completed":
                rec.completed_at = datetime.now(timezone.utc)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


# ── Screenshot loop ────────────────────────────────────────────────────────────

async def _screenshot_loop(session: RecordingSession):
    """Continuously capture screenshots every 600ms while recording."""
    while not session.stop_event.is_set():
        try:
            if session.page:
                png = await session.page.screenshot(type="jpeg", quality=70, timeout=3000)
                b64 = base64.b64encode(png).decode()
                with session.screenshot_lock:
                    session.last_screenshot_b64 = b64
        except Exception:
            pass
        await asyncio.sleep(0.6)


# ── Event poll loop ────────────────────────────────────────────────────────────

async def _event_poll_loop(session: RecordingSession):
    """Poll window.__hastra_events every second and persist them."""
    while not session.stop_event.is_set():
        await asyncio.sleep(1.0)
        if not session.page:
            continue
        try:
            raw_events = await session.page.evaluate(
                "() => { const e = window.__hastra_events || []; window.__hastra_events = []; return e; }"
            )
            for ev in raw_events:
                ts = _elapsed_ms(session)
                db_event = {
                    "event_type": ev.get("type", "action"),
                    "timestamp_ms": ts,
                    "actor": "user",
                    "content": _describe(ev),
                    "extra_metadata": {k: v for k, v in ev.items() if k != "ts"},
                }
                session.events.append(db_event)
                _save_event_db(session.recording_id, db_event)
        except Exception:
            pass


# ── Navigation event handler ───────────────────────────────────────────────────

def _make_nav_handler(session: RecordingSession):
    async def on_nav(frame):
        try:
            if session.page and frame == session.page.main_frame:
                url = session.page.url
                ts = _elapsed_ms(session)
                # Re-inject recorder script after navigation
                try:
                    await session.page.evaluate(RECORD_SCRIPT)
                except Exception:
                    pass
                ev = {
                    "event_type": "navigation",
                    "timestamp_ms": ts,
                    "actor": "browser",
                    "content": f"Page loaded: {url}",
                    "extra_metadata": {"url": url},
                }
                session.events.append(ev)
                _save_event_db(session.recording_id, ev)
        except Exception:
            pass
    return on_nav


# ── Main recording coroutine ───────────────────────────────────────────────────

async def _run_session(session: RecordingSession):
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            session.browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox",
                      "--disable-blink-features=AutomationControlled"],
            )
            session.context = await session.browser.new_context(
                viewport={"width": 1280, "height": 800},
                ignore_https_errors=True,
                user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            )
            session.page = await session.context.new_page()
            session.page.on("framenavigated", _make_nav_handler(session))

            # Navigate and inject recorder
            await session.page.goto(session.url, timeout=30000, wait_until="domcontentloaded")
            await session.page.evaluate(RECORD_SCRIPT)

            # Save initial navigate event
            ts = _elapsed_ms(session)
            nav_ev = {
                "event_type": "navigate",
                "timestamp_ms": ts,
                "actor": "user",
                "content": f"Navigate to {session.url}",
                "extra_metadata": {"url": session.url},
            }
            session.events.append(nav_ev)
            _save_event_db(session.recording_id, nav_ev)

            session.ready.set()

            # Run screenshot loop + event poll concurrently until stopped
            await asyncio.gather(
                _screenshot_loop(session),
                _event_poll_loop(session),
            )

            # Final screenshot
            try:
                png = await session.page.screenshot(type="jpeg", quality=85, timeout=5000)
                with session.screenshot_lock:
                    session.last_screenshot_b64 = base64.b64encode(png).decode()
                final_ev = {
                    "event_type": "screenshot",
                    "timestamp_ms": _elapsed_ms(session),
                    "actor": "system",
                    "content": f"Final state — {session.page.url}",
                    "extra_metadata": {"url": session.page.url},
                }
                session.events.append(final_ev)
                _save_event_db(session.recording_id, final_ev)
            except Exception:
                pass

    except Exception as e:
        session.error = str(e)
        _mark_recording_status(session.recording_id, "error")
    finally:
        try:
            if session.browser:
                await session.browser.close()
        except Exception:
            pass
        _mark_recording_status(session.recording_id, "completed")
        with _sessions_lock:
            _sessions.pop(session.recording_id, None)


def _thread_run(session: RecordingSession):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    session.loop = loop
    try:
        loop.run_until_complete(_run_session(session))
    finally:
        loop.close()


# ── Public API ─────────────────────────────────────────────────────────────────

def start_recording(recording_id: int, url: str) -> dict:
    """
    Start a Playwright recording session in a background thread.
    Returns immediately; browser starts asynchronously.
    """
    with _sessions_lock:
        if recording_id in _sessions:
            return {"status": "already_running", "recording_id": recording_id}
        session = RecordingSession(recording_id=recording_id, url=url, loop=None)
        _sessions[recording_id] = session

    _mark_recording_status(recording_id, "recording")

    t = threading.Thread(target=_thread_run, args=(session,), daemon=True)
    t.start()

    # Wait up to 15s for browser to be ready
    ok = session.ready.wait(timeout=15)
    if not ok and session.error:
        return {"status": "error", "error": session.error}
    if not ok:
        return {"status": "timeout", "error": "Browser did not start within 15 seconds"}

    return {"status": "recording_started", "recording_id": recording_id, "url": url}


def stop_recording(recording_id: int) -> dict:
    session = get_session(recording_id)
    if not session:
        _mark_recording_status(recording_id, "completed")
        return {"status": "stopped", "recording_id": recording_id}
    session.stop_event.set()
    return {"status": "stopping", "recording_id": recording_id}


def get_screenshot(recording_id: int) -> Optional[str]:
    session = get_session(recording_id)
    if not session:
        return None
    with session.screenshot_lock:
        return session.last_screenshot_b64


def get_live_events(recording_id: int, after_index: int = 0) -> list:
    """Return new events since after_index (for polling)."""
    session = get_session(recording_id)
    if not session:
        return []
    return session.events[after_index:]


def execute_action(recording_id: int, action: dict) -> dict:
    """
    Execute a browser action (click, fill, keydown, navigate, scroll) on the live session.
    Records it automatically.
    """
    session = get_session(recording_id)
    if not session or not session.page:
        return {"error": "No active recording session"}
    if not session.loop or session.loop.is_closed():
        return {"error": "Event loop not available"}

    async def _do():
        t = action.get("type")
        try:
            if t == "click":
                x, y = action.get("x", 0), action.get("y", 0)
                # Scale from display coords to page coords if needed
                await session.page.mouse.click(x, y)
                return {"ok": True}
            elif t == "fill":
                sel = action.get("selector", "")
                val = action.get("value", "")
                if sel:
                    await session.page.locator(sel).first.fill(val, timeout=3000)
                return {"ok": True}
            elif t == "keydown":
                key = action.get("key", "")
                if key:
                    await session.page.keyboard.press(key)
                return {"ok": True}
            elif t == "navigate":
                url = action.get("url", "")
                if url:
                    await session.page.goto(url, timeout=15000, wait_until="domcontentloaded")
                    await session.page.evaluate(RECORD_SCRIPT)
                return {"ok": True, "url": session.page.url}
            elif t == "scroll":
                x, y = action.get("x", 0), action.get("y", 0)
                await session.page.evaluate(f"window.scrollTo({x}, {y})")
                return {"ok": True}
            else:
                return {"error": f"Unknown action type: {t}"}
        except Exception as e:
            return {"error": str(e)}

    future = asyncio.run_coroutine_threadsafe(_do(), session.loop)
    try:
        result = future.result(timeout=8)
    except Exception as e:
        result = {"error": str(e)}
    return result


# ── Replay ─────────────────────────────────────────────────────────────────────

async def _run_replay(recording_id: int, user_id: int):
    from playwright.async_api import async_playwright
    from app.models.recording import Recording, RecordingEvent
    from app.models.finding import Finding
    from app.models.test_run import TestRun, TestResult, ExecutionEvent

    db = _new_db()
    try:
        rec = db.query(Recording).filter(Recording.id == recording_id, Recording.user_id == user_id).first()
        if not rec:
            return {"error": "Recording not found"}

        events = sorted(rec.events, key=lambda e: e.timestamp_ms)
        if not events:
            return {"error": "No events to replay — recording has no steps"}

        # Find starting URL
        start_url = None
        for ev in events:
            if ev.event_type in ("navigate", "navigation"):
                m = ev.extra_metadata or {}
                start_url = m.get("url") or (
                    ev.content.replace("Navigate to ", "").strip()
                    if "Navigate to" in (ev.content or "") else None
                )
                if start_url and start_url.startswith("http"):
                    break

        if not start_url:
            return {"error": "No starting URL found in recording events"}

        step_results = []
        findings = []
        screenshots = {}
        start_time = time.monotonic()

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"],
            )
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                ignore_https_errors=True,
            )
            page = await ctx.new_page()

            async def _screenshot(label: str) -> Optional[str]:
                try:
                    png = await page.screenshot(type="jpeg", quality=75, timeout=3000)
                    return base64.b64encode(png).decode()
                except Exception:
                    return None

            # Step 0: navigate to start
            try:
                await page.goto(start_url, timeout=20000, wait_until="domcontentloaded")
                ss = await _screenshot("start")
                step_results.append({
                    "step": 0, "event_type": "navigate",
                    "action": f"Navigate to {start_url}",
                    "status": "pass", "actual_url": page.url,
                    "screenshot": ss,
                })
            except Exception as e:
                await browser.close()
                return {
                    "success": False,
                    "step_results": [{"step": 0, "status": "fail", "error": str(e), "action": f"Navigate to {start_url}"}],
                    "findings": [{"severity": "HIGH", "title": "Navigation Failed", "description": str(e), "expected": start_url, "actual": "Browser error"}],
                    "status": "failed",
                }

            # Replay each event
            actionable = [e for e in events if e.event_type not in ("screenshot", "navigation")]
            for i, ev in enumerate(actionable[1:], start=1):  # skip first navigate
                meta = ev.extra_metadata or {}
                etype = ev.event_type
                selector = meta.get("selector", "")
                value = meta.get("value", "")
                key = meta.get("key", "")
                url_from_meta = meta.get("url", "")

                try:
                    if etype == "navigate":
                        target = meta.get("url", url_from_meta)
                        if target and target.startswith("http"):
                            await page.goto(target, timeout=15000, wait_until="domcontentloaded")
                        ss = await _screenshot(f"step_{i}")
                        step_results.append({"step": i, "event_type": etype, "action": ev.content,
                            "status": "pass", "actual_url": page.url, "screenshot": ss})

                    elif etype == "click":
                        clicked = False
                        error_msg = ""
                        # Try primary selector
                        if selector:
                            try:
                                await page.locator(selector).first.click(timeout=4000)
                                clicked = True
                            except Exception as e1:
                                error_msg = str(e1)
                        # Fallback: text
                        if not clicked:
                            sels = meta.get("selectors", {})
                            for fb_key in ("byText", "byRole"):
                                fb = sels.get(fb_key)
                                if fb:
                                    try:
                                        await page.locator(fb).first.click(timeout=3000)
                                        clicked = True
                                        break
                                    except Exception:
                                        pass
                        # Fallback: element text
                        if not clicked:
                            el_text = (meta.get("element") or {}).get("text", "")
                            if el_text:
                                try:
                                    await page.get_by_text(el_text[:30]).first.click(timeout=3000)
                                    clicked = True
                                except Exception:
                                    pass

                        await asyncio.sleep(0.3)
                        try:
                            await page.wait_for_load_state("domcontentloaded", timeout=3000)
                        except Exception:
                            pass

                        ss = await _screenshot(f"step_{i}")
                        if clicked:
                            step_results.append({"step": i, "event_type": "click", "action": ev.content,
                                "status": "pass", "actual_url": page.url, "screenshot": ss})
                        else:
                            step_results.append({"step": i, "event_type": "click", "action": ev.content,
                                "status": "fail", "error": error_msg, "screenshot": ss,
                                "selector": selector})
                            findings.append({
                                "severity": "MEDIUM",
                                "title": f"Element Not Found: {selector or ev.content[:40]}",
                                "description": f"Could not click element — selector no longer matches",
                                "expected": f"Element '{selector}' should be clickable",
                                "actual": f"Element not found: {error_msg[:100]}",
                                "evidence": f"Step {i}: {ev.content}",
                                "recommended_fix": "Check if the element's selector changed. Add a data-testid attribute.",
                            })

                    elif etype == "fill":
                        if selector:
                            try:
                                await page.locator(selector).first.fill(value, timeout=5000)
                                step_results.append({"step": i, "event_type": "fill",
                                    "action": ev.content, "status": "pass"})
                            except Exception as e:
                                step_results.append({"step": i, "event_type": "fill",
                                    "action": ev.content, "status": "fail", "error": str(e)})

                    elif etype == "keydown":
                        if key:
                            await page.keyboard.press(key)
                            await asyncio.sleep(0.2)
                            try:
                                await page.wait_for_load_state("domcontentloaded", timeout=2000)
                            except Exception:
                                pass
                            ss = await _screenshot(f"step_{i}")
                            step_results.append({"step": i, "event_type": "keydown",
                                "action": ev.content, "status": "pass", "screenshot": ss})

                    elif etype in ("check", "select"):
                        if selector:
                            try:
                                if etype == "check":
                                    await page.locator(selector).first.set_checked(meta.get("checked", True), timeout=3000)
                                else:
                                    await page.locator(selector).first.select_option(value, timeout=3000)
                                step_results.append({"step": i, "event_type": etype, "action": ev.content, "status": "pass"})
                            except Exception as e:
                                step_results.append({"step": i, "event_type": etype, "action": ev.content, "status": "fail", "error": str(e)})

                    elif etype == "submit":
                        if selector:
                            try:
                                await page.locator(selector).first.press("Enter", timeout=3000)
                                step_results.append({"step": i, "event_type": "submit", "action": ev.content, "status": "pass"})
                            except Exception as e:
                                step_results.append({"step": i, "event_type": "submit", "action": ev.content, "status": "fail", "error": str(e)})

                    else:
                        step_results.append({"step": i, "event_type": etype, "action": ev.content, "status": "skip"})

                except Exception as e:
                    ss = await _screenshot(f"error_{i}")
                    step_results.append({"step": i, "event_type": etype, "action": ev.content,
                        "status": "error", "error": str(e), "screenshot": ss})

            final_url = page.url
            final_title = await page.title()
            final_ss = await _screenshot("final")

            # Check assertions from scenario
            meta_rec = rec.extra_metadata or {}
            expected_final_url = meta_rec.get("target_url", start_url)

            await browser.close()

        passed = sum(1 for s in step_results if "pass" in s.get("status", ""))
        failed = sum(1 for s in step_results if s.get("status") in ("fail", "error"))
        total = len(step_results)
        overall = "passed" if failed == 0 and not findings else "failed"

        return {
            "success": True,
            "status": overall,
            "recording_id": recording_id,
            "total_steps": total,
            "passed_steps": passed,
            "failed_steps": failed,
            "step_results": step_results,
            "findings": findings,
            "final_url": final_url,
            "final_title": final_title,
            "final_screenshot": final_ss,
            "duration_ms": int((time.monotonic() - start_time) * 1000),
            "summary": f"{passed}/{total} steps passed",
        }
    finally:
        db.close()


def replay_recording(recording_id: int, user_id: int, db=None) -> dict:
    """Synchronous wrapper for replay."""
    return asyncio.run(_run_replay(recording_id, user_id))
