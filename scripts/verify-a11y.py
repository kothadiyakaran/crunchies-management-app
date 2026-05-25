"""
Sprint 9 T9.5 — accessibility (axe-core) verification.

What this asserts (against the running dev server at http://localhost:5173):
  1. Login as mom.
  2. For each authenticated route in ROUTES, navigate, inject axe-core via
     CDN <script>, run axe.run(), and assert zero violations of impact
     "serious" or "critical". Log moderate/minor counts to stdout for
     the audit record.
  3. Optionally visit /order/<EVENT_SLUG> anonymously (no login) if a slug
     is exported as SMOKE_EVENT_SLUG env var or written in .env.local.
     Skip silently if not available — the ADR will note this.

Prereq: a dev server must be running on http://localhost:5173. Start it with:
    npm run dev
in a separate terminal, then run this script.
"""

import io
import json
import os
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

# Windows cp1252 console can't encode some glyphs (→, ✓, etc.). Force UTF-8.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

BASE = os.environ.get("SMOKE_URL", "http://localhost:5173")
# CLI override: --url <url>. Argparse is overkill for a single optional flag.
for _i, _arg in enumerate(sys.argv):
    if _arg == "--url" and _i + 1 < len(sys.argv):
        BASE = sys.argv[_i + 1]
        break
OUT_DIR = pathlib.Path("scripts/screenshots")
AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js"

# Routes to audit. Each entry: (path, label, wait_selector).
ROUTES = [
    ("/today", "today", 'h1:has-text("Today")'),
    ("/orders", "orders", 'h1:has-text("Orders")'),
    ("/customers", "customers", 'h1:has-text("Customers")'),
    ("/production", "production", 'h1:has-text("Production")'),
    ("/reports", "reports", 'h1:has-text("Reports")'),
    ("/settings", "settings", 'h1:has-text("Settings")'),
    ("/events", "events", 'h1:has-text("Events")'),
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


def run_axe(page) -> dict:
    """Inject axe-core from CDN and execute axe.run() in page context."""
    page.add_script_tag(url=AXE_CDN)
    # Pump one tick so axe attaches.
    page.wait_for_function("() => typeof window.axe !== 'undefined'", timeout=10000)
    return page.evaluate(
        """async () => {
            const result = await window.axe.run(document, {
                resultTypes: ['violations'],
            });
            // Strip DOM nodes from the result so it serialises cleanly.
            return {
                violations: result.violations.map(v => ({
                    id: v.id,
                    impact: v.impact,
                    description: v.description,
                    help: v.help,
                    helpUrl: v.helpUrl,
                    nodes: v.nodes.length,
                    sampleTargets: v.nodes.slice(0, 3).map(n => ({
                        target: (n.target || []).join(' '),
                        failureSummary: n.failureSummary || '',
                    })),
                })),
            };
        }"""
    )


def summarise(label: str, result: dict) -> tuple[int, int]:
    """
    Return (serious_or_critical_count, moderate_or_minor_count).
    Color-contrast violations are counted into serious/critical normally —
    Sprint 10 close retuned the design tokens to clear WCAG AA 4.5:1
    (ink-500 #6E655E, brand-orange #B8450F) so contrast is no longer
    carved out.
    Prints a human-readable summary to stdout.
    """
    other = result["violations"]
    serious = [v for v in other if v["impact"] in ("serious", "critical")]
    moderate = [v for v in other if v["impact"] in ("moderate", "minor")]
    if not other:
        print(f"  {label}: axe clean (0 violations)")
    else:
        print(
            f"  {label}: {len(serious)} serious/critical, "
            f"{len(moderate)} moderate/minor (non-contrast)"
        )
        for v in serious:
            print(f"    [{v['impact']}] {v['id']} ({v['nodes']}x nodes): {v['help']}")
            print(f"      -> {v['helpUrl']}")
            for st in v.get("sampleTargets", []):
                print(f"        target: {st['target']}")
                # Print up to two lines of failure summary so we see contrast ratios.
                for line in (st.get("failureSummary") or "").splitlines()[:2]:
                    print(f"          {line.strip()}")
        for v in moderate:
            print(f"    [{v['impact']}] {v['id']} ({v['nodes']}x nodes): {v['help']}")
    return len(serious), len(moderate)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    email, password = load_creds()
    event_slug = load_event_slug()

    console_errors: list[str] = []
    total_serious = 0
    total_moderate = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        do_login(page, email, password)
        print("OK login")

        print("\nAxe violations per route (authenticated):")
        for path, label, selector in ROUTES:
            page.goto(f"{BASE}{path}")
            page.wait_for_load_state("networkidle")
            try:
                page.wait_for_selector(selector, timeout=10000)
            except Exception:
                # Routes can still be auditable even if header text differs;
                # we'd rather audit than abort early.
                pass
            result = run_axe(page)
            s, m = summarise(label, result)
            total_serious += s
            total_moderate += m

        # Optional anonymous route
        if event_slug:
            print(f"\nAxe violations per route (anonymous /order/{event_slug}):")
            # Context with fresh storage to drop the auth cookie.
            anon_ctx = browser.new_context()
            anon_page = anon_ctx.new_page()
            anon_page.goto(f"{BASE}/order/{event_slug}")
            anon_page.wait_for_load_state("networkidle")
            result = run_axe(anon_page)
            s, m = summarise(f"order/{event_slug}", result)
            total_serious += s
            total_moderate += m
            anon_ctx.close()
        else:
            print(
                "\nSKIP anonymous /order/<slug> route — set SMOKE_EVENT_SLUG "
                "to enable.",
                file=sys.stderr,
            )

        if console_errors:
            print(f"\nWARN {len(console_errors)} console error(s) during the flow:")
            for e in console_errors[:10]:
                print(f"  {e}")

        browser.close()

    print("")
    print(f"Total serious/critical violations: {total_serious}")
    print(f"Total moderate/minor violations:   {total_moderate}")

    if total_serious > 0:
        print("FAIL serious/critical axe violations found.", file=sys.stderr)
        return 1
    if console_errors:
        return 1
    print("OK Sprint 9 a11y verify passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
