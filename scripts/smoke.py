"""End-to-end smoke test of a running Sora (API + web app) in a real browser.

    pip install -e ".[e2e]" && playwright install chromium
    python scripts/smoke.py http://localhost:8000 [screenshot_dir]

Needs live data (Open-Meteo, OSM), so it is a release check, not a CI test. Exits 1 on any failure.
"""
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
problems, calls = [], []


def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        problems.append(what)


try:
    with urllib.request.urlopen(BASE + "/api/health", timeout=10) as r:
        check(r.status == 200, "/api/health is 200")
except Exception as e:
    check(False, f"/api/health: {e}")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: problems.append(f"page error: {e}"))
    pg.on("response", lambda r: "/api/" in r.url and calls.append((r.request.method, r.url.split("/api/")[1].split("?")[0], r.status)))

    pg.goto(BASE + "/")
    pg.wait_for_load_state("networkidle")
    check(pg.get_by_role("link", name="Launch Sora").count() > 0 or "sora" in pg.title().lower(), "landing page renders")

    pg.goto(BASE + "/app#tab=live&city=delhi")
    pg.wait_for_load_state("networkidle", timeout=120000)
    if pg.get_by_role("button", name="Skip").count():
        pg.get_by_role("button", name="Skip").click()
    check("Can't reach" not in pg.inner_text("body"), "app reaches the API")
    for tab in ("Live", "Trip", "What if", "Day"):
        pg.get_by_role("button", name=tab).first.click()
        pg.wait_for_load_state("networkidle", timeout=60000)
        pg.wait_for_timeout(1500)
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            pg.screenshot(path=str(SHOTS / f"{tab.replace(' ', '').lower()}.png"))
    b.close()

for name in ("cities", "places", "field", "events", "plan", "day", "counterfactual"):
    got = [s for m, n, s in calls if n == name and not (name == "field" and s == 404)]  # other pollutants: 404 unavailable
    check(bool(got) and all(s == 200 for s in got), f"/api/{name}: {sorted(set(got)) or 'not called'}")
check(not [x for x in problems if x.startswith("page error")], "no page errors")
print(f"\n{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
for x in problems:
    print("  -", x)
sys.exit(1 if problems else 0)
