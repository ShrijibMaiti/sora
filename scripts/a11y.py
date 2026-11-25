"""Accessibility audit (WCAG 2.1 AA, axe-core) of every screen, dark and light, desktop and phone.

    python scripts/a11y.py http://localhost:8000 [screenshot_dir]

Fails (exit 1) on serious or critical violations. Needs web/node_modules/axe-core (npm ci in web/).
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
AXE = Path(__file__).resolve().parent.parent / "web" / "node_modules" / "axe-core" / "axe.min.js"
PAGES = [("landing", "/"), ("live", "/app/#tab=live&city=delhi"), ("trip", "/app/#tab=trip&city=delhi"),
         ("day", "/app/#tab=day&city=delhi"), ("whatif", "/app/#tab=whatif&city=delhi"), ("insights", "/app/#tab=insights&city=delhi")]
VIEWS = [("desktop", 1440, 900), ("phone", 390, 844)]
BLOCKING = {"serious", "critical"}

found, total = {}, 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for theme in ("dark", "light"):
        for view, w, h in VIEWS:
            # bypass_csp: the app's CSP (rightly) blocks the injected axe script
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=view == "phone", has_touch=view == "phone", bypass_csp=True)
            ctx.add_init_script(f"localStorage.setItem('sora.onboarded', '1'); localStorage.setItem('sora.theme', '{theme}')")
            pg = ctx.new_page()
            for name, path in PAGES:
                pg.goto("about:blank")  # a hash-only change wouldn't reload the app, which reads #tab= on load
                pg.goto(BASE + path)
                pg.wait_for_load_state("networkidle", timeout=90000)
                pg.wait_for_timeout(1200)
                pg.add_script_tag(path=str(AXE))
                res = pg.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}})")
                for v in res["violations"]:
                    total += 1
                    key = (v["id"], v["impact"])
                    entry = found.setdefault(key, {"help": v["help"], "where": set(), "nodes": set()})
                    entry["where"].add(f"{name}/{theme}/{view}")
                    entry["nodes"].update(n["target"][0] if isinstance(n["target"][0], str) else str(n["target"][0]) for n in v["nodes"][:3])
                if SHOTS:
                    SHOTS.mkdir(parents=True, exist_ok=True)
                    pg.screenshot(path=str(SHOTS / f"{name}_{theme}_{view}.png"))
            ctx.close()
    b.close()

blocking = 0
for (rule, impact), e in sorted(found.items(), key=lambda kv: kv[0][1] not in BLOCKING):
    blocking += impact in BLOCKING
    print(f"{'FAIL' if impact in BLOCKING else 'warn'} [{impact}] {rule}: {e['help']}")
    print(f"     on {len(e['where'])} screen(s), e.g. {sorted(e['where'])[:3]}; elements {sorted(e['nodes'])[:4]}")
print(f"\n{'PASS' if not blocking else 'FAIL'}: {blocking} serious/critical rule(s), {len(found) - blocking} minor, {total} findings in all")
sys.exit(1 if blocking else 0)
