"""
Sprint 1 smoke test for https://www.crunchies.app.

Verifies the walking skeleton:
  1. Login flow still works (re-runs the Sprint 0 assertions).
  2. After login, /today renders with the 6-tab bottom nav.
  3. Each tab is reachable and renders without console errors.
  4. (No mutating asserts — those stay manual until we have a dev DB.)

Credentials are read from (in order):
  1. process env (SMOKE_EMAIL, SMOKE_PASSWORD)
  2. .env.local in the project root — supports both `KEY=value` and
     PowerShell's `$env:KEY = "value"` syntax
"""

import os
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

OUT_DIR = "scripts/screenshots"
BASE = "https://www.crunchies.app"

TABS = ["Today", "Orders", "Customers", "Make", "Buy", "Reports"]

# Nav label -> page <h1> text (the h1 keeps the full noun; the nav shows the short verb).
TAB_H1 = {
    "Today": "Today",
    "Orders": "Orders",
    "Customers": "Customers",
    "Make": "Production",
    "Buy": "Purchases",
    "Reports": "Reports",
}


def _load_dotenv_local() -> dict[str, str]:
    """Parse .env.local and return any SMOKE_* values found.

    Accepts both Vite-style `KEY=value` and PowerShell-style
    `$env:KEY = "value"` lines, so a single .env.local can host both.
    """
    out: dict[str, str] = {}
    path = pathlib.Path(".env.local")
    if not path.exists():
        return out
    pat_posh = re.compile(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
    pat_kv = re.compile(r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = pat_posh.match(line) or pat_kv.match(line)
        if not m:
            continue
        key, value = m.group(1), m.group(2).strip()
        if key.startswith("SMOKE_"):
            out[key] = value
    return out


def main() -> int:
    creds = _load_dotenv_local()
    email = os.environ.get("SMOKE_EMAIL") or creds.get("SMOKE_EMAIL")
    password = os.environ.get("SMOKE_PASSWORD") or creds.get("SMOKE_PASSWORD")
    if not email or not password:
        print(
            "ERROR: set SMOKE_EMAIL and SMOKE_PASSWORD via env or .env.local",
            file=sys.stderr,
        )
        return 2

    pathlib.Path(OUT_DIR).mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
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
        errors: list[str] = []
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)

        # 1. Login
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill("input[type='email']", email)
        page.fill("input[type='password']", password)
        page.click("button[type='submit']")
        page.wait_for_url(f"{BASE}/today", timeout=10_000)
        page.screenshot(path=f"{OUT_DIR}/sprint1-01-today.png", full_page=True)

        # 2. Bottom nav present
        for label in TABS:
            page.wait_for_selector(f"nav[aria-label='Primary'] >> text={label}", timeout=5_000)

        # 3. Each tab navigable
        for label in TABS:
            page.click(f"nav[aria-label='Primary'] >> text={label}")
            page.wait_for_selector(f"h1:has-text('{TAB_H1[label]}')", timeout=5_000)
            page.screenshot(path=f"{OUT_DIR}/sprint1-tab-{label.lower()}.png", full_page=True)

        if errors:
            print("Console errors:", file=sys.stderr)
            for e in errors:
                print(f"  {e}", file=sys.stderr)
            return 1

        print("OK — Sprint 1 walking skeleton smoke passed.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
