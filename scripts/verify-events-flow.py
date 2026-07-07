"""
Sprint 7 browser verification — events + public exhibition form + confirmation.

What this asserts (against the running dev server at http://localhost:5173):
  1. Login still works.
  2. /events renders header "Events", filter chips, "+ Add event" link.
  3. /events/new accepts a fresh event (exhibition, today→+5d, 1 lead week)
     and lands at /events/<uuid> with a populated slug.
  4. The public form at /order/<slug> renders Step 1 of 3.
  5. Tapping the first product's + button and Continue → reaches Step 2.
  6. Filling name + phone advances to Step 3 (confirm summary).
  7. Place order navigates to /order/<slug>/confirmed?ref=<uuid>
     and shows "Order placed." with a #YYYY-NNNN order number.
  8. After logging back in as mom, /orders contains the new order's
     customer name and /customers has the new exhibition customer
     (phone 9876543210).

Captures screenshots to scripts/screenshots/sprint7-*.png for visual review.

Prereq: a dev server must be running on http://localhost:5173. Start it with:
    npm run dev
in a separate terminal, then run this script.
"""

import argparse
import os
import pathlib
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:5173"  # overridden by --url in main()
OUT_DIR = pathlib.Path("scripts/screenshots")

# Asia/Kolkata is UTC+05:30, no DST.
IST = timezone(timedelta(hours=5, minutes=30))


def load_creds() -> tuple[str, str]:
    """Mirror Sprint 5/6 verify: env vars first, then .env.local."""
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


def today_ist_ymd() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def today_plus_ist_ymd(days: int) -> str:
    return (datetime.now(IST) + timedelta(days=days)).strftime("%Y-%m-%d")


def cleanup_via_rest(page, event_name: str, customer_name: str) -> None:
    """Delete this run's throwaway rows (event + exhibition order + customer),
    matched by their unique ts-suffixed names so mom's real data is never touched.
    Uses the logged-in mom session's JWT from localStorage + the REST API. Best-effort
    (success path); logs but never raises. Mirrors the launch-readiness cleanup pattern."""
    import urllib.request

    def env_url_anon():
        url = anon = None
        path = pathlib.Path(".env.local")
        if path.exists():
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                m = re.match(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line) or re.match(
                    r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line
                )
                if not m:
                    continue
                if m.group(1) == "VITE_SUPABASE_URL":
                    url = m.group(2).strip()
                elif m.group(1) in ("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"):
                    anon = m.group(2).strip()
        return url, anon

    try:
        token = page.evaluate(
            """() => {
                for (const k of Object.keys(localStorage)) {
                    if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                        try { return JSON.parse(localStorage.getItem(k)).access_token; } catch (e) {}
                    }
                }
                return null;
            }"""
        )
        url, anon = env_url_anon()
        if not token or not url or not anon:
            print("  WARN cleanup skipped (no token/url/anon)")
            return
        h = {"apikey": anon, "Authorization": f"Bearer {token}"}

        def rest(method, path, prefer_minimal=True):
            headers = dict(h)
            if prefer_minimal:
                headers["Prefer"] = "return=minimal"
            req = urllib.request.Request(f"{url}/rest/v1/{path}", method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, resp.read().decode()

        import json as _json
        from urllib.parse import quote

        # Customer (exact unique name) → its orders' items, then orders, then the customer.
        _, ctxt = rest("GET", f"customers?select=id&name=eq.{quote(customer_name)}", prefer_minimal=False)
        for c in _json.loads(ctxt or "[]"):
            cid = c["id"]
            _, otxt = rest("GET", f"orders?select=id&customer_id=eq.{cid}", prefer_minimal=False)
            for o in _json.loads(otxt or "[]"):
                rest("DELETE", f"order_items?order_id=eq.{o['id']}")
            rest("DELETE", f"orders?customer_id=eq.{cid}")
            rest("DELETE", f"customers?id=eq.{cid}")
        # Event (exact unique name).
        rest("DELETE", f"events?name=eq.{quote(event_name)}")
        print("  cleaned up smoke event + order + customer")
    except Exception as e:
        print(f"  WARN cleanup failed: {e}")


def do_login(page, email: str, password: str) -> None:
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Events + public exhibition form smoke")
    parser.add_argument("--url", default="http://localhost:5173", help="Base URL of the running app")
    args = parser.parse_args()
    global BASE
    BASE = args.url.rstrip("/")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()

    ts = int(time.time() * 1000)
    event_name = f"Sprint 7 Smoke Event {ts}"
    customer_name = f"Smoke Tester {ts}"
    # Unique phone per run. A FIXED phone made the create RPC's dedup-on-phone
    # reuse a prior run's customer, whose source_event_id stays pinned to its
    # first event (provenance preserved by design) — so public_get_order_by_ref's
    # anti-leak (customer.source_event_id must == this event) returned null and
    # the confirmation showed "Order not found." A fresh customer each run gets
    # source_event_id = this run's event, so the confirmation resolves. (task #6)
    phone = "9" + str(ts)[-9:]
    starts_on = today_ist_ymd()
    ends_on = today_plus_ist_ymd(5)

    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        mom_ctx = browser.new_context()
        page = mom_ctx.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        # 1) Login as mom
        do_login(page, email, password)
        print("OK login")

        # 2) /events — directory page renders
        page.goto(f"{BASE}/events")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Events")', timeout=5000)
        # Filter chips
        page.wait_for_selector('button:has-text("Upcoming")', timeout=3000)
        page.wait_for_selector('button:has-text("Past")', timeout=3000)
        page.wait_for_selector('button:has-text("All")', timeout=3000)
        # + Add event link
        add_link = page.locator('a[href="/events/new"]').first
        if add_link.count() == 0:
            print("FAIL + Add event link not found", file=sys.stderr)
            return 1
        print("OK /events directory header + chips + Add link")
        page.screenshot(path=str(OUT_DIR / "sprint7-events-list.png"), full_page=True)

        # 3) + Add event → fill form
        add_link.click()
        page.wait_for_url(re.compile(r".*/events/new$"), timeout=5000)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector('h1:has-text("Add event")', timeout=5000)

        # Name (autofocused). Fill via the labelled input.
        # The form's first text input under label "Name" is what we want.
        name_input = page.locator(
            'label:has(span:text("Name")) input'
        ).first
        name_input.fill(event_name)

        # Kind = Exhibition is the default (line 65: useState('exhibition')). Confirm it's selected.
        # (No-op click would be fine but redundant.)

        # Starts on / Ends on
        starts_input = page.locator('label:has(span:text("Starts on")) input[type="date"]').first
        ends_input = page.locator('label:has(span:text("Ends on")) input[type="date"]').first
        starts_input.fill(starts_on)
        ends_input.fill(ends_on)

        # Lead weeks — exhibition default is already 1 (defaultLeadWeeks('exhibition')).
        # Set explicitly to make the test deterministic.
        lead_input = page.locator('input[type="number"]').first
        lead_input.fill("1")

        # Save
        page.locator('button[type="submit"]:has-text("Save event")').click()

        # 4) Should land at /events/<uuid> (not /events/new)
        page.wait_for_url(
            re.compile(r".*/events/[0-9a-f-]{36}$"),
            timeout=10000,
        )
        page.wait_for_load_state("networkidle")
        event_url = page.url
        event_id_match = re.search(r"/events/([0-9a-f-]{36})$", event_url)
        if not event_id_match:
            print(f"FAIL could not parse event id from URL {event_url}", file=sys.stderr)
            return 1
        event_id = event_id_match.group(1)
        # The slug input has placeholder = slugPreview; the value is the saved slug.
        # We grab the value from the "Custom slug (optional)" labelled input.
        slug_input = page.locator(
            'label:has(span:text("Custom slug (optional)")) input'
        ).first
        # Wait for the slug to actually populate after the post-save refetch.
        try:
            page.wait_for_function(
                """() => {
                    const labels = Array.from(document.querySelectorAll('label'));
                    for (const l of labels) {
                        const span = l.querySelector('span');
                        if (span && span.textContent && span.textContent.startsWith('Custom slug')) {
                            const input = l.querySelector('input');
                            if (input && input.value && input.value.length > 0) return true;
                        }
                    }
                    return false;
                }""",
                timeout=8000,
            )
        except PWTimeout:
            # Slug may still be derivable from the URL fragment shown on the page;
            # fall back to placeholder (which is the preview).
            pass
        slug = (slug_input.input_value() or "").strip()
        if not slug:
            # Read the placeholder (slugPreview) as a last-ditch attempt.
            placeholder = slug_input.get_attribute("placeholder") or ""
            slug = placeholder.strip()
        if not slug:
            print(
                f"FAIL slug input is empty after save (event_id={event_id})",
                file=sys.stderr,
            )
            return 1
        print(f"OK event saved id={event_id} slug={slug}")
        page.screenshot(path=str(OUT_DIR / "sprint7-event-detail.png"), full_page=True)

        # 5) Public form — use a fresh anonymous browser context to be unambiguous
        anon_ctx = browser.new_context()
        anon_page = anon_ctx.new_page()
        anon_page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        anon_page.goto(f"{BASE}/order/{slug}")
        anon_page.wait_for_load_state("networkidle")

        # Step 1 of 3 marker
        try:
            anon_page.wait_for_selector('p:has-text("Step 1 of 3")', timeout=8000)
        except PWTimeout:
            anon_page.screenshot(path=str(OUT_DIR / "sprint7-public-form-failed.png"), full_page=True)
            print("FAIL public form did not render Step 1 of 3", file=sys.stderr)
            return 1
        print("OK public form Step 1 rendered")
        anon_page.screenshot(path=str(OUT_DIR / "sprint7-public-form-step1.png"), full_page=True)

        # 6) Click + on the first product, then Continue →
        plus_buttons = anon_page.locator('button[aria-label^="Increase "]')
        plus_count = plus_buttons.count()
        if plus_count == 0:
            anon_page.screenshot(path=str(OUT_DIR / "sprint7-no-products.png"), full_page=True)
            print(
                "FAIL no products available in the public form — seed dev DB with in-house products",
                file=sys.stderr,
            )
            return 1
        plus_buttons.first.click()
        # Wait a tick for the React state update
        anon_page.wait_for_timeout(100)
        anon_page.locator('button:has-text("Continue →")').first.click()

        # 7) Step 2 — fill name + phone, Continue →
        anon_page.wait_for_selector('p:has-text("Step 2 of 3")', timeout=5000)
        anon_page.locator('label:has(span:text("Name")) input').first.fill(customer_name)
        anon_page.locator('label:has(span:text("Phone")) input').first.fill(phone)
        # Continue → in step 2
        anon_page.locator('button:has-text("Continue →")').first.click()

        # 8) Step 3 — confirm + place
        anon_page.wait_for_selector('p:has-text("Step 3 of 3")', timeout=5000)
        # Summary heading "Order summary" should be present
        anon_page.wait_for_selector('h2:has-text("Order summary")', timeout=3000)
        print("OK public form Step 3 confirm screen rendered")
        anon_page.screenshot(path=str(OUT_DIR / "sprint7-public-form-step3.png"), full_page=True)

        # Place order
        anon_page.locator('button:has-text("Place order")').first.click()

        # 9) Confirmation
        anon_page.wait_for_url(
            re.compile(rf".*/order/{re.escape(slug)}/confirmed\?ref=[0-9a-f-]{{36}}"),
            timeout=15000,
        )
        anon_page.wait_for_load_state("networkidle")
        # "Order placed." heading. A COLD load of the lazy-loaded confirmation route
        # (chunk fetch + the public_get_order_by_ref RPC) measured up to ~5.4s on a
        # fresh anon context, worse under heavy gate load — the old 5s budget flaked
        # here (task #6). The RPC layer itself is instant + reliable (verified), so a
        # generous wait is correct; on a genuine miss, capture the page for diagnosis.
        try:
            anon_page.wait_for_selector('h2:has-text("Order placed.")', timeout=20000)
        except PWTimeout:
            anon_page.screenshot(path=str(OUT_DIR / "sprint7-confirm-no-heading.png"), full_page=True)
            body_text = (anon_page.locator("body").inner_text() or "").replace("\n", " | ")[:300]
            print(f"FAIL 'Order placed.' heading not shown within 20s. Page: {body_text!r}", file=sys.stderr)
            return 1
        # #YYYY-NNNN order number — since the P2-10 polish it renders in a
        # mono pill <span> (OrderConfirmationPage.tsx), not a <p>.
        order_num_el = anon_page.locator('span').filter(has_text=re.compile(r"^#\d{4}-\d{4}$")).first
        try:
            order_number = (order_num_el.text_content(timeout=5000) or "").strip()
        except PWTimeout:
            anon_page.screenshot(path=str(OUT_DIR / "sprint7-confirm-no-number.png"), full_page=True)
            print("FAIL #YYYY-NNNN order number not found on confirmation", file=sys.stderr)
            return 1
        if not re.match(r"^#\d{4}-\d{4}$", order_number):
            print(f"FAIL order number malformed: {order_number!r}", file=sys.stderr)
            return 1
        print(f"OK confirmation page renders, order_number={order_number}")
        anon_page.screenshot(path=str(OUT_DIR / "sprint7-confirmation.png"), full_page=True)

        anon_ctx.close()

        # 10) Back to mom's context (still logged in). Verify the order shows up in /orders.
        page.goto(f"{BASE}/orders")
        page.wait_for_load_state("networkidle")
        # Search for the unique customer name to filter the list
        search = page.locator('input[type="search"]').first
        search.fill(customer_name.split(" ", 1)[1] if " " in customer_name else customer_name)
        # 200ms debounce + render slack
        page.wait_for_timeout(500)
        # The list should contain the customer name
        try:
            page.wait_for_selector(
                f'text="{customer_name}"',
                timeout=5000,
            )
        except PWTimeout:
            page.screenshot(path=str(OUT_DIR / "sprint7-orders-after-smoke-failed.png"), full_page=True)
            print(
                f"FAIL new exhibition order with customer={customer_name!r} not found in /orders",
                file=sys.stderr,
            )
            return 1
        print(f"OK /orders contains the new exhibition order for {customer_name}")
        page.screenshot(path=str(OUT_DIR / "sprint7-orders-after-smoke.png"), full_page=True)

        # 11) /customers — the new exhibition customer (phone 9876543210) is present.
        page.goto(f"{BASE}/customers")
        page.wait_for_load_state("networkidle")
        cust_search = page.locator('input[type="search"]').first
        cust_search.fill(phone)
        page.wait_for_timeout(500)
        try:
            page.wait_for_selector(
                f'text="{customer_name}"',
                timeout=5000,
            )
        except PWTimeout:
            page.screenshot(path=str(OUT_DIR / "sprint7-customers-after-smoke-failed.png"), full_page=True)
            print(
                f"FAIL new exhibition customer phone={phone} name={customer_name!r} "
                "not found in /customers",
                file=sys.stderr,
            )
            return 1
        print(f"OK /customers contains the new exhibition customer ({customer_name}, {phone})")

        # 12) Console errors check
        if console_errors:
            # Filter out noisy non-fatal warnings the bill-flow ignores too.
            print(f"WARN {len(console_errors)} console error(s) during the flow:")
            for e in console_errors[:10]:
                print(f"  {e}")
            # Be strict per memory feedback_advisor_before_done: fail loudly on console errors.
            cleanup_via_rest(page, event_name, customer_name)
            browser.close()
            return 1

        cleanup_via_rest(page, event_name, customer_name)
        browser.close()

    print(
        f"OK Sprint 7 events + public form verify passed. "
        f"event_id={event_id} slug={slug} order_number={order_number}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
