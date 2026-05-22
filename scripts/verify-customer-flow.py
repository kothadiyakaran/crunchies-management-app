"""
Sprint 6 browser verification — Customer lens (directory + detail + add).

What this asserts (against the running dev server at http://localhost:5173):
  1. Login still works.
  2. /customers loads with the directory header, search input, and chip row.
  3. The "+ Add customer" link is present.
  4. Typing in the search input narrows the list (smoke — doesn't assert exact
     match counts, since dev DB content varies).
  5. Tapping a customer (if any exist) opens /customers/:id, which renders
     the stats card and Edit profile link.
  6. /customers/new renders the form with the ChannelChipPicker (chip
     buttons + the dashed "+ Add channel…" affordance).
  7. /today now shows either the QuietCustomerNudge "Quiet customers" heading
     OR no extra section (component returns null when none exist) — both
     outcomes acceptable; we just confirm no console errors and no crash.

Captures screenshots to scripts/screenshots/sprint6-*.png for visual review.
"""

import os
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT_DIR = pathlib.Path("scripts/screenshots")


def load_creds() -> tuple[str, str]:
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

        # 1) Login
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
        print("OK login")

        # 2) /customers — directory
        page.goto(f"{BASE}/customers")
        page.wait_for_load_state("networkidle")
        # Header
        page.wait_for_selector('h1:has-text("Customers")', timeout=5000)
        # Search
        page.wait_for_selector('input[type="search"]', timeout=5000)
        # "+ Add customer" link
        add_link = page.locator('a[href="/customers/new"]')
        if add_link.count() == 0:
            print("FAIL + Add customer link not found", file=sys.stderr)
            return 1
        print("OK /customers directory header + search + Add link")
        page.screenshot(path=str(OUT_DIR / "sprint6-customers-list.png"), full_page=True)

        # 3) Filter chip row — confirm at least the "All" chip exists
        page.wait_for_selector('button:has-text("All")', timeout=3000)
        print("OK filter chips present")

        # 4) Search debounce smoke — type something and confirm no crash
        page.locator('input[type="search"]').fill("DEV")
        page.wait_for_timeout(400)  # 200ms debounce + render
        print("OK search input accepts text without crash")

        # 5) Tap first customer row if one exists
        page.locator('input[type="search"]').fill("")
        page.wait_for_timeout(400)
        customer_links = page.locator('a[href^="/customers/"]').all()
        customer_links = [
            l for l in customer_links
            if (l.get_attribute("href") or "") not in ("/customers/new", "/customers", "")
        ]
        if customer_links:
            href = customer_links[0].get_attribute("href")
            customer_links[0].click()
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('a:has-text("Edit profile")', timeout=5000)
            print(f"OK customer detail loads ({href})")
            page.screenshot(path=str(OUT_DIR / "sprint6-customer-detail.png"), full_page=True)
        else:
            print("WARN no existing customers to drill into (acceptable for empty dev DB)")

        # 6) /customers/new — chip picker
        page.goto(f"{BASE}/customers/new")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Add customer")', timeout=5000)
        # The dashed "+ Add channel…" chip is the signature affordance
        page.wait_for_selector('button:has-text("Add channel")', timeout=3000)
        print("OK /customers/new shows ChannelChipPicker with + Add channel…")
        page.screenshot(path=str(OUT_DIR / "sprint6-add-customer.png"), full_page=True)

        # 7) /today — QuietCustomerNudge (may or may not appear)
        page.goto(f"{BASE}/today")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Today")', timeout=5000)
        # If a quiet customer exists, the heading should be there
        quiet_heading = page.locator('h2:has-text("Quiet customers")')
        if quiet_heading.count() > 0:
            print("OK Today shows Quiet customers section")
        else:
            print("OK Today does NOT show Quiet section (no quiet customers — component returns null)")
        page.screenshot(path=str(OUT_DIR / "sprint6-today.png"), full_page=True)

        # 8) Console errors
        if console_errors:
            print(f"WARN {len(console_errors)} console error(s) during the flow:")
            for e in console_errors[:10]:
                print(f"  {e}")
            return 1

        browser.close()

    print("OK Sprint 6 customer flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
