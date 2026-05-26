"""
Inline add-customer smoke — Part A2.

Proves that the AddCustomerInlineModal inside the /orders/new Customer step
creates a customer and selects it WITHOUT triggering a page reload (i.e. the
portal-based fix from Part A is working correctly).

What this asserts (against a running preview/dev server):
  1. Login works.
  2. Navigate to /orders/new — the "Log new order" heading is present.
  3. The Customer step is expanded by default; click "+ New customer" to open
     the inline modal.
  4. Set a JS sentinel (window.__noReload = true) on the page — if a reload
     fires, the sentinel disappears.
  5. Fill the modal: unique sentinel name + a channel chip, leave phone blank.
  6. Click "Add".
  7. ASSERT no-reload: the sentinel is still truthy after the modal closes.
  8. ASSERT customer selected: the Customer step header summary now shows the
     sentinel name (the accordion collapsed to summary view after selection).
  9. ASSERT DB row: query via authed PostgREST — a customers row with the
     exact sentinel name exists.
  10. CLEANUP (finally): DELETE the created customer row via PostgREST so the
      run is idempotent and leaves no test data behind.

Run against the prod build (recommended):
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \\
        --server "npm run preview" --port 4173 --timeout 60 \\
        python scripts/verify-inline-add-customer.py --url http://localhost:4173

Or against the dev server:
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \\
        --server "npm run dev" --port 5173 \\
        python scripts/verify-inline-add-customer.py
"""

import argparse
import io
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# Force UTF-8 stdout/stderr on Windows so → ✓ ✗ render cleanly.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

OUT_DIR = pathlib.Path("scripts/screenshots")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Inline add-customer smoke test")
    p.add_argument("--url", default="http://localhost:5173", help="Base URL of the running app")
    p.add_argument(
        "--browser",
        default="chromium",
        choices=["chromium", "firefox", "webkit"],
        help="Playwright browser engine (default: chromium)",
    )
    return p.parse_args()


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


def load_supabase_config() -> tuple[str, str]:
    """Return (project_url, anon_key) from .env.local."""
    path = pathlib.Path(".env.local")
    url = anon = None
    if path.exists():
        pat_posh = re.compile(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        pat_kv = re.compile(r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$')
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = pat_posh.match(line) or pat_kv.match(line)
            if not m:
                continue
            k, v = m.group(1), m.group(2).strip()
            if k == "VITE_SUPABASE_URL":
                url = v
            elif k in ("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"):
                anon = v
    if not url or not anon:
        print("ERROR: VITE_SUPABASE_URL / publishable key not found in .env.local", file=sys.stderr)
        sys.exit(2)
    return url, anon


def get_jwt_from_page(page) -> str | None:
    """Grab the Supabase access_token from localStorage."""
    return page.evaluate(
        """() => {
            for (const k of Object.keys(localStorage)) {
                if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                    try {
                        const v = JSON.parse(localStorage.getItem(k));
                        return v && v.access_token ? v.access_token : null;
                    } catch (_) {}
                }
            }
            return null;
        }"""
    )


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


def rest_delete_customer_by_name(jwt: str, supabase_url: str, anon_key: str, name: str) -> bool:
    """DELETE /rest/v1/customers?name=eq.<name> using the authenticated JWT."""
    try:
        encoded_name = urllib.parse.quote(name, safe="")
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/customers?name=eq.{encoded_name}",
            method="DELETE",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {jwt}",
                "Prefer": "return=minimal",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"  WARN REST DELETE failed: {e}")
        return False


def rest_get_customer_by_name(jwt: str, supabase_url: str, anon_key: str, name: str) -> list[dict]:
    """GET /rest/v1/customers?name=eq.<name> and return parsed JSON rows."""
    import json
    encoded_name = urllib.parse.quote(name, safe="")
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/customers?name=eq.{encoded_name}&select=id,name",
        method="GET",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    args = parse_args()
    base = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()
    supabase_url, anon_key = load_supabase_config()

    ts = int(time.time() * 1000)
    sentinel_name = f"ZZSMOKE Inline {ts}"

    console_errors: list[str] = []
    jwt: str | None = None

    with sync_playwright() as p:
        browser = getattr(p, args.browser).launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        try:
            # 1) Login
            do_login(page, base, email, password)
            print("✓ login")

            # Grab JWT now that the session is established.
            jwt = get_jwt_from_page(page)
            if not jwt:
                print("FAIL could not extract JWT from localStorage", file=sys.stderr)
                return 1

            # 2) Navigate to /orders/new
            page.goto(f"{base}/orders/new")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('h1:has-text("Log new order")', timeout=8000)
            print("✓ /orders/new loaded")

            # 3) Customer step is expanded by default (useState='customer').
            #    Click "+ New customer" (rendered when search box is empty).
            page.wait_for_selector('button:has-text("+ New customer")', timeout=5000)
            page.screenshot(path=str(OUT_DIR / "inline-add-01-before-open.png"), full_page=True)
            page.locator('button:has-text("+ New customer")').first.click()

            # Modal should be open — title "New customer"
            page.wait_for_selector('h2:has-text("New customer")', timeout=5000)
            print("✓ AddCustomerInlineModal opened")
            page.screenshot(path=str(OUT_DIR / "inline-add-02-modal-open.png"), full_page=True)

            # 4) Set no-reload sentinel BEFORE clicking "Add"
            page.evaluate("() => { window.__noReload = true; }")

            # 5) Fill the modal: name + channel chip (leave phone blank)
            name_input = page.locator('h2:has-text("New customer") ~ form input').first
            # The form's first input (Name) follows the h2 in the modal DOM.
            # Use a more robust approach: wait for the modal dialog to be present
            # then locate the name input by the label text inside the modal.
            name_input = page.locator('[role="dialog"] input').first
            name_input.fill(sentinel_name)

            # Wait for channel chips to load (async useEffect in ChannelChipPicker)
            page.wait_for_selector('[role="dialog"] button:has-text("Personal")', timeout=8000)
            page.locator('[role="dialog"] button:has-text("Personal")').first.click()

            # Confirm the "Add" button is now enabled (canSubmit: name + channelId set)
            add_btn = page.locator('[role="dialog"] button[type="submit"]')
            add_btn.wait_for(state="visible", timeout=3000)

            # Record the URL before submission to compare after
            url_before = page.url

            # 6) Click "Add"
            page.screenshot(path=str(OUT_DIR / "inline-add-03-before-add.png"), full_page=True)
            add_btn.click()

            # Wait for the modal to close (h2 "New customer" disappears)
            try:
                page.wait_for_selector('h2:has-text("New customer")', state="hidden", timeout=8000)
            except PWTimeout:
                page.screenshot(path=str(OUT_DIR / "inline-add-FAIL-modal-stuck.png"), full_page=True)
                print("FAIL modal did not close after clicking Add", file=sys.stderr)
                return 1

            # Allow React state update to propagate
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT_DIR / "inline-add-04-after-add.png"), full_page=True)

            # 7) ASSERT: no-reload sentinel still lives
            sentinel_alive = page.evaluate("() => !!window.__noReload")
            if not sentinel_alive:
                print(
                    "FAIL page reloaded after clicking Add — sentinel window.__noReload was cleared",
                    file=sys.stderr,
                )
                return 1
            print("✓ no-reload: sentinel survived Add click")

            # 8) ASSERT: customer name appears in the Customer step summary
            #    After handleCustomer() runs, expandedStep moves to 'items', so
            #    the Customer step collapses and shows the name as its summary.
            try:
                page.wait_for_selector(f'button:has-text("{sentinel_name}")', timeout=5000)
            except PWTimeout:
                page.screenshot(path=str(OUT_DIR / "inline-add-FAIL-not-selected.png"), full_page=True)
                print(
                    f"FAIL customer {sentinel_name!r} not visible in step summary after Add",
                    file=sys.stderr,
                )
                return 1
            print(f"✓ customer selected in order form: {sentinel_name!r}")

            # Sanity: URL is still /orders/new
            if not page.url.endswith("/orders/new"):
                print(
                    f"FAIL URL changed after Add: expected …/orders/new, got {page.url!r}",
                    file=sys.stderr,
                )
                return 1
            print(f"✓ URL unchanged: {page.url}")

            # 9) ASSERT: row exists in DB via PostgREST
            try:
                rows = rest_get_customer_by_name(jwt, supabase_url, anon_key, sentinel_name)
            except Exception as e:
                print(f"FAIL PostgREST query failed: {e}", file=sys.stderr)
                return 1

            if not rows:
                print(
                    f"FAIL customers row with name={sentinel_name!r} not found in DB",
                    file=sys.stderr,
                )
                return 1
            print(f"✓ DB row confirmed: id={rows[0]['id']} name={rows[0]['name']!r}")

            # Console errors check — strict
            if console_errors:
                print(f"WARN {len(console_errors)} console error(s) during flow:")
                for e in console_errors[:10]:
                    print(f"  {e}")
                return 1

        finally:
            # 10) CLEANUP — delete the customer row via PostgREST
            #     Runs even if assertions above failed.
            print("---- cleanup ----")
            if jwt:
                ok = rest_delete_customer_by_name(jwt, supabase_url, anon_key, sentinel_name)
                if ok:
                    print(f"  deleted customer {sentinel_name!r}")
                else:
                    print(f"  WARN could not delete customer {sentinel_name!r} (may not have been created)")
            else:
                print("  skip cleanup — no JWT available")
            browser.close()

    print(f"\nPASS inline-add-customer smoke  sentinel={sentinel_name!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
