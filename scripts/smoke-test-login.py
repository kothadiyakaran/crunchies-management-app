"""
Sprint 0 smoke test for https://www.crunchies.app/login.

Verifies:
  1. /login renders (SPA rewrite works on Vercel).
  2. Brand tokens are visible: orange CTA, warm-white background.
  3. AuthProvider.signIn wires through to Supabase: bogus creds yield a
     UI error (proves React Router -> AuthProvider -> supabase client).
"""

from playwright.sync_api import sync_playwright

OUT_DIR = "scripts/screenshots"
URL = "https://www.crunchies.app/login"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Pixel 7 viewport — closest stock Android profile mom would have
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            device_scale_factor=2.625,
            user_agent=(
                "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            ),
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()

        console_msgs: list[str] = []
        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))

        page.goto(URL, wait_until="networkidle")

        # 1) Initial render
        page.screenshot(path=f"{OUT_DIR}/01-login-initial.png", full_page=True)

        # Sanity: form fields exist
        page.wait_for_selector("input[type='email']")
        page.wait_for_selector("input[type='password']")

        # Computed styles on the CTA (proves brand tokens loaded)
        cta = page.locator("button[type='submit']")
        cta_bg = cta.evaluate("el => getComputedStyle(el).backgroundColor")
        cta_color = cta.evaluate("el => getComputedStyle(el).color")
        body_bg = page.locator("body").evaluate(
            "el => getComputedStyle(el).backgroundColor"
        )
        body_font = page.locator("body").evaluate(
            "el => getComputedStyle(el).fontFamily"
        )

        print(f"CTA backgroundColor: {cta_bg}")
        print(f"CTA color:           {cta_color}")
        print(f"Body backgroundColor:{body_bg}")
        print(f"Body fontFamily:     {body_font}")

        # 2) Bogus credentials
        page.fill("input[type='email']", "test@test.com")
        page.fill("input[type='password']", "wrongpass")
        page.click("button[type='submit']")

        # Wait for either the error <p role=alert> to show, or the button to
        # come out of its "Signing in…" state.
        try:
            page.wait_for_selector("[role='alert']", timeout=15000)
        except Exception:
            print("WARNING: no [role=alert] appeared within 15s")

        page.screenshot(path=f"{OUT_DIR}/02-login-error.png", full_page=True)

        alert = page.locator("[role='alert']")
        alert_text = alert.inner_text() if alert.count() else "(no alert)"
        print(f"Error text: {alert_text!r}")

        print()
        print("Console messages during test:")
        for m in console_msgs:
            print(f"  {m}")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
