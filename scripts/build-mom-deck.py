"""
Build the PDF onboarding deck for Archana.

Pipeline:
  1. Launch a headless Chromium via Playwright.
  2. Log in to the live app at https://www.crunchies.app using SMOKE_EMAIL /
     SMOKE_PASSWORD (loaded from .env.local or process env).
  3. Visit each (route, output filename) pair, take a phone-aspect screenshot,
     save to docs/mom-onboarding/screenshots/.
  4. Open the local file docs/mom-onboarding/mom-deck.html (which references
     those screenshots via relative paths) and render it to PDF at
     docs/mom-onboarding/mom-deck.pdf using A5 portrait.

This script assumes demo data has been seeded ahead of time (see the SQL in
the commit message of this file). It does NOT seed or clean up — those are
manual MCP steps.

Usage:
  python scripts/build-mom-deck.py [--url <base>]

Default --url is https://www.crunchies.app. Override with http://localhost:4173
to render from a local prod-preview.
"""

from __future__ import annotations
import io
import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# Force UTF-8 on Windows consoles so stdout doesn't crash on emoji/glyphs.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

BASE = "https://www.crunchies.app"
for i, arg in enumerate(sys.argv):
    if arg == "--url" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]
        break

REPO = Path(__file__).resolve().parent.parent
DECK_DIR = REPO / "docs" / "mom-onboarding"
SCREENSHOT_DIR = DECK_DIR / "screenshots"
DECK_HTML = DECK_DIR / "mom-deck.html"
DECK_PDF = DECK_DIR / "mom-deck.pdf"
ENV_LOCAL = REPO / ".env.local"


def load_creds() -> tuple[str, str]:
    email = os.environ.get("SMOKE_EMAIL")
    pw = os.environ.get("SMOKE_PASSWORD")
    if email and pw:
        return email, pw
    if not ENV_LOCAL.exists():
        sys.exit("Missing SMOKE_EMAIL / SMOKE_PASSWORD (env or .env.local)")
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*(?:\$env:)?([A-Z_]+)\s*=\s*['\"]?([^'\"\n]+)['\"]?", line)
        if not m:
            continue
        if m.group(1) == "SMOKE_EMAIL":
            email = m.group(2)
        elif m.group(1) == "SMOKE_PASSWORD":
            pw = m.group(2)
    if not email or not pw:
        sys.exit("SMOKE_EMAIL / SMOKE_PASSWORD missing in .env.local")
    return email, pw


# (route, output filename, optional wait selector or None, optional viewport-height override)
# Viewport width fixed at 390 (modern phone). Height varies so the screenshot frames
# enough content above the fold.
SHOTS = [
    ("/",                              "today.png",            'h1:has-text("Today")',          760),
    ("/production",                    "production.png",       'h1:has-text("Production")',     760),
    ("/production/plan-this-week",     "plan-this-week.png",   'h1:has-text("Plan this week")', 700),
    ("/customers",                     "customers.png",        'h1:has-text("Customers")',      640),
    ("/reports?tab=week",              "reports.png",          'h1:has-text("Reports")',        820),
]

# Customer detail page needs an id we don't know up front — we navigate to the
# directory first, click the first row, then capture.
CUSTOMER_DETAIL_FILENAME = "customer-detail.png"


def do_login(page, email: str, pw: str):
    page.goto(f"{BASE}/login")
    page.wait_for_load_state("networkidle")
    page.locator("input[type=email]").fill(email)
    page.locator("input[type=password]").fill(pw)
    page.locator("button[type=submit]").click()
    page.wait_for_url(f"{BASE}/", timeout=15000)


def shot_route(ctx, route: str, filename: str, wait_sel: str | None, viewport_h: int):
    page = ctx.new_page()
    page.set_viewport_size({"width": 390, "height": viewport_h})
    page.goto(f"{BASE}{route}")
    page.wait_for_load_state("networkidle")
    if wait_sel:
        page.wait_for_selector(wait_sel, timeout=15000)
    # Tiny settle so any animations finish.
    page.wait_for_timeout(500)
    out = SCREENSHOT_DIR / filename
    page.screenshot(path=str(out), full_page=False)
    page.close()
    print(f"  shot {route} -> {out.relative_to(REPO)}")


def shot_customer_detail(ctx):
    page = ctx.new_page()
    page.set_viewport_size({"width": 390, "height": 760})
    page.goto(f"{BASE}/customers")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector('h1:has-text("Customers")', timeout=15000)
    # First customer link in the list — exclude the static /customers/new link.
    first = page.locator('a[href^="/customers/"]:not([href="/customers/new"])').first
    href = first.get_attribute("href")
    print(f"  -> navigating to {href}")
    first.click()
    # Wait for the customer detail signature: "Customer since" appears in the
    # header block once the row resolves.
    page.wait_for_selector('text=/Customer since/i', timeout=15000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    out = SCREENSHOT_DIR / CUSTOMER_DETAIL_FILENAME
    page.screenshot(path=str(out), full_page=False)
    page.close()
    print(f"  shot /customers/<id> -> {out.relative_to(REPO)}")


def render_pdf():
    """Render the deck HTML to PDF at A5 portrait."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(DECK_HTML.as_uri())
        page.wait_for_load_state("networkidle")
        page.emulate_media(media="screen")
        page.pdf(
            path=str(DECK_PDF),
            format="A5",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
        browser.close()
    print(f"  rendered {DECK_PDF.relative_to(REPO)}")


def main() -> int:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    email, pw = load_creds()

    print(f"BASE = {BASE}")
    print("\n[1/2] capturing screenshots")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        do_login(page, email, pw)
        page.close()

        for route, filename, sel, h in SHOTS:
            shot_route(ctx, route, filename, sel, h)
        shot_customer_detail(ctx)
        browser.close()

    print("\n[2/2] rendering PDF")
    render_pdf()
    print(f"\nDONE — {DECK_PDF.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
