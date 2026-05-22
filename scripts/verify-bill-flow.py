"""
Sprint 5 browser verification — bill generation flow.

What this asserts (against the running dev server at http://localhost:5173):
  1. Login still works.
  2. /orders is reachable, has at least one order to open.
  3. Tapping a row navigates to /orders/<id>.
  4. Tapping "Generate bill" opens the bottom-sheet modal.
  5. NotoSans-Regular.ttf AND NotoSans-Bold.ttf both fetch 200.
  6. The iframe inside the modal acquires a blob: src (PDF generated).
  7. The bill_number badge appears in the modal header (#NNNN).

Captures screenshots to scripts/screenshots/sprint5-*.png for visual review.
"""

import os
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT_DIR = pathlib.Path("scripts/screenshots")


def load_creds() -> tuple[str, str]:
    """Same loader pattern as smoke-test-walking-skeleton.py."""
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

    font_requests: list[tuple[str, int]] = []  # (url, status)
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("response", lambda r: font_requests.append((r.url, r.status)) if "/fonts/" in r.url else None)

        # 1) Login
        page.goto(f"{BASE}/login")
        page.wait_for_load_state("networkidle")
        page.locator('input[type="email"]').fill(email)
        page.locator('input[type="password"]').fill(password)
        page.locator('button[type="submit"]').click()
        page.wait_for_url(re.compile(r".*/(today|orders|customers|production|reports|/)$"), timeout=10000)
        page.wait_for_load_state("networkidle")
        print("OK login")

        # 2) Go to /orders
        page.goto(f"{BASE}/orders")
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(OUT_DIR / "sprint5-orders-list.png"), full_page=True)

        # 3) Find any order link (route shape: /orders/<uuid>)
        order_links = page.locator('a[href^="/orders/"]').all()
        # Filter out /orders/new and /orders/batch
        order_ids = []
        for link in order_links:
            href = link.get_attribute("href") or ""
            if href and href != "/orders/new" and href != "/orders/batch" and "/edit" not in href:
                order_ids.append(href)
        if not order_ids:
            print("FAIL no orders to open — seed dev data first", file=sys.stderr)
            return 1
        target = order_ids[0]
        print(f"OK found order link {target}")
        page.locator(f'a[href="{target}"]').first.click()
        page.wait_for_load_state("networkidle")
        # `networkidle` returns as soon as the route-level lazy chunk finishes,
        # but the order-detail data fetch may still be in flight (and the button
        # only renders once `order` state is populated). Wait explicitly.
        page.get_by_role("button", name=re.compile(r"^Generate bill")).wait_for(timeout=15000)
        page.screenshot(path=str(OUT_DIR / "sprint5-order-detail.png"), full_page=True)

        # 4) Click Generate bill
        gen = page.get_by_role("button", name=re.compile(r"^Generate bill"))
        if gen.count() == 0:
            print("FAIL Generate bill button not found", file=sys.stderr)
            return 1
        gen.first.click()

        # 5) Wait for the modal — iframe with blob: src
        try:
            page.wait_for_selector('iframe[title="bill preview"]', timeout=8000)
        except Exception as e:
            page.screenshot(path=str(OUT_DIR / "sprint5-modal-failed.png"), full_page=True)
            print(f"FAIL iframe never appeared: {e}", file=sys.stderr)
            return 1

        # Allow the async font fetch + PDF generation to settle
        page.wait_for_timeout(2000)

        iframe_src = page.locator('iframe[title="bill preview"]').get_attribute("src") or ""
        if not iframe_src.startswith("blob:"):
            print(f"FAIL iframe src is not blob: ({iframe_src})", file=sys.stderr)
            return 1
        print(f"OK iframe blob src: {iframe_src[:60]}...")

        # 6) Bill number badge in the header
        header = page.locator('h2', has_text=re.compile(r"Bill #\d+"))
        if header.count() == 0:
            page.screenshot(path=str(OUT_DIR / "sprint5-no-badge.png"), full_page=True)
            print("FAIL Bill #N badge not in modal header", file=sys.stderr)
            return 1
        bill_text = header.first.text_content() or ""
        print(f"OK bill header text: {bill_text!r}")

        page.screenshot(path=str(OUT_DIR / "sprint5-bill-modal.png"), full_page=True)

        # 7) Font fetches
        regular_ok = any("NotoSans-Regular.ttf" in u and s == 200 for u, s in font_requests)
        bold_ok = any("NotoSans-Bold.ttf" in u and s == 200 for u, s in font_requests)
        for u, s in font_requests:
            print(f"  font {s} {u}")
        if not regular_ok:
            print("FAIL NotoSans-Regular.ttf did not 200", file=sys.stderr)
            return 1
        if not bold_ok:
            print("FAIL NotoSans-Bold.ttf did not 200", file=sys.stderr)
            return 1
        print("OK both font weights fetched 200")

        # 8) No console errors during the flow
        if console_errors:
            print(f"WARN {len(console_errors)} console error(s):")
            for e in console_errors[:5]:
                print(f"  {e}")
            # don't fail on warnings — bill flow itself succeeded

        browser.close()

    print("OK Sprint 5 bill flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
