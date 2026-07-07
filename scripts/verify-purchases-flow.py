"""
Purchases ("Buy") feature smoke test.

Verifies the receipt-model purchase log end-to-end against a running app:

  1. Login works; /purchases renders (h1 "Purchases").
  2. Log purchase: new vendor via the "Use ... as new vendor" row, default date,
     two items — item 1 (qty 5 kg, ₹450, Packaging chip) and item 2 (amount ₹50
     only, no qty → exercises the nullable-qty path, default category). Save.
  3. Receipts list shows the receipt card (vendor name) and the month total
     reflects the ₹500 receipt.
  4. Item price memory: re-opening the form and typing the same item name surfaces
     the "Last: ₹450.00 · 5 kg · <vendor> · <date>" hint AND auto-fills the unit.
  5. Receipt detail total (₹500.00) → Edit → item 2 amount 50→75 → save → ₹525.00.
  6. Items view: the segment lists the item with a "2×" times-bought count.
  7. Reports Month "Spending" section reflects the live spend (total ₹525.00,
     "Packaging" category row) — the only live-data coverage of the populated
     Spending branch.
  8. Delete: receipt detail → Delete (native confirm accepted) → receipt gone.
  9. No unexpected console errors during the flow (gate, allowlist mirrored from
     verify-launch-readiness.py).

IDEMPOTENT + SELF-CLEANING. Runs against the SINGLE LIVE prod database (no
staging), so it creates its OWN throwaway data through the app UI and tears it
all down in a try/finally via the Supabase REST API — even on failure. It NEVER
mutates pre-existing rows. All names are ts-suffixed ("SmokeVendor <epoch>",
"SmokeItem <epoch>") so leftovers from a crashed run are greppable in the DB.

Setup/teardown plumbing (JWT from localStorage, .env.local creds, REST calls)
is copied from verify-discounts-flow.py.

Run via the standard webapp-testing harness against the prod preview build:
    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py \
        --server "npm run preview -- --port 4173" --port 4173 -- \
        python scripts/verify-purchases-flow.py --url http://localhost:4173
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
import urllib.parse
from playwright.sync_api import sync_playwright

# Force UTF-8 stdout/stderr on Windows so → ✓ ✗ ₹ render cleanly.
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
    """Same loader pattern as verify-discounts-flow.py — env first, then .env.local."""
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

    def delete_q(self, table: str, query: str) -> bool:
        """DELETE with an arbitrary PostgREST filter query string."""
        req = urllib.request.Request(
            f"{self.url}/rest/v1/{table}?{query}",
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
        re.compile(r".*/(today|orders|customers|production|purchases|reports|/)$"),
        timeout=10000,
    )
    page.wait_for_load_state("networkidle")


def main() -> int:
    parser = argparse.ArgumentParser(description="Purchases feature smoke test")
    parser.add_argument("--url", default="http://localhost:5173")
    args = parser.parse_args()
    BASE = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()
    sb_url, sb_anon = load_supabase_env()
    if not sb_url or not sb_anon:
        print("ERROR: VITE_SUPABASE_URL / anon key not found in .env.local", file=sys.stderr)
        return 2

    ts = int(time.time())
    vendor_name = f"SmokeVendor {ts}"
    item1_name = f"SmokeItem {ts}"
    item2_name = f"SmokeItem2 {ts}"
    console_errors: list[str] = []
    failed = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()

        # Delete-confirm dialog auto-accept — registered before any click that
        # can trigger it (the receipt-detail Delete uses native confirm()).
        page.on("dialog", lambda d: d.accept())
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        page.on("pageerror", lambda exc: console_errors.append(f"PAGEERROR: {exc}"))

        rest: Rest | None = None
        try:
            # ---- 1) Login → /purchases ----
            do_login(page, BASE, email, password)
            print("OK login")

            token = read_jwt(page)
            if not token:
                print("FAIL could not read Supabase JWT from localStorage", file=sys.stderr)
                return 1
            rest = Rest(sb_url, sb_anon, token)

            page.goto(f"{BASE}/purchases")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('h1:has-text("Purchases")', timeout=10000)
            print("OK /purchases renders (h1 Purchases)")

            # ---- 2) Log purchase: new vendor + two items ----
            page.get_by_role("link", name=re.compile(r"Log purchase")).first.click()
            page.wait_for_selector('h1:has-text("Log purchase")', timeout=10000)

            # Vendor: type the name, tap the "Use ... as new vendor" row.
            page.locator('#vendor-search').fill(vendor_name)
            new_vendor_row = page.get_by_role(
                "button", name=re.compile(rf'Use "{re.escape(vendor_name)}" as new vendor')
            )
            new_vendor_row.wait_for(timeout=5000)
            new_vendor_row.click()
            # Vendor summary card now shows the chosen name + a "Change" affordance.
            page.wait_for_selector(f'text="{vendor_name}"', timeout=5000)

            # Item 1: name, qty 5, unit kg, amount 450, tap the Packaging chip.
            page.locator('#item-name-0').fill(item1_name)
            page.locator('[aria-label="Quantity for item 1"]').fill("5")
            page.locator('[aria-label="Unit for item 1"]').fill("kg")
            page.locator('[aria-label="Amount for item 1"]').fill("450")
            # The category chip is a button with the category name. Item 1's picker
            # is the first Packaging chip in DOM order.
            page.get_by_role("button", name="Packaging").first.click()

            # + Add another item → item 2: name + amount only (no qty, default cat).
            page.get_by_role("button", name=re.compile(r"Add another item")).click()
            page.locator('#item-name-1').fill(item2_name)
            page.locator('[aria-label="Amount for item 2"]').fill("50")

            # Live total should read ₹500.00 before save.
            page.wait_for_selector('text=/₹500\\.00/', timeout=5000)

            page.get_by_role("button", name=re.compile(r"^Save purchase$")).click()
            page.wait_for_url(re.compile(r".*/purchases$"), timeout=10000)
            page.wait_for_load_state("networkidle")
            print("OK logged 2-item purchase (₹450 Packaging + ₹50), saved")

            # ---- 3) Receipts list: card + month total ----
            page.wait_for_selector(f'a[href^="/purchases/"]:has-text("{vendor_name}")', timeout=10000)
            # Month total (rendered ₹500.00) and the receipt card total both present.
            page.wait_for_selector('text=/₹500\\.00/', timeout=5000)
            print("OK receipts list shows the receipt card + ₹500.00 month total")

            # ---- 4) Item price memory hint on re-open ----
            page.get_by_role("link", name=re.compile(r"Log purchase")).first.click()
            page.wait_for_selector('h1:has-text("Log purchase")', timeout=10000)
            page.locator('#item-name-0').fill(item1_name)
            # hintLine: "Last: ₹450.00 · 5 kg · <vendor> · <date>" (formatINR = ₹450.00).
            hint = page.locator(
                f'text=/Last:\\s*₹450\\.00\\s*·\\s*5\\s*kg\\s*·\\s*{re.escape(vendor_name)}/'
            )
            hint.wait_for(timeout=6000)
            # Unit auto-filled from the last entry (was empty → "kg").
            unit_val = page.locator('[aria-label="Unit for item 1"]').input_value()
            if unit_val != "kg":
                raise AssertionError(f"expected unit auto-fill 'kg', got {unit_val!r}")
            print("OK item memory hint shows 'Last: ₹450.00 · 5 kg · <vendor>' + unit auto-filled")
            # Navigate away without saving.
            page.goto(f"{BASE}/purchases")
            page.wait_for_load_state("networkidle")

            # ---- 5) Detail total → Edit item 2 to 75 → 525 ----
            page.wait_for_selector(f'a[href^="/purchases/"]:has-text("{vendor_name}")', timeout=10000)
            page.locator(f'a[href^="/purchases/"]:has-text("{vendor_name}")').first.click()
            page.wait_for_selector(f'h1:has-text("{vendor_name}")', timeout=10000)
            page.wait_for_selector('text=/₹500\\.00/', timeout=5000)  # detail total
            print("OK receipt detail total ₹500.00")

            page.get_by_role("link", name=re.compile(r"^Edit purchase$")).click()
            page.wait_for_selector('h1:has-text("Edit purchase")', timeout=10000)
            # Item 2's amount input (row 2). Rewrite 50 → 75.
            amt2 = page.locator('[aria-label="Amount for item 2"]')
            amt2.wait_for(timeout=5000)
            amt2.fill("75")
            page.get_by_role("button", name=re.compile(r"^Save changes$")).click()
            page.wait_for_url(re.compile(r".*/purchases/[0-9a-f-]+$"), timeout=10000)
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('text=/₹525\\.00/', timeout=6000)
            print("OK edited item 2 to ₹75 → detail total ₹525.00")

            # ---- 6) Items view: 2× count ----
            page.goto(f"{BASE}/purchases")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('h1:has-text("Purchases")', timeout=10000)
            page.get_by_role("tab", name=re.compile(r"items", re.I)).click()
            # Item row renders "{name} … {timesBought}×" (timesBought = count of
            # purchase_items rows sharing the name, all-time). item1's name is
            # ts-unique and the edit replaced (delete+reinsert) rather than
            # duplicated its row, so exactly one item1 row exists → "1×".
            item_row = page.locator(f'li:has-text("{item1_name}")').first
            item_row.wait_for(timeout=8000)
            row_text = item_row.inner_text()
            if "1×" not in row_text:
                raise AssertionError(
                    f"expected '1×' times-bought on item1 row, got: {row_text!r}"
                )
            print(f"OK items view lists '{item1_name}' with 1× count")

            # ---- 7) Reports Month "Spending" section reflects the spend ----
            page.goto(f"{BASE}/reports?tab=month")
            page.wait_for_load_state("networkidle")
            spending = page.locator('section', has=page.locator('h2:has-text("Spending")')).first
            spending.wait_for(timeout=10000)
            # Total spend rendered via formatINR (₹525.00) somewhere in the section.
            spending.locator('text=/525/').first.wait_for(timeout=8000)
            # Category breakdown row for Packaging (₹450 of the ₹525).
            spending.locator('text=/Packaging/').first.wait_for(timeout=8000)
            print("OK Reports Month Spending section shows 525 + Packaging category")

            # ---- 8) Delete the receipt ----
            page.goto(f"{BASE}/purchases")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector(f'a[href^="/purchases/"]:has-text("{vendor_name}")', timeout=10000)
            page.locator(f'a[href^="/purchases/"]:has-text("{vendor_name}")').first.click()
            page.wait_for_selector(f'h1:has-text("{vendor_name}")', timeout=10000)
            page.get_by_role("button", name=re.compile(r"^Delete purchase$")).click()
            page.wait_for_url(re.compile(r".*/purchases$"), timeout=10000)
            page.wait_for_load_state("networkidle")
            # The receipt card for the smoke vendor must be gone.
            page.wait_for_selector(
                f'a[href^="/purchases/"]:has-text("{vendor_name}")', state="detached", timeout=8000
            )
            if page.locator(f'a[href^="/purchases/"]:has-text("{vendor_name}")').count() != 0:
                raise AssertionError("receipt still present after delete")
            print("OK receipt deleted (card gone from list)")

        except Exception as e:
            failed = True
            print(f"FAIL {e}", file=sys.stderr)
            try:
                page.screenshot(path=str(OUT_DIR / "purchases-flow-failed.png"), full_page=True)
            except Exception:
                pass
        finally:
            # ---- Teardown (REST). FK: purchase_items (ON DELETE CASCADE) → purchases
            # → vendors. All idempotent (0 rows OK). Never raise.
            if rest is not None:
                try:
                    vendors = rest.get(
                        f"vendors?select=id&name=eq.{urllib.parse.quote(vendor_name)}"
                    )
                    for v in vendors:
                        vid = v["id"]
                        # Delete purchases for this vendor (cascade removes their items).
                        try:
                            rest.delete_q("purchases", f"vendor_id=eq.{vid}")
                        except Exception as e:
                            print(f"  WARN cleanup purchases failed: {e}")
                        # Delete the vendor row.
                        try:
                            rest.delete_q("vendors", f"id=eq.{vid}")
                        except Exception as e:
                            print(f"  WARN cleanup vendor failed: {e}")
                except Exception as e:
                    print(f"  WARN vendor lookup failed: {e}")

                # Defensive: remove any orphaned purchase_items named SmokeItem*<ts>.
                try:
                    rest.delete_q(
                        "purchase_items",
                        f"item_name=like.{urllib.parse.quote(f'SmokeItem%{ts}')}",
                    )
                except Exception as e:
                    print(f"  WARN cleanup orphan items failed: {e}")

                # Verify no SmokeVendor rows remain.
                try:
                    left = rest.get(
                        f"vendors?select=id,name&name=eq.{urllib.parse.quote(vendor_name)}"
                    )
                    if left:
                        print(f"  WARN {len(left)} SmokeVendor row(s) still present after cleanup")
                    else:
                        print("OK cleanup verified — no SmokeVendor rows remain")
                except Exception as e:
                    print(f"  WARN cleanup verify failed: {e}")
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
    print("OK purchases flow verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
