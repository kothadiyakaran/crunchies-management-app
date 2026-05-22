"""
Sprint 8 browser verification — Reports (Week / Month / Trends).

What this asserts (against the running dev server at http://localhost:5173):
  1. Login as mom.
  2. /reports renders header "Reports" + 3 tabs (Week / Month / Trends).
  3. Default tab is Week — period selector renders. Either "May" appears in
     the header (real data), or the "No calibration data" fallback copy is
     present (empty-state).
  4. Click Month tab — URL contains `?tab=month` AND a "May 2026"-style
     label is visible.
  5. Click Trends tab — URL contains `?tab=trends` AND EITHER the
     "Trends become useful" empty state OR a `<svg>` element renders.
  6. Direct nav to /reports?tab=week&week=2026-05-04 — period selector
     shows "Mon 04 – Sun 10 May" (formatWeekLabel output).
  7. Take screenshots: sprint8-{week-default, month, trends, week-deeplink}.png.

Reports is a read-only surface (no mutations). The interactive paths covered
are tab switching (URL mutation via clicks) + query-param deep-link.

Prereq: a dev server must be running on http://localhost:5173. Start it with:
    npm run dev
in a separate terminal, then run this script.
"""

import os
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:5173"
OUT_DIR = pathlib.Path("scripts/screenshots")


def load_creds() -> tuple[str, str]:
    """Mirror Sprint 5/6/7 verify: env vars first, then .env.local."""
    env_email = os.environ.get("SMOKE_EMAIL")
    env_pw = os.environ.get("SMOKE_PASSWORD")
    if env_email and env_pw:
        return env_email, env_pw

    path = pathlib.Path(".env.local")
    if path.exists():
        pat_posh = re.compile(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        pat_kv = re.compile(r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        found: dict[str, str] = {}
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = pat_posh.match(line) or pat_kv.match(line)
            if m and m.group(1).startswith("SMOKE_"):
                found[m.group(1)] = m.group(2).strip()
        if "SMOKE_EMAIL" in found and "SMOKE_PASSWORD" in found:
            return found["SMOKE_EMAIL"], found["SMOKE_PASSWORD"]

    print("ERROR: SMOKE_EMAIL / SMOKE_PASSWORD not found", file=sys.stderr)
    sys.exit(2)


def do_login(page, email: str, password: str) -> None:
    page.goto(f"{BASE}/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').fill(email)
    page.locator('input[type="password"]').fill(password)
    page.locator('button[type="submit"]').click()
    page.wait_for_url(
        re.compile(r".*/(today|orders|customers|production|reports|/)$"),
        timeout=10000,
    )
    page.wait_for_load_state("networkidle")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()

    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        # 1) Login as mom
        do_login(page, email, password)
        print("OK login")

        # 2) /reports — header + 3 tabs
        page.goto(f"{BASE}/reports")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Reports")', timeout=5000)
        # Tab strip — buttons with role="tab"
        week_tab = page.locator('button[role="tab"]:has-text("Week")').first
        month_tab = page.locator('button[role="tab"]:has-text("Month")').first
        trends_tab = page.locator('button[role="tab"]:has-text("Trends")').first
        for tab, name in [(week_tab, "Week"), (month_tab, "Month"), (trends_tab, "Trends")]:
            if tab.count() == 0:
                print(f"FAIL {name} tab not found", file=sys.stderr)
                return 1
        # Default tab is Week — aria-selected on Week
        if week_tab.get_attribute("aria-selected") != "true":
            print(
                f"FAIL default tab is not Week (aria-selected="
                f"{week_tab.get_attribute('aria-selected')!r})",
                file=sys.stderr,
            )
            return 1
        print("OK /reports header + 3 tabs (Week default)")

        # 3) Week tab — period selector renders. Either "May" appears OR the
        # "No calibration data" fallback is present.
        # Period selector has aria-label="Previous week" and "Next week" buttons.
        page.wait_for_selector('button[aria-label="Previous week"]', timeout=5000)
        page.wait_for_selector('button[aria-label="Next week"]', timeout=5000)
        body_text = page.locator("body").inner_text()
        if "May" not in body_text and "No calibration data" not in body_text:
            print(
                "FAIL Week tab: neither 'May' nor 'No calibration data' fallback present",
                file=sys.stderr,
            )
            page.screenshot(path=str(OUT_DIR / "sprint8-week-default-failed.png"), full_page=True)
            return 1
        print("OK Week tab period selector + content render")
        page.screenshot(path=str(OUT_DIR / "sprint8-week-default.png"), full_page=True)

        # 4) Click Month tab — URL contains ?tab=month, label visible
        month_tab.click()
        page.wait_for_url(re.compile(r".*\?.*tab=month.*"), timeout=5000)
        page.wait_for_load_state("networkidle")
        # Month tab uses "May 2026"-style label via formatMonthLabel
        # (long month + numeric year). Wait for it.
        try:
            page.wait_for_function(
                """() => {
                    const txt = document.body.innerText || '';
                    return /\\b(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\b/.test(txt);
                }""",
                timeout=8000,
            )
        except PWTimeout:
            page.screenshot(path=str(OUT_DIR / "sprint8-month-failed.png"), full_page=True)
            print("FAIL Month tab: no '<Month> <Year>' label visible", file=sys.stderr)
            return 1
        # Aria-selected on Month
        if month_tab.get_attribute("aria-selected") != "true":
            print("FAIL Month tab not marked aria-selected after click", file=sys.stderr)
            return 1
        print("OK Month tab URL + month-year label")
        page.screenshot(path=str(OUT_DIR / "sprint8-month.png"), full_page=True)

        # 5) Click Trends tab — URL contains ?tab=trends. Either empty-state copy
        # OR an <svg> renders (data-dependent).
        trends_tab.click()
        page.wait_for_url(re.compile(r".*\?.*tab=trends.*"), timeout=5000)
        page.wait_for_load_state("networkidle")
        # Wait until either the empty-state copy or an <svg> appears.
        try:
            page.wait_for_function(
                """() => {
                    const txt = document.body.innerText || '';
                    if (/Trends become useful/i.test(txt)) return true;
                    return document.querySelector('svg') !== null;
                }""",
                timeout=8000,
            )
        except PWTimeout:
            page.screenshot(path=str(OUT_DIR / "sprint8-trends-failed.png"), full_page=True)
            print(
                "FAIL Trends tab: neither empty-state copy nor <svg> present",
                file=sys.stderr,
            )
            return 1
        if trends_tab.get_attribute("aria-selected") != "true":
            print("FAIL Trends tab not marked aria-selected after click", file=sys.stderr)
            return 1
        print("OK Trends tab URL + (empty-state or svg) renders")
        page.screenshot(path=str(OUT_DIR / "sprint8-trends.png"), full_page=True)

        # 6) Deep-link: /reports?tab=week&week=2026-05-04 → "Mon 04 – Sun 10 May"
        page.goto(f"{BASE}/reports?tab=week&week=2026-05-04")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('button[aria-label="Previous week"]', timeout=5000)
        # formatWeekLabel('2026-05-04') = "Mon 04 – Sun 10 May" (en-IN short).
        # The '–' is an en-dash (U+2013) per the source. Be flexible to either.
        try:
            page.wait_for_function(
                """() => {
                    const txt = document.body.innerText || '';
                    // Match "Mon 04 [–|-] Sun 10 May" with either dash flavour.
                    return /Mon\\s*0?4\\s*[\\u2013\\-]\\s*Sun\\s*10\\s*May/.test(txt);
                }""",
                timeout=8000,
            )
        except PWTimeout:
            page.screenshot(
                path=str(OUT_DIR / "sprint8-week-deeplink-failed.png"),
                full_page=True,
            )
            print(
                "FAIL Week deep-link: 'Mon 04 – Sun 10 May' label not found",
                file=sys.stderr,
            )
            return 1
        print("OK Week ?week=2026-05-04 deep-link renders 'Mon 04 – Sun 10 May'")
        page.screenshot(path=str(OUT_DIR / "sprint8-week-deeplink.png"), full_page=True)

        # 7) Console errors — be strict per memory feedback_advisor_before_done
        if console_errors:
            print(f"WARN {len(console_errors)} console error(s) during the flow:")
            for e in console_errors[:10]:
                print(f"  {e}")
            browser.close()
            return 1

        browser.close()

    print("OK Sprint 8 reports flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
