"""
Playwright-based URL flow checker.
Checks login flows, navigation, and page health for any URL.
"""
import asyncio
import json
from typing import Optional


async def check_url_flow(url: str, flow_type: str = "login", username: str = "", password: str = "") -> dict:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"success": False, "error": "Playwright not installed", "steps": []}

    steps = []
    findings = []
    screenshots = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (compatible; HASTRA-Checker/1.0)",
        )
        page = await context.new_page()

        try:
            # Step 1: Navigate
            steps.append({"step": "navigate", "status": "running", "detail": f"Navigating to {url}"})
            response = await page.goto(url, timeout=15000, wait_until="domcontentloaded")
            status_code = response.status if response else 0
            title = await page.title()
            steps[-1].update({"status": "pass", "detail": f"Page loaded — {status_code} — {title}"})

            # Step 2: Check page health
            steps.append({"step": "page_health", "status": "running", "detail": "Checking page structure"})
            has_forms = await page.locator("form").count() > 0
            has_inputs = await page.locator("input").count() > 0
            has_buttons = await page.locator("button, [type=submit]").count() > 0
            steps[-1].update({
                "status": "pass",
                "detail": f"Forms: {has_forms}, Inputs: {has_inputs}, Buttons: {has_buttons}"
            })

            if flow_type == "login":
                # Step 3: Find login form
                steps.append({"step": "find_login_form", "status": "running", "detail": "Looking for login elements"})

                email_sel = "input[type=email], input[name*=email], input[name*=user], input[placeholder*=email i], input[placeholder*=user i]"
                pass_sel = "input[type=password]"

                email_el = page.locator(email_sel).first
                pass_el = page.locator(pass_sel).first

                email_visible = await email_el.is_visible() if await page.locator(email_sel).count() > 0 else False
                pass_visible = await pass_el.is_visible() if await page.locator(pass_sel).count() > 0 else False

                if not email_visible and not pass_visible:
                    # Try to find a login link
                    login_links = await page.locator("a[href*=login], a[href*=signin], button:has-text('Login'), button:has-text('Sign in')").count()
                    if login_links > 0:
                        steps[-1].update({"status": "info", "detail": "Login form not on main page — found login link"})
                        await page.locator("a[href*=login], a[href*=signin]").first.click()
                        await page.wait_for_load_state("domcontentloaded")
                        email_visible = await page.locator(email_sel).count() > 0
                        pass_visible = await page.locator(pass_sel).count() > 0
                    else:
                        steps[-1].update({"status": "warning", "detail": "No login form found on page"})
                        findings.append({"type": "missing_login_form", "severity": "INFO", "message": "No standard login form detected"})
                else:
                    steps[-1].update({"status": "pass", "detail": f"Login form found — email: {email_visible}, password: {pass_visible}"})

                # Step 4: Security checks on login form
                steps.append({"step": "security_check", "status": "running", "detail": "Checking login security"})
                security_issues = []

                # Check HTTPS
                if not url.startswith("https://"):
                    security_issues.append("NOT using HTTPS — credentials sent in plaintext")
                    findings.append({"type": "no_https", "severity": "CRITICAL", "message": "Login page not served over HTTPS"})

                # Check autocomplete on password
                if pass_visible:
                    autocomplete = await page.locator(pass_sel).first.get_attribute("autocomplete")
                    if autocomplete not in ("off", "new-password", "current-password"):
                        security_issues.append("Password field missing autocomplete=off/current-password")

                # Check for CSRF token (hidden inputs)
                csrf_count = await page.locator("input[type=hidden][name*=csrf i], input[type=hidden][name*=token i], input[type=hidden][name*=_token i]").count()
                if csrf_count == 0:
                    security_issues.append("No visible CSRF token found in form")
                    findings.append({"type": "missing_csrf", "severity": "MEDIUM", "message": "No CSRF token detected in login form"})

                # Check for rate limiting indicators
                rate_limit_meta = await page.locator("meta[name*=rate], meta[content*=rate]").count()

                steps[-1].update({
                    "status": "warning" if security_issues else "pass",
                    "detail": "; ".join(security_issues) if security_issues else "Security checks passed"
                })

                # Step 5: Try empty submit (validation check)
                if has_buttons:
                    steps.append({"step": "validation_check", "status": "running", "detail": "Testing form validation"})
                    submit_sel = "button[type=submit], input[type=submit], button:has-text('Login'), button:has-text('Sign in'), button:has-text('Submit')"
                    submit_count = await page.locator(submit_sel).count()
                    if submit_count > 0:
                        await page.locator(submit_sel).first.click()
                        await asyncio.sleep(0.8)
                        # Check for validation messages
                        error_sel = "[role=alert], .error, .invalid, [aria-invalid=true], :invalid"
                        error_count = await page.locator(error_sel).count()
                        steps[-1].update({
                            "status": "pass",
                            "detail": f"Form shows validation on empty submit — {error_count} error indicators"
                        })
                        if error_count == 0:
                            findings.append({"type": "no_validation", "severity": "LOW", "message": "No visible validation on empty form submit"})
                    else:
                        steps[-1].update({"status": "info", "detail": "No submit button found"})

            elif flow_type == "navigation":
                steps.append({"step": "check_links", "status": "running", "detail": "Checking page links"})
                link_count = await page.locator("a[href]").count()
                broken = 0
                steps[-1].update({"status": "pass", "detail": f"Found {link_count} links"})

            # Final: Capture page state
            page_url = page.url
            page_title = await page.title()

        except Exception as e:
            steps.append({"step": "error", "status": "fail", "detail": str(e)})
            findings.append({"type": "page_error", "severity": "HIGH", "message": str(e)})

        finally:
            await browser.close()

    passed = sum(1 for s in steps if s["status"] == "pass")
    warnings = sum(1 for s in steps if s["status"] == "warning")
    failed = sum(1 for s in steps if s["status"] == "fail")

    return {
        "url": url,
        "flow_type": flow_type,
        "summary": {
            "total_steps": len(steps),
            "passed": passed,
            "warnings": warnings,
            "failed": failed,
            "final_url": page_url if 'page_url' in dir() else url,
        },
        "steps": steps,
        "findings": findings,
        "security_score": max(0, 100 - len([f for f in findings if f["severity"] in ("CRITICAL", "HIGH")]) * 25 - len([f for f in findings if f["severity"] == "MEDIUM"]) * 10),
    }


def run_url_check(url: str, flow_type: str = "login", username: str = "", password: str = "") -> dict:
    return asyncio.run(check_url_flow(url, flow_type, username, password))
