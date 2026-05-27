"""
Part C — reversibility smoke test.

Verifies the revert affordances on the order-detail page end-to-end against a
running app:

  1. Login works.
  2. Tap "Mark fulfilled" → "Mark as not fulfilled" appears + status pill reads
     "Fulfilled".
  3. Tap "Mark as not fulfilled" (auto-accept confirm) → "Mark fulfilled"
     returns + pill reads "Pending".
  4. Tap "Mark paid" → "Mark as unpaid" appears + payment pill reads "paid".
  5. Tap "Mark as unpaid" (auto-accept) → "Mark paid" returns + pill reads
     "unpaid".
  6. Open an existing complaint, tap "Delete complaint" (auto-accept) → the
     complaint disappears from the order's Complaints list.
  7. No unexpected console errors during the flow (gate, allowlist mirrored
     from verify-launch-readiness.py).

IDEMPOTENT + SELF-CLEANING. Runs against the SINGLE LIVE prod database (no
staging), so it creates its OWN throwaway data via the Supabase REST API
(customer → order → order_item → complaint) and tears it all down in a
try/finally — even on failure. It NEVER mutates pre-existing rows.

Setup/teardown plumbing (JWT from localStorage, .env.local creds, REST calls)
is copied from verify-launch-readiness.py's cleanup_complaints_via_rest.

Run via the standard webapp-testing harness against the prod preview build:
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \
        --server "npm run preview" --port 4173 -- \
        python scripts/verify-revert-flow.py --url http://localhost:4173

Smoke surface prefix: "ZZSMOKE Revert {epoch_ms}" on the throwaway customer so
any leftover row from a crashed run is greppable in the DB.
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
    """Same loader pattern as verify-bill-flow.py — env first, then .env.local."""
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Reversibility (Part C) smoke test")
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
    console_errors: list[str] = []
    state: dict = {}  # ids of created rows
    failed = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        # Auto-accept native confirm() dialogs (revert + delete-complaint).
        page.on("dialog", lambda d: d.accept())
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        page.on("pageerror", lambda exc: console_errors.append(f"PAGEERROR: {exc}"))

        rest: Rest | None = None
        try:
            # ---- 1) Login ----
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

            token = read_jwt(page)
            if not token:
                print("FAIL could not read Supabase JWT from localStorage", file=sys.stderr)
                return 1
            rest = Rest(sb_url, sb_anon, token)

            # ---- 2) Setup throwaway data via REST ----
            channels = rest.get("channels?name=eq.Personal&select=id")
            if not channels:
                print("FAIL no 'Personal' system channel found", file=sys.stderr)
                return 1
            channel_id = channels[0]["id"]

            products = rest.get("products?select=id&limit=1")
            if not products:
                print("FAIL no products in catalogue", file=sys.stderr)
                return 1
            product_id = products[0]["id"]

            customer = rest.insert(
                "customers",
                {"name": f"ZZSMOKE Revert {ts}", "channel_id": channel_id},
            )
            state["customer_id"] = customer["id"]

            order = rest.insert(
                "orders",
                {
                    "customer_id": customer["id"],
                    "source": "in_person",
                    "target_fulfilment_date": today_ist(),
                    "payment_status": "unpaid",
                },
            )
            oid = order["id"]
            state["order_id"] = oid

            rest.insert(
                "order_items",
                {"order_id": oid, "product_id": product_id, "qty": 1, "unit_price": 100},
            )

            complaint = rest.insert(
                "complaints",
                {
                    "order_id": oid,
                    "kind": "quality",
                    "description": f"ZZSMOKE complaint {ts}",
                    "reported_at": today_ist(),
                },
            )
            state["complaint_id"] = complaint["id"]
            print(f"OK setup: customer + order + item + complaint (order {oid})")

            # ---- 3) Open order detail; wait for data-loaded (Mark fulfilled btn) ----
            page.goto(f"{BASE}/orders/{oid}")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name=re.compile(r"^Mark fulfilled$")).wait_for(timeout=15000)

            # Status pill helpers — scope to span.rounded-pill so the "paid"
            # substring of "unpaid"/"Mark paid" can't false-match.
            pill = page.locator("span.rounded-pill")

            # Sanity: starts Pending + unpaid.
            pill.filter(has_text=re.compile(r"^Pending$")).first.wait_for(timeout=5000)
            pill.filter(has_text=re.compile(r"^unpaid$")).first.wait_for(timeout=5000)
            print("OK order opens Pending + unpaid")

            # ---- Step 3: Mark fulfilled ----
            page.get_by_role("button", name=re.compile(r"^Mark fulfilled$")).click()
            page.get_by_role("button", name=re.compile(r"^Mark as not fulfilled$")).wait_for(timeout=10000)
            pill.filter(has_text=re.compile(r"^Fulfilled$")).first.wait_for(timeout=5000)
            print("OK Mark fulfilled → 'Mark as not fulfilled' + pill 'Fulfilled'")

            # ---- Step 4: Mark as not fulfilled (auto-accept confirm) ----
            page.get_by_role("button", name=re.compile(r"^Mark as not fulfilled$")).click()
            page.get_by_role("button", name=re.compile(r"^Mark fulfilled$")).wait_for(timeout=10000)
            pill.filter(has_text=re.compile(r"^Pending$")).first.wait_for(timeout=5000)
            print("OK Mark as not fulfilled → 'Mark fulfilled' returns + pill 'Pending'")

            # ---- Step 5: Mark paid ----
            page.get_by_role("button", name=re.compile(r"^Mark paid$")).click()
            page.get_by_role("button", name=re.compile(r"^Mark as unpaid$")).wait_for(timeout=10000)
            pill.filter(has_text=re.compile(r"^paid$")).first.wait_for(timeout=5000)
            print("OK Mark paid → 'Mark as unpaid' + payment pill 'paid'")

            # ---- Step 6: Mark as unpaid (auto-accept confirm) ----
            page.get_by_role("button", name=re.compile(r"^Mark as unpaid$")).click()
            page.get_by_role("button", name=re.compile(r"^Mark paid$")).wait_for(timeout=10000)
            pill.filter(has_text=re.compile(r"^unpaid$")).first.wait_for(timeout=5000)
            print("OK Mark as unpaid → 'Mark paid' returns + payment pill 'unpaid'")

            # ---- Step 7: complaint delete ----
            # Reload so the REST-inserted complaint renders (load() runs on mount).
            page.goto(f"{BASE}/orders/{oid}")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name=re.compile(r"^Mark fulfilled$")).wait_for(timeout=15000)

            page.wait_for_selector('h2:has-text("Complaints")', timeout=8000)
            desc = f"ZZSMOKE complaint {ts}"
            page.wait_for_selector(f'text="{desc}"', timeout=5000)
            # Open the complaint row (a <button> wrapping the description).
            page.locator(f'button:has-text("{desc}")').first.click()
            # Edit-complaint sheet opens.
            page.wait_for_selector('h2:has-text("Edit complaint")', timeout=5000)
            page.get_by_role("button", name=re.compile(r"^Delete complaint$")).click()
            # Sheet closes + complaint vanishes from the list. The whole
            # Complaints section disappears (only one complaint existed).
            page.wait_for_selector('h2:has-text("Complaints")', state="detached", timeout=10000)
            if page.locator(f'text="{desc}"').count() > 0:
                raise AssertionError("complaint still visible after delete")
            # It was hard-deleted server-side too — drop the id so cleanup skips it.
            state.pop("complaint_id", None)
            print("OK Delete complaint → complaint gone from list + section removed")

        except Exception as e:
            failed = True
            print(f"FAIL {e}", file=sys.stderr)
            try:
                page.screenshot(path=str(OUT_DIR / "revert-flow-failed.png"), full_page=True)
            except Exception:
                pass
        finally:
            # ---- Teardown (REST). FK order: complaints → items → order → customer.
            # complaints.order_id is `on delete restrict`, so they go first.
            # All idempotent (0 rows OK). Never raise.
            if rest is not None:
                oid = state.get("order_id")
                if oid:
                    try:
                        rest.delete("complaints", "order_id", oid)
                    except Exception as e:
                        print(f"  WARN cleanup complaints failed: {e}")
                    try:
                        rest.delete("order_items", "order_id", oid)
                    except Exception as e:
                        print(f"  WARN cleanup order_items failed: {e}")
                    try:
                        rest.delete("orders", "id", oid)
                    except Exception as e:
                        print(f"  WARN cleanup order failed: {e}")
                cid = state.get("customer_id")
                if cid:
                    try:
                        rest.delete("customers", "id", cid)
                    except Exception as e:
                        print(f"  WARN cleanup customer failed: {e}")
                print("OK cleanup attempted (complaints → items → order → customer)")
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
    print("OK revert flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
