"""
Discounts feature smoke test (Improvement #4).

Verifies the per-order discount flow end-to-end against a running app:

  1. Login works.
  2. Reseller inherit → 20% prefill: a customer in the Reseller channel with a
     NULL discount_percent (inherit) prefills the order form's Discount step to
     "20" (channels.default_discount_percent for Reseller, seeded in 0008).
  3. Per-order override persists: editing the prefilled value to 30, completing
     the order, and saving writes orders.discount_percent = 30 (the snapshot).
  4. Order-detail discounted display: /orders/<id> shows "Discount (30%)" + a
     "Total", and the bill PDF canvas renders (the discounted bill path doesn't
     crash).
  5. Personal explicit 10% prefill: a Personal-channel customer with an explicit
     discount_percent = 10 prefills the Discount step to "10" (explicit value
     overrides the channel default of 0).
  6. No unexpected console errors during the flow (gate, allowlist mirrored from
     verify-launch-readiness.py).

IDEMPOTENT + SELF-CLEANING. Runs against the SINGLE LIVE prod database (no
staging), so it creates its OWN throwaway data via the Supabase REST API
(customers → order → order_items) and tears it all down in a try/finally —
even on failure. It NEVER mutates pre-existing rows.

Setup/teardown plumbing (JWT from localStorage, .env.local creds, REST calls)
is copied from verify-revert-flow.py.

Run via the standard webapp-testing harness against the prod preview build:
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \
        --server "npm run preview -- --port 4173" --port 4173 -- \
        python scripts/verify-discounts-flow.py --url http://localhost:4173

Smoke surface prefix: "ZZSMOKE Disc {R|P} {epoch_ms}" on the throwaway customers
so any leftover row from a crashed run is greppable in the DB.
"""

import argparse
import io
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

# Force UTF-8 stdout/stderr on Windows so → ✓ ✗ render cleanly.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

OUT_DIR = pathlib.Path("scripts/screenshots")

# Mirror of verify-launch-readiness.py — benign dynamic-import / dev-tooling
# noise that must not fail the gate.
CONSOLE_ALLOWLIST_PATTERNS = [
    re.compile(r"ResizeObserver", re.I),
    re.compile(r"service[- ]worker", re.I),
    re.compile(r"source[- ]?map", re.I),
    re.compile(r"\.map\b", re.I),
    re.compile(r"\[vite\]", re.I),
    re.compile(r"hmr", re.I),
    re.compile(r"error loading dynamically imported module", re.I),
    re.compile(r"The above error occurred", re.I),
    re.compile(r"^Error$"),
]


def is_allowed_console_msg(text: str) -> bool:
    return any(p.search(text) for p in CONSOLE_ALLOWLIST_PATTERNS)


def load_creds() -> tuple[str, str]:
    """Same loader pattern as verify-revert-flow.py — env first, then .env.local."""
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


def load_supabase_env() -> tuple[str | None, str | None]:
    """Parse VITE_SUPABASE_URL + anon/publishable key from .env.local."""
    env = pathlib.Path(".env.local")
    url = anon = None
    if env.exists():
        for raw in env.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line) \
                or re.match(r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line)
            if not m:
                continue
            if m.group(1) == "VITE_SUPABASE_URL":
                url = m.group(2).strip()
            elif m.group(1) in ("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"):
                anon = m.group(2).strip()
    return url, anon


def today_ist() -> str:
    from datetime import datetime, timedelta, timezone
    IST = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(IST).strftime("%Y-%m-%d")


def read_jwt(page) -> str | None:
    """Read the Supabase access_token from localStorage (key sb-<ref>-auth-token)."""
    return page.evaluate(
        """() => {
            for (const k of Object.keys(localStorage)) {
                if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                    try {
                        const v = JSON.parse(localStorage.getItem(k));
                        return v.access_token;
                    } catch (e) { /* fallthrough */ }
                }
            }
            return null;
        }"""
    )


class Rest:
    """Thin Supabase REST helper. RLS grants `authenticated` full table access."""

    def __init__(self, url: str, anon: str, token: str):
        self.url = url.rstrip("/")
        self.anon = anon
        self.token = token

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "apikey": self.anon,
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    def get(self, path: str) -> list:
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{path}", method="GET", headers=self._headers()
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def insert(self, table: str, row: dict) -> dict:
        body = json.dumps(row).encode("utf-8")
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{table}",
            data=body,
            method="POST",
            headers=self._headers({"Prefer": "return=representation"}),
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data[0] if isinstance(data, list) else data

    def delete(self, table: str, col: str, value: str) -> bool:
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{table}?{col}=eq.{value}",
            method="DELETE",
            headers=self._headers({"Prefer": "return=minimal"}),
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300


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


def pick_customer_on_order_form(page, base: str, name: str) -> None:
    """Open /orders/new, search the CustomerSearchPicker for `name`, click the
    matching result row. Waits for hydration (the form's <h1> + search input)."""
    page.goto(f"{base}/orders/new")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector('h1:has-text("Log new order")', timeout=10000)
    search = page.locator('input[placeholder="Search customer name"]')
    search.wait_for(timeout=10000)
    search.fill(name)
    page.wait_for_timeout(400)  # 200ms debounce + search round-trip
    page.locator(f'button:has-text("{name}")').first.click()
    # Picker collapses to a summary card showing the chosen name.
    page.wait_for_selector(f'text="{name}"', timeout=5000)


def expand_discount_step(page) -> None:
    """Click the Discount step header to expand it, then wait for the input.

    The StepHeader button's accessible name is the badge (✓, since the Discount
    step's complete=true) + "Discount" + the collapsed "{n}%" summary, so match
    on the "Discount" substring rather than an anchored exact name.
    """
    page.get_by_role("button", name=re.compile(r"Discount")).first.click()
    page.locator('input[aria-label="discount-percent"]').wait_for(timeout=5000)


def wait_discount_value(page, expected: str, timeout_ms: int = 6000) -> str:
    """The Discount step pre-fill is set by an async getCustomerLite fetch, so the
    input can momentarily read its initial '0' before the resolved value lands.
    Poll until it equals `expected` (or the timeout elapses), then return whatever
    it currently is so the caller can assert + report the actual value."""
    inp = page.locator('input[aria-label="discount-percent"]')
    deadline = time.time() + timeout_ms / 1000
    val = inp.input_value()
    while val != expected and time.time() < deadline:
        page.wait_for_timeout(150)
        val = inp.input_value()
    return val


def main() -> int:
    parser = argparse.ArgumentParser(description="Discounts feature smoke test")
    parser.add_argument("--url", default="http://localhost:5173")
    args = parser.parse_args()
    BASE = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()
    sb_url, sb_anon = load_supabase_env()
    if not sb_url or not sb_anon:
        print("ERROR: VITE_SUPABASE_URL / anon key not found in .env.local", file=sys.stderr)
        return 2

    ts = str(int(time.time() * 1000))
    name_r = f"ZZSMOKE Disc R {ts}"
    name_p = f"ZZSMOKE Disc P {ts}"
    console_errors: list[str] = []
    state: dict = {}  # ids of created rows
    failed = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        page.on("dialog", lambda d: d.accept())
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        page.on("pageerror", lambda exc: console_errors.append(f"PAGEERROR: {exc}"))

        rest: Rest | None = None
        try:
            # ---- 1) Login ----
            do_login(page, BASE, email, password)
            print("OK login")

            token = read_jwt(page)
            if not token:
                print("FAIL could not read Supabase JWT from localStorage", file=sys.stderr)
                return 1
            rest = Rest(sb_url, sb_anon, token)

            # ---- Setup: resolve channels + a product, create two customers ----
            reseller = rest.get("channels?select=id,name&name=eq.Reseller")
            personal = rest.get("channels?select=id,name&name=eq.Personal")
            if not reseller:
                print("FAIL no 'Reseller' system channel found", file=sys.stderr)
                return 1
            if not personal:
                print("FAIL no 'Personal' system channel found", file=sys.stderr)
                return 1
            reseller_id = reseller[0]["id"]
            personal_id = personal[0]["id"]

            products = rest.get("products?select=id&limit=1")
            if not products:
                print("FAIL no products in catalogue", file=sys.stderr)
                return 1
            product_id = products[0]["id"]

            # Reseller customer, discount_percent omitted → NULL → inherits 20.
            cust_r = rest.insert(
                "customers", {"name": name_r, "channel_id": reseller_id}
            )
            state["customer_r_id"] = cust_r["id"]
            # Personal customer, explicit 10 → overrides channel default of 0.
            cust_p = rest.insert(
                "customers",
                {"name": name_p, "channel_id": personal_id, "discount_percent": 10},
            )
            state["customer_p_id"] = cust_p["id"]
            stored_p = cust_p.get("discount_percent")
            if stored_p is None or abs(float(stored_p) - 10.0) > 1e-6:
                raise AssertionError(
                    f"Personal customer stored discount_percent != 10 (got {stored_p!r})"
                )
            print(f"OK setup: Reseller customer (inherit) + Personal customer (explicit 10)")

            # ---- 2) Reseller inherit → 20% prefill ----
            pick_customer_on_order_form(page, BASE, name_r)
            expand_discount_step(page)
            val = wait_discount_value(page, "20")
            if val != "20":
                raise AssertionError(f"Reseller inherit prefill expected '20', got {val!r}")
            print("OK Reseller inherit → Discount step prefilled to 20")

            # ---- 3) Per-order override (30) persists ----
            page.locator('input[aria-label="discount-percent"]').fill("30")
            # Complete Items: pick the product, set qty 2 (price auto-fills).
            page.get_by_role("button", name=re.compile(r"Items")).first.click()
            page.wait_for_selector('select', timeout=5000)
            page.locator('select').first.select_option(value=product_id)
            page.locator('input[aria-label="qty-0"]').fill("2")
            # Price auto-fills from product.default_price; assert it's set so the
            # order is submittable (qty>0 AND unit_price>=0 with a product).
            price_val = page.locator('input[aria-label="price-0"]').input_value()
            if not price_val:
                # Defensive: some products may have a 0/empty default — set one.
                page.locator('input[aria-label="price-0"]').fill("100")
            # Save → navigates to /orders.
            page.locator('button[type="submit"]:has-text("Save")').click()
            page.wait_for_url(re.compile(r".*/orders(\?.*)?$"), timeout=10000)
            page.wait_for_load_state("networkidle")
            print("OK order saved (navigated to /orders)")

            # REST: read back the most-recent order for the Reseller customer.
            rows = rest.get(
                f"orders?select=id,discount_percent&customer_id=eq.{state['customer_r_id']}"
                f"&order=created_at.desc&limit=1"
            )
            if not rows:
                raise AssertionError("no order found for Reseller customer after save")
            order_id = rows[0]["id"]
            state["order_id"] = order_id
            snap = float(rows[0]["discount_percent"])  # PostgREST returns "30.00"
            if abs(snap - 30.0) > 1e-6:
                raise AssertionError(f"order snapshot expected 30, got {snap}")
            print(f"OK per-order override persisted: orders.discount_percent = {snap} (order {order_id})")

            # ---- 4) Order-detail discounted display + bill canvas ----
            page.goto(f"{BASE}/orders/{order_id}")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('h2:has-text("Items")', timeout=10000)
            # Paren-tolerant: the DOM text contains the literal "Discount (30%)".
            page.wait_for_selector('text=/Discount\\s*\\(30%\\)/', timeout=8000)
            # A Total line is present (rendered in the discount block).
            page.wait_for_selector('text="Total"', timeout=5000)
            print("OK order-detail shows 'Discount (30%)' + 'Total'")

            # Generate the bill and prove the discounted bill canvas rasterises.
            gen = page.get_by_role("button", name=re.compile(r"^Generate bill"))
            gen.first.click()
            page.wait_for_selector('[role="dialog"] canvas', timeout=15000)
            canvas_rendered = False
            for _ in range(30):
                dims = page.locator('[role="dialog"] canvas').first.evaluate(
                    "c => ({ w: c.width, h: c.height })"
                )
                if dims["w"] > 0 and dims["h"] > 0:
                    canvas_rendered = True
                    break
                page.wait_for_timeout(500)
            if not canvas_rendered:
                raise AssertionError("discounted bill canvas has zero dimensions")
            print("OK discounted bill canvas rendered")
            # Close the modal so it can't intercept later navigation.
            close = page.get_by_role("button", name=re.compile(r"^Close bill preview$"))
            if close.count() > 0:
                close.first.evaluate("el => el.click()")
                page.wait_for_timeout(300)

            # ---- 5) Personal explicit 10% prefill ----
            pick_customer_on_order_form(page, BASE, name_p)
            expand_discount_step(page)
            val = wait_discount_value(page, "10")
            if val != "10":
                raise AssertionError(f"Personal explicit prefill expected '10', got {val!r}")
            print("OK Personal explicit 10 → Discount step prefilled to 10")

        except Exception as e:
            failed = True
            print(f"FAIL {e}", file=sys.stderr)
            try:
                page.screenshot(path=str(OUT_DIR / "discounts-flow-failed.png"), full_page=True)
            except Exception:
                pass
        finally:
            # ---- Teardown (REST). FK order: order_items → order → customers.
            # All idempotent (0 rows OK). Never raise.
            if rest is not None:
                oid = state.get("order_id")
                if oid:
                    try:
                        rest.delete("order_items", "order_id", oid)
                    except Exception as e:
                        print(f"  WARN cleanup order_items failed: {e}")
                    try:
                        rest.delete("orders", "id", oid)
                    except Exception as e:
                        print(f"  WARN cleanup order failed: {e}")
                for key in ("customer_r_id", "customer_p_id"):
                    cid = state.get(key)
                    if cid:
                        try:
                            rest.delete("customers", "id", cid)
                        except Exception as e:
                            print(f"  WARN cleanup {key} failed: {e}")
                print("OK cleanup attempted (order_items → order → customers)")
            else:
                print("  WARN no REST client — cleanup skipped (nothing created)")
            browser.close()

    # ---- Console-error gate ----
    unexpected = [e for e in console_errors if not is_allowed_console_msg(e)]
    if unexpected:
        failed = True
        print(f"\n{len(unexpected)} unexpected console error(s):", file=sys.stderr)
        page_errors = [e for e in unexpected if e.startswith("PAGEERROR:")]
        other = [e for e in unexpected if not e.startswith("PAGEERROR:")]
        for e in page_errors:
            print(f"  {e}", file=sys.stderr)
        for e in other[:10]:
            print(f"  {e}", file=sys.stderr)

    if failed:
        return 1
    print("OK discounts flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
