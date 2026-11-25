"""End-to-end smoke test of a running Sora (API + web app) in a real browser.

    pip install -e ".[e2e]" && playwright install chromium
    python scripts/smoke.py http://localhost:8000 [screenshot_dir]

Run against a real deployment as a release check, or against `SORA_FAKE_DATA=1` (as CI does). Exits 1 on any failure.
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

    # installable app: service worker in control, then offline the app opens on the saved forecast and says so
    check(pg.evaluate("fetch('/manifest.webmanifest').then(r => r.ok)"), "web app manifest is served")
    pg.evaluate("navigator.serviceWorker.ready")
    pg.reload()
    pg.wait_for_load_state("networkidle", timeout=60000)
    check(pg.evaluate("!!navigator.serviceWorker.controller"), "service worker controls the app")
    pg.context.set_offline(True)
    pg.reload()
    pg.wait_for_timeout(3000)
    body = pg.inner_text("body")
    check("You're offline" in body and "Can't reach" not in body, "offline: app opens on the saved forecast")
    pg.context.set_offline(False)

    # on-device recording (Insights): permission granted, a fix is kept on the device; a seeded hour renders as stays and a ride
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["geolocation"],
                        geolocation={"latitude": 28.5677, "longitude": 77.2433, "accuracy": 20})
    rp = ctx.new_page()
    rp.on("pageerror", lambda e: problems.append(f"page error: {e}"))
    rp.goto(BASE + "/app#tab=insights&city=delhi")
    rp.wait_for_load_state("networkidle", timeout=120000)
    if rp.get_by_role("button", name="Skip").count():
        rp.get_by_role("button", name="Skip").click()
    rp.get_by_role("button", name="Record my trips").click()
    rp.wait_for_function("JSON.parse(localStorage.getItem('sora.track') || '[]').length > 0", timeout=15000)
    check(rp.get_by_role("button", name="Stop recording").count() == 1, "recording: starts and keeps a fix on the device")
    rp.evaluate("""() => {
      const IST = 5.5 * 3600e3, now = Date.now(), day0 = now + IST - ((now + IST) % 86400e3) - IST, fx = [];
      const at = (m, lat, lon) => fx.push({ t: day0 + 8 * 3600e3 + m * 60e3, lat, lon, acc: 15 });
      for (let m = 0; m <= 30; m += 2) at(m, 28.5677, 77.2433);
      for (let m = 31; m < 55; m++) at(m, 28.5677 + (28.545 - 28.5677) * (m - 30) / 25, 77.2433 + (77.1926 - 77.2433) * (m - 30) / 25);
      for (let m = 55; m <= 95; m += 2) at(m, 28.545, 77.1926);
      localStorage.setItem('sora.track', JSON.stringify(fx)); localStorage.setItem('sora.recording', '0');
    }""")
    rp.reload()
    rp.wait_for_load_state("networkidle", timeout=60000)
    rec = rp.get_by_role("region", name="Recorded today").inner_text()
    check("µg" in rec and rec.count("Stayed") == 2 and "Rode" in rec, "recording: a seeded hour shows two stays, a ride and a dose")
    ctx.close()
    b.close()

for name in ("cities", "places", "field", "events", "plan", "day", "counterfactual"):
    got = [s for m, n, s in calls if n == name and not (name == "field" and s == 404)]  # other pollutants: 404 unavailable
    check(bool(got) and all(s == 200 for s in got), f"/api/{name}: {sorted(set(got)) or 'not called'}")
check(not [x for x in problems if x.startswith("page error")], "no page errors")
print(f"\n{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
for x in problems:
    print("  -", x)
sys.exit(1 if problems else 0)
