"""
Regression smoke for the repeat-customer cross-event confirmation bug (task #7,
migration 0009). A customer (same phone) orders at exhibition A, then at a
DIFFERENT exhibition B; both confirmations must resolve. Before 0009 the second
returned null ("Order not found.") because the anti-leak keyed on
customers.source_event_id (the customer's FIRST event). 0009 added
orders.event_id so each order resolves against its OWN event.

REST-only (the bug lives in the SECURITY DEFINER RPCs, not the UI): exercises
public_create_exhibition_order + public_get_order_by_ref exactly as the app does,
with the anon key. Idempotent + self-cleaning. Uses .env.local.

Run: python scripts/verify-exhibition-repeat.py [--url <supabase-url>]
(default: VITE_SUPABASE_URL from .env.local — the RPCs hit the prod DB regardless
of frontend, so no preview server is needed.)
"""

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def load_env() -> dict:
    env = {}
    for raw in pathlib.Path(".env.local").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^\s*\$env:(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line) or re.match(
            r'^\s*(\w+)\s*=\s*"?([^"\r\n]*)"?\s*$', line
        )
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env


def req(url, method, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> int:
    ap = argparse.ArgumentParser(description="Exhibition repeat-customer cross-event regression smoke")
    ap.add_argument("--url", default=None, help="Supabase project URL (default: VITE_SUPABASE_URL)")
    args = ap.parse_args()

    env = load_env()
    url = (args.url or env.get("VITE_SUPABASE_URL", "")).rstrip("/")
    anon = env.get("VITE_SUPABASE_PUBLISHABLE_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
    email, pw = env.get("SMOKE_EMAIL"), env.get("SMOKE_PASSWORD")
    if not all([url, anon, email, pw]):
        print("ERROR: missing url/anon/SMOKE creds in .env.local", file=sys.stderr)
        return 2

    st, txt = req(f"{url}/auth/v1/token?grant_type=password", "POST",
                  {"apikey": anon, "Content-Type": "application/json"}, {"email": email, "password": pw})
    if st != 200:
        print(f"FAIL login {st}", file=sys.stderr)
        return 1
    jwt = json.loads(txt)["access_token"]
    A = {"apikey": anon, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
    an = {"apikey": anon, "Content-Type": "application/json"}
    hm = {**A, "Prefer": "return=minimal"}
    print("OK login")

    ts = int(time.time() * 1000)
    today = datetime.now(IST).strftime("%Y-%m-%d")
    end = (datetime.now(IST) + timedelta(days=5)).strftime("%Y-%m-%d")
    phone = "9" + str(ts)[-9:]  # unique, valid IN mobile
    _, ptxt = req(f"{url}/rest/v1/products?select=id&limit=1", "GET", A)
    prods = json.loads(ptxt)
    if not prods:
        print("FAIL no products to order", file=sys.stderr)
        return 1
    pid = prods[0]["id"]

    ev = {}
    oids = []
    rc = 0
    try:
        for k in ("A", "B"):
            slug = f"zzrepeat{k}-{ts}"
            _, etxt = req(f"{url}/rest/v1/events", "POST", {**A, "Prefer": "return=representation"},
                          {"name": f"ZZREPEAT {k} {ts}", "kind": "exhibition", "starts_on": today,
                           "ends_on": end, "slug": slug, "active": True})
            ev[k] = {"id": json.loads(etxt)[0]["id"], "slug": slug}
        print(f"OK setup: 2 events ({ev['A']['slug']}, {ev['B']['slug']}), phone {phone}")

        def create(slug):
            s, c = req(f"{url}/rest/v1/rpc/public_create_exhibition_order", "POST", an,
                       {"p_slug": slug, "p_name": f"ZZREPEAT Cust {ts}", "p_phone": phone,
                        "p_notes": "", "p_items": [{"product_id": pid, "qty": 1}], "p_honeypot": ""})
            if s not in (200, 201):
                raise RuntimeError(f"create failed {s}: {c[:200]}")
            return json.loads(c)["order_id"]

        def resolves(slug, oid):
            s, g = req(f"{url}/rest/v1/rpc/public_get_order_by_ref", "POST", an,
                       {"p_slug": slug, "p_order_id": oid})
            try:
                b = json.loads(g)
            except Exception:
                b = None
            return isinstance(b, dict) and bool(b.get("order"))

        oa = create(ev["A"]["slug"]); oids.append(oa)
        if not resolves(ev["A"]["slug"], oa):
            print("FAIL first-event order did not resolve (control)", file=sys.stderr); rc = 1
        else:
            print("OK order at event A resolves its confirmation")

        ob = create(ev["B"]["slug"]); oids.append(ob)  # same phone -> dedup reuse; before 0009 this broke
        # confirm dedup actually reused the same customer (else the test proves nothing)
        custs = set()
        for oid in oids:
            _, o = req(f"{url}/rest/v1/orders?select=customer_id&id=eq.{oid}", "GET", A)
            custs.add(json.loads(o)[0]["customer_id"])
        if len(custs) != 1:
            print(f"WARN dedup did not reuse the customer ({len(custs)} customers) — test is weaker than intended")
        else:
            print("OK same customer reused across both events (dedup-on-phone)")

        if not resolves(ev["B"]["slug"], ob):
            print("FAIL repeat customer's order at event B did NOT resolve — the bug is back", file=sys.stderr); rc = 1
        else:
            print("OK repeat customer's order at event B resolves its confirmation (bug fixed)")

        # Anti-leak invariant (the property the original 0005 check protected):
        # an order must NOT resolve under a DIFFERENT event's slug, or the ref
        # query param could be tampered to view another event's orders.
        if resolves(ev["A"]["slug"], ob) or resolves(ev["B"]["slug"], oa):
            print("FAIL anti-leak breach: an order resolved under the wrong event's slug", file=sys.stderr); rc = 1
        else:
            print("OK anti-leak holds: an order does not resolve under another event's slug")
    except Exception as e:
        print(f"FAIL {e}", file=sys.stderr); rc = 1
    finally:
        custs = set()
        for oid in oids:
            try:
                _, o = req(f"{url}/rest/v1/orders?select=customer_id&id=eq.{oid}", "GET", A)
                custs.add(json.loads(o)[0]["customer_id"])
            except Exception:
                pass
            req(f"{url}/rest/v1/order_items?order_id=eq.{oid}", "DELETE", hm)
        for oid in oids:
            req(f"{url}/rest/v1/orders?id=eq.{oid}", "DELETE", hm)
        for cid in custs:
            req(f"{url}/rest/v1/customers?id=eq.{cid}", "DELETE", hm)
        for k in ev:
            req(f"{url}/rest/v1/events?id=eq.{ev[k]['id']}", "DELETE", hm)
        print("OK cleanup (order_items -> orders -> customer -> events)")

    if rc == 0:
        print("OK exhibition repeat-customer verify passed.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
