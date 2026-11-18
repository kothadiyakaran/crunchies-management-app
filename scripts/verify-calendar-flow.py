"""
Calendar + reminders-card smoke test.

  1. Today's calendar icon opens /calendar on today.
  2. /calendar?date=<+3 days> selects that day; the panel lists a throwaway
     pending order and its "To make" line; the day cell's label counts it.
  3. Order link -> detail -> back returns to the same selected day.
  4. ArrowRight moves the selection; month arrows + Today work.
  5. Settings shows the "Reminders on this phone" card.
  6. No unexpected console errors.

SELF-CLEANING: creates "SmokeCal <epoch>" + one order via REST, deletes both in
finally. Plumbing copied from verify-purchases-flow.py.

    python C:/Users/Karan/.claude/skills/webapp-testing/scripts/with_server.py         --server "npm run preview -- --port 4173" --port 4173 --         python scripts/verify-calendar-flow.py --url http://localhost:4173
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


from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def ist_ymd(days: int = 0) -> str:
    return (datetime.now(IST) + timedelta(days=days)).strftime("%Y-%m-%d")


def day_label(ymd: str) -> str:
    d = datetime.strptime(ymd, "%Y-%m-%d")
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]}"


def rest_post(rest: "Rest", table: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{rest.url}/rest/v1/{table}",
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers=rest._headers({"Prefer": "return=representation"}),
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Calendar smoke test")
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
    customer_name = f"SmokeCal {ts}"
    due = ist_ymd(3)
    console_errors: list[str] = []
    failed = False
    customer_id = order_id = None

    def check(cond: bool, msg: str) -> None:
        nonlocal failed
        if cond:
            print(f"OK {msg}")
        else:
            failed = True
            print(f"FAIL {msg}", file=sys.stderr)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 360, "height": 740})
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda exc: console_errors.append(f"PAGEERROR: {exc}"))

        rest: Rest | None = None
        try:
            do_login(page, BASE, email, password)
            print("OK login")
            token = read_jwt(page)
            if not token:
                print("FAIL could not read Supabase JWT", file=sys.stderr)
                return 1
            rest = Rest(sb_url, sb_anon, token)

            # ---- Setup via REST: a customer + one pending order due in 3 days ----
            channel = rest.get("channels?select=id&name=eq.Personal&limit=1")[0]
            product = rest.get("products?select=id,name,unit,default_price&active=eq.true&order=name&limit=1")[0]
            customer_id = rest_post(rest, "customers", {"name": customer_name, "channel_id": channel["id"]})["id"]
            order_id = rest_post(rest, "orders", {
                "customer_id": customer_id,
                "source": "in_person",
                "target_fulfilment_date": due,
            })["id"]
            rest_post(rest, "order_items", {
                "order_id": order_id, "product_id": product["id"], "qty": 2,
                "unit_price": product["default_price"],
            })
            print(f"OK setup order due {due} ({product['name']} × 2)")

            # ---- Today → calendar icon ----
            page.goto(f"{BASE}/today")
            page.wait_for_selector('h1:has-text("Today")')
            page.get_by_role("link", name="Calendar").click()
            page.wait_for_selector('h1:has-text("Calendar")')
            check(page.get_by_role("heading", name=day_label(ist_ymd(0))).count() == 1,
                  "Today's calendar icon opens /calendar on today")

            # ---- Deep link selects the day; panel shows the order + totals ----
            page.goto(f"{BASE}/calendar?date={due}")
            page.wait_for_selector(f'h2:has-text("{day_label(due)}")')
            page.wait_for_selector(f'text={customer_name}', timeout=10000)
            check(True, "deep link shows the order on its day")
            to_make = page.locator('h3:has-text("To make") + p').inner_text()
            check(product["name"] in to_make and "2" in to_make, f"To make line lists the product: {to_make!r}")
            cell = page.locator(f'button[data-date="{due}"]')
            check("order" in (cell.get_attribute("aria-label") or ""), f"day cell label: {cell.get_attribute('aria-label')!r}")
            page.screenshot(path=str(OUT_DIR / "calendar-day.png"), full_page=True)

            # ---- Order link → detail → back keeps the day ----
            page.get_by_role("link", name=re.compile(re.escape(customer_name))).click()
            page.wait_for_url(re.compile(rf".*/orders/{order_id}$"))
            check(True, "order link opens the order detail")
            page.go_back()
            page.wait_for_selector(f'h2:has-text("{day_label(due)}")')
            check(f"date={due}" in page.url, "back returns to the same selected day")

            # ---- Keyboard + month navigation ----
            cell = page.locator(f'button[data-date="{due}"]')
            cell.focus()
            page.keyboard.press("ArrowRight")
            nxt = (datetime.strptime(due, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            page.wait_for_selector(f'h2:has-text("{day_label(nxt)}")')
            check(True, "ArrowRight moves to the next day")
            page.get_by_role("button", name="Next month").click()
            page.get_by_role("button", name="Today", exact=True).click()
            page.wait_for_selector(f'h2:has-text("{day_label(ist_ymd(0))}")')
            check(True, "month arrows + Today button work")

            # ---- Settings shows the reminders card ----
            page.goto(f"{BASE}/settings")
            page.wait_for_selector('h2:has-text("Reminders on this phone")')
            check(True, "Settings shows the reminders card")

            unexpected = [e for e in console_errors if not is_allowed_console_msg(e)]
            check(not unexpected, f"no unexpected console errors {unexpected[:3]}")
        except Exception as exc:  # noqa: BLE001
            failed = True
            print(f"FAIL {type(exc).__name__}: {exc}", file=sys.stderr)
            try:
                page.screenshot(path=str(OUT_DIR / "calendar-failure.png"), full_page=True)
            except Exception:  # noqa: BLE001
                pass
        finally:
            if rest:
                try:
                    if order_id:
                        rest.delete_q("order_items", f"order_id=eq.{order_id}")
                        rest.delete_q("orders", f"id=eq.{order_id}")
                    if customer_id:
                        rest.delete_q("customers", f"id=eq.{customer_id}")
                    print("OK teardown")
                except Exception as exc:  # noqa: BLE001
                    failed = True
                    print(f"FAIL teardown: {exc} (leftover customer {customer_name!r})", file=sys.stderr)
            browser.close()

    print("RESULT:", "FAIL" if failed else "PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
