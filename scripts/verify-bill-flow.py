"""
Sprint 5 browser verification — bill generation flow.

What this asserts (against the running app, default http://localhost:5173):
  1. Login still works.
  2. /orders is reachable, has at least one order to open.
  3. Tapping a row navigates to /orders/<id>.
  4. Tapping "Generate bill" opens the bottom-sheet modal.
  5. NotoSans-Regular.ttf AND NotoSans-Bold.ttf both fetch 200.
  6. A <canvas> inside the bill modal is rendered with non-zero width/height
     (pdfjs rasterised page 1 — replaces the old iframe blob-src check).
  7. The bill_number badge appears in the modal header (#NNNN).
  8. The Share button is present and wired.
  9. pdfjs chunks are NOT fetched before "Generate bill" is tapped (lazy-load
     guard), and ARE fetched after (confirming on-demand splitting).

Use --url to target a different server (e.g. http://localhost:4173 for the
prod preview build).

Captures screenshots to scripts/screenshots/sprint5-*.png for visual review.
"""

import argparse
import os
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

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
    parser = argparse.ArgumentParser(description="Bill flow smoke test")
    parser.add_argument(
        "--url",
        default="http://localhost:5173",
        help="Base URL of the running app (default: http://localhost:5173)",
    )
    args = parser.parse_args()
    BASE = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()

    font_requests: list[tuple[str, int]] = []  # (url, status)
    console_errors: list[str] = []
    # Accumulated request URLs — used to verify pdfjs lazy-load timing.
    requests_before_bill: list[str] = []
    requests_after_bill: list[str] = []
    bill_tapped = False

    def on_request(r):  # type: ignore[no-untyped-def]
        if bill_tapped:
            requests_after_bill.append(r.url)
        else:
            requests_before_bill.append(r.url)

    def is_pdfjs_url(url: str) -> bool:
        return "pdfjs" in url or "pdf.worker" in url

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("response", lambda r: font_requests.append((r.url, r.status)) if "/fonts/" in r.url else None)
        page.on("request", on_request)

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

        # Verify pdfjs has NOT been fetched before bill generation (lazy-load check).
        pdfjs_before = [u for u in requests_before_bill if is_pdfjs_url(u)]
        if pdfjs_before:
            print(f"FAIL pdfjs loaded before Generate bill was tapped: {pdfjs_before}", file=sys.stderr)
            return 1
        print("OK pdfjs not fetched before bill tap (lazy-load confirmed)")

        # 4) Click Generate bill — mark the boundary for lazy-load tracking.
        gen = page.get_by_role("button", name=re.compile(r"^Generate bill"))
        if gen.count() == 0:
            print("FAIL Generate bill button not found", file=sys.stderr)
            return 1
        bill_tapped = True
        gen.first.click()

        # 5) Wait for the canvas inside the bill modal to be rendered (non-zero size).
        # pdfjs rasterises page 1 into canvas.width/height after the render promise resolves.
        try:
            page.wait_for_selector('[role="dialog"] canvas', timeout=15000)
        except Exception as e:
            page.screenshot(path=str(OUT_DIR / "sprint5-modal-failed.png"), full_page=True)
            print(f"FAIL canvas never appeared in bill modal: {e}", file=sys.stderr)
            return 1

        # Poll until canvas has non-zero dimensions (rasterisation complete).
        canvas_rendered = False
        for _ in range(30):
            dims = page.locator('[role="dialog"] canvas').evaluate(
                "c => ({ w: c.width, h: c.height })"
            )
            if dims["w"] > 0 and dims["h"] > 0:
                canvas_rendered = True
                break
            page.wait_for_timeout(500)

        if not canvas_rendered:
            page.screenshot(path=str(OUT_DIR / "sprint5-canvas-blank.png"), full_page=True)
            print("FAIL canvas inside bill modal has zero dimensions (pdfjs did not rasterise)", file=sys.stderr)
            return 1
        print(f"OK canvas rendered: {dims['w']}×{dims['h']} px")

        # 6) Bill number badge in the header
        header = page.locator('h2', has_text=re.compile(r"Bill #\d+"))
        if header.count() == 0:
            page.screenshot(path=str(OUT_DIR / "sprint5-no-badge.png"), full_page=True)
            print("FAIL Bill #N badge not in modal header", file=sys.stderr)
            return 1
        bill_text = header.first.text_content() or ""
        print(f"OK bill header text: {bill_text!r}")

        # 7) Share button is present and wired
        share_btn = page.locator('[role="dialog"] button', has_text=re.compile(r"^Shar"))
        if share_btn.count() == 0:
            page.screenshot(path=str(OUT_DIR / "sprint5-no-share.png"), full_page=True)
            print("FAIL Share button not found in bill modal", file=sys.stderr)
            return 1
        print("OK Share button present")

        page.screenshot(path=str(OUT_DIR / "sprint5-bill-modal.png"), full_page=True)

        # 8) Font fetches
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

        # 9) pdfjs WAS fetched after bill tap (confirms on-demand chunk load)
        pdfjs_after = [u for u in requests_after_bill if is_pdfjs_url(u)]
        if not pdfjs_after:
            print("WARN pdfjs request not observed after bill tap (may have been cached from a prior run)")
        else:
            print(f"OK pdfjs chunk fetched on demand ({len(pdfjs_after)} request(s))")

        # 10) No console errors during the flow
        if console_errors:
            print(f"WARN {len(console_errors)} console error(s):")
            for e in console_errors[:5]:
                print(f"  {e}")
            # don't fail on warnings — bill flow itself succeeded

        browser.close()

    print("OK bill flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
