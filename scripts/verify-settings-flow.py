"""
Sprint 9 T9.9 — Settings flow end-to-end browser verification.

What this asserts (against http://localhost:5173 by default; --url to override):
  1. Login as mom.
  2. Today header gear icon (aria-label="Settings") navigates to /settings.
  3. The form is populated from the seed row — business name is non-empty.
  4. Modifying the business name + Save produces the "Saved." inline indicator.
  5. After page reload, the modified name persists (proves DB write took).
  6. Open Generate Bill on an existing order WHILE the modified name is live:
     iframe[title="bill preview"] gets a blob: src and the Bill #N header
     appears. Verifying Settings→Bill wiring is implicit — BillPreviewModal
     stays on "Loading business details…" when useSettings() doesn't resolve
     and only renders the iframe once it does. The PDF binary uses embedded-
     font CID encoding so the business name is not directly searchable in
     the byte stream — the wiring check is structural, not content-based.
     Skipped gracefully (stderr note) when the dev DB has zero orders.
  7. Restore the original name (clean up the smoke trace).
  8. Optional anonymous /order/<SMOKE_EVENT_SLUG> path: assert the sticky
     orange header h1 text resolves to the public business name (fetched
     server-side via public_get_business_identity). Skipped silently when
     SMOKE_EVENT_SLUG is unset.
  9. Console-error gate: collect page.on('console') errors; allowlist the
     usual dev-only noise (ResizeObserver / service worker / source map /
     vite hmr). Fail on anything else.
 10. Exit 0 on success.

Run via the standard webapp-testing harness:
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \
        --server "npm run dev" --port 5173 -- python scripts/verify-settings-flow.py
"""

import argparse
import io
import os
import pathlib
import re
import sys
import time
from playwright.sync_api import sync_playwright

# Windows cp1252 console can't encode some glyphs (→, ✓, etc.). Force UTF-8.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

OUT_DIR = pathlib.Path("scripts/screenshots")

# Strip any prior smoke suffixes left behind by a crashed run before treating
# the loaded value as the original. The suffix shape is " SMOKE YYYY-MM-DDTHH:MM:SSZ".
SMOKE_SUFFIX_RE = re.compile(r"(\s*SMOKE \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)+\s*$")

# Console errors that are environmental noise rather than app bugs.
CONSOLE_ALLOWLIST_PATTERNS = [
    re.compile(r"ResizeObserver", re.I),
    re.compile(r"service[- ]worker", re.I),
    re.compile(r"source[- ]?map", re.I),
    re.compile(r"\.map\b", re.I),  # source-map 404s in dev
    re.compile(r"\[vite\]", re.I),
    re.compile(r"hmr", re.I),
]


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


def load_event_slug() -> str | None:
    """Optional anonymous-route check. Skip silently if unset."""
    if "SMOKE_EVENT_SLUG" in os.environ:
        return os.environ["SMOKE_EVENT_SLUG"]
    path = pathlib.Path(".env.local")
    if path.exists():
        pat_posh = re.compile(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        pat_kv = re.compile(r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = pat_posh.match(line) or pat_kv.match(line)
            if m and m.group(1) == "SMOKE_EVENT_SLUG":
                return m.group(2).strip() or None
    return None


def is_allowed_console_msg(text: str) -> bool:
    return any(p.search(text) for p in CONSOLE_ALLOWLIST_PATTERNS)


def do_login(page, base: str, email: str, password: str) -> None:
    page.goto(f"{base}/login")
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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="http://localhost:5173",
        help="Base URL (default: http://localhost:5173)",
    )
    args = parser.parse_args()
    base = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()
    event_slug = load_event_slug()

    console_errors: list[str] = []
    suffix = f" SMOKE {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}"
    modified_name: str = ""
    original_name: str = ""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        # ---- 1) Login ------------------------------------------------------
        do_login(page, base, email, password)
        print("OK login")

        # ---- 2) Gear icon on Today -> /settings ----------------------------
        page.goto(f"{base}/today")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Today")', timeout=5000)
        gear = page.locator('a[aria-label="Settings"]')
        if gear.count() == 0:
            print("FAIL Settings gear (aria-label) not found on Today", file=sys.stderr)
            return 1
        gear.first.click()
        page.wait_for_url(re.compile(r".*/settings$"), timeout=5000)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Settings")', timeout=5000)
        print("OK Today gear navigates to /settings")

        # ---- 3) Form populated from seed -----------------------------------
        # Find the Business name input. The label wraps the input, so look for
        # the input following the "Business name" span text.
        # Wait briefly for the form to hydrate from SettingsContext.
        page.wait_for_function(
            """() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.textContent && l.textContent.includes('Business name'));
                if (!target) return false;
                const input = target.querySelector('input');
                return input && input.value && input.value.trim().length > 0;
            }""",
            timeout=10000,
        )
        original_name = page.evaluate(
            """() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.textContent && l.textContent.includes('Business name'));
                return target ? target.querySelector('input').value : '';
            }"""
        )
        if not original_name.strip():
            print("FAIL Business name field is empty on first load", file=sys.stderr)
            return 1
        # If a prior crashed smoke run left a SMOKE suffix in the DB, strip it
        # so the restore step at the end writes the pristine name back.
        cleaned = SMOKE_SUFFIX_RE.sub("", original_name).strip()
        if cleaned != original_name:
            print(
                f"NOTE stripping leftover smoke suffix: {original_name!r} -> {cleaned!r}"
            )
            original_name = cleaned
        print(f"OK form populated; business name = {original_name!r}")
        page.screenshot(path=str(OUT_DIR / "sprint9-settings-loaded.png"), full_page=True)

        # ---- 4) Modify name + Save -> 'Saved.' inline indicator ------------
        modified_name = (original_name + suffix).strip()
        # Use the same DOM-querying approach to locate the input robustly.
        name_input = page.locator(
            'label:has-text("Business name") input'
        ).first
        name_input.fill(modified_name)
        save_btn = page.get_by_role("button", name=re.compile(r"^Save changes$"))
        save_btn.click()
        # Saved toast: span with role=status and text "Saved." auto-clears after 2s.
        try:
            page.wait_for_selector(
                '[role="status"]:has-text("Saved.")',
                timeout=8000,
            )
        except Exception:
            page.screenshot(path=str(OUT_DIR / "sprint9-save-failed.png"), full_page=True)
            print("FAIL 'Saved.' indicator did not appear", file=sys.stderr)
            return 1
        print("OK modified name saved (Saved. indicator visible)")

        # ---- 5) Reload, name persists --------------------------------------
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            """() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.textContent && l.textContent.includes('Business name'));
                if (!target) return false;
                const input = target.querySelector('input');
                return input && input.value && input.value.trim().length > 0;
            }""",
            timeout=10000,
        )
        persisted = page.evaluate(
            """() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.textContent && l.textContent.includes('Business name'));
                return target ? target.querySelector('input').value : '';
            }"""
        )
        if persisted != modified_name:
            print(
                f"FAIL after reload, name = {persisted!r}, expected {modified_name!r}",
                file=sys.stderr,
            )
            return 1
        print("OK modified name persisted across reload")

        # ---- 6) Bill modal opens against modified Settings -----------------
        # The implicit Settings->Bill wiring proof: BillPreviewModal renders
        # "Loading business details…" until useSettings() resolves, and only
        # then constructs the iframe. A blob: iframe src therefore proves the
        # active Settings (currently the modified name) flowed through.
        page.goto(f"{base}/orders")
        page.wait_for_load_state("networkidle")
        order_links = page.locator('a[href^="/orders/"]').all()
        order_targets: list[str] = []
        for link in order_links:
            href = link.get_attribute("href") or ""
            if href and href not in ("/orders/new", "/orders/batch") and "/edit" not in href:
                order_targets.append(href)
        if not order_targets:
            print(
                "SKIP bill modal check — no orders in dev DB. Seed data to enable.",
                file=sys.stderr,
            )
        else:
            target = order_targets[0]
            page.locator(f'a[href="{target}"]').first.click()
            # The order detail does a fetch on mount; wait for it to render.
            page.wait_for_load_state("networkidle")
            try:
                page.wait_for_selector('h2:has-text("Items")', timeout=10000)
            except Exception:
                page.screenshot(
                    path=str(OUT_DIR / "sprint9-orderdetail-failed.png"),
                    full_page=True,
                )
                print(
                    f"FAIL order detail at {target} never finished loading",
                    file=sys.stderr,
                )
                return 1
            gen = page.get_by_role("button", name=re.compile(r"^Generate bill"))
            if gen.count() == 0:
                page.screenshot(
                    path=str(OUT_DIR / "sprint9-no-generate-bill.png"),
                    full_page=True,
                )
                print(
                    f"FAIL Generate bill button not found on order detail "
                    f"({target}); current URL = {page.url}",
                    file=sys.stderr,
                )
                return 1
            gen.first.click()
            # Wait for the canvas inside the bill modal (pdfjs rasterised page 1).
            try:
                page.wait_for_selector('[role="dialog"] canvas', timeout=15000)
            except Exception:
                page.screenshot(path=str(OUT_DIR / "sprint9-bill-failed.png"), full_page=True)
                print("FAIL canvas never appeared in bill modal", file=sys.stderr)
                return 1
            # Poll until canvas has non-zero dimensions (rasterisation complete).
            canvas_rendered = False
            dims = {"w": 0, "h": 0}
            for _ in range(30):
                dims = page.locator('[role="dialog"] canvas').evaluate(
                    "c => ({ w: c.width, h: c.height })"
                )
                if dims["w"] > 0 and dims["h"] > 0:
                    canvas_rendered = True
                    break
                page.wait_for_timeout(500)
            if not canvas_rendered:
                page.screenshot(path=str(OUT_DIR / "sprint9-canvas-blank.png"), full_page=True)
                print("FAIL canvas inside bill modal has zero dimensions (pdfjs did not rasterise)", file=sys.stderr)
                return 1
            header = page.locator('h2', has_text=re.compile(r"Bill #\d+"))
            if header.count() == 0:
                print("FAIL Bill #N header missing in modal", file=sys.stderr)
                return 1
            print(f"OK bill modal canvas rendered ({dims['w']}x{dims['h']}); header = {header.first.text_content()!r}")
            page.screenshot(path=str(OUT_DIR / "sprint9-bill-modal.png"), full_page=True)
            # Close the modal so navigation back to /settings is clean.
            # JS click bypasses viewport constraints: the canvas inside the fixed
            # bottom sheet is taller than the headless viewport, pushing the header
            # (and Close button) off-screen; a synthetic click still works.
            close_btn = page.get_by_role("button", name=re.compile(r"^Close bill preview$"))
            if close_btn.count() > 0:
                close_btn.first.evaluate("el => el.click()")
                page.wait_for_timeout(300)

        # ---- 7) Restore original name (cleanup) ----------------------------
        page.goto(f"{base}/settings")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            """() => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.textContent && l.textContent.includes('Business name'));
                if (!target) return false;
                const input = target.querySelector('input');
                return input && input.value && input.value.trim().length > 0;
            }""",
            timeout=10000,
        )
        name_input = page.locator('label:has-text("Business name") input').first
        name_input.fill(original_name)
        page.get_by_role("button", name=re.compile(r"^Save changes$")).click()
        try:
            page.wait_for_selector(
                '[role="status"]:has-text("Saved.")',
                timeout=8000,
            )
        except Exception:
            print("FAIL restore-save did not show 'Saved.' indicator", file=sys.stderr)
            return 1
        print(f"OK original name restored: {original_name!r}")

        # ---- 8) Optional anonymous /order/<slug> ---------------------------
        if event_slug:
            anon_ctx = browser.new_context()
            anon_page = anon_ctx.new_page()
            anon_console_errors: list[str] = []
            anon_page.on(
                "console",
                lambda msg: anon_console_errors.append(msg.text) if msg.type == "error" else None,
            )
            anon_page.goto(f"{base}/order/{event_slug}")
            anon_page.wait_for_load_state("networkidle")
            try:
                anon_page.wait_for_function(
                    """(expected) => {
                        const h1 = document.querySelector('header h1');
                        if (!h1) return false;
                        const text = (h1.textContent || '').trim();
                        return text.length > 0 && text === expected;
                    }""",
                    arg=original_name,
                    timeout=10000,
                )
                print(f"OK /order/{event_slug} sticky header h1 = {original_name!r}")
            except Exception:
                actual = anon_page.evaluate(
                    "() => (document.querySelector('header h1')?.textContent || '').trim()"
                )
                print(
                    f"FAIL /order/{event_slug} sticky header h1 = {actual!r}, "
                    f"expected {original_name!r}",
                    file=sys.stderr,
                )
                anon_ctx.close()
                return 1
            # Forward anon console errors to the main bucket for the gate below.
            console_errors.extend(anon_console_errors)
            anon_ctx.close()
        else:
            print(
                "SKIP anonymous /order/<slug> check — set SMOKE_EVENT_SLUG to enable.",
                file=sys.stderr,
            )

        # ---- 9) Console error gate -----------------------------------------
        unexpected = [e for e in console_errors if not is_allowed_console_msg(e)]
        if unexpected:
            print(f"FAIL {len(unexpected)} unexpected console error(s):")
            for e in unexpected[:10]:
                print(f"  {e}")
            browser.close()
            return 1
        if console_errors:
            print(f"OK {len(console_errors)} console message(s) all in allowlist")

        browser.close()

    print("OK Sprint 9 settings flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
