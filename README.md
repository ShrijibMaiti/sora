# Sora — Urban Personal Exposure Digital Twin

Sora estimates the air pollution **you** breathe, not just the city's air quality: it combines a 0–72 h PM2.5 forecast
with where you go, when, how you travel and the buildings you spend time in, then suggests routes, departure times
and day plans that lower your dose, with an honest confidence for each suggestion.

- Source of truth: [`docs/sora_master_spec.md`](docs/sora_master_spec.md). Section numbers (§) below refer to it.
- API between `web/` and `sora/api/`: [`docs/api_contract.md`](docs/api_contract.md).
- Design system: [`web/DESIGN.md`](web/DESIGN.md).
- Tiers: **T0** MVP · **T1** Competition · **T2** Research.

## Status

**Live for Delhi, Kolkata, Mumbai and Chennai.** Everything outside the ML layers is built:

| Area | What works |
|---|---|
| Forecast | Hourly 0–72 h fields for PM2.5, PM10, NO₂, O₃, SO₂ and CO from the CAMS global forecast (Open-Meteo) on a 12×12 grid, each with a fixed log-normal uncertainty band; rebuilt just after every hour. Labelled degradation **L3** (spec §39: the fallback forecast): no station correction or street-scale downscaling yet (that is the ML work). Trip and day planning use PM2.5. |
| Alerts | Stagnant air (low mixing height + calm wind), rain washout, smoke from upwind fires (forecast + FIRMS), and festival smoke from a calendar (Diwali, Bhogi; `events/calendar.py`, extend yearly). |
| Stations, fires | OpenAQ station status and NASA FIRMS fires on the map when their keys are set. Shown, not assimilated. |
| Trip planning | Routes on the OSM road network × departure times in your window, dose over a common window (indoors before and after included), 128 shared field samples for every range and "chance it's lower" (spec §23, §24, §31). Options compete on a risk-aware dose (mean + CVaR, §31.2); arrival deadlines must hold on 9 days in 10 given each mode's travel-time spread (§31.3); the full Pareto front, a robustness margin (§31.5–31.6) and a breakdown of where the dose comes from (§22.4) come with every plan. Plans follow the pollutant on the map: NO₂, O₃, SO₂, CO and PM10 use their own near-road, indoor and in-vehicle factors (§22.5). |
| Exposure model | Indoor air follows the dynamic mass-balance model (§21.3): it lags outdoor air by 25–70 min depending on the building, so short peaks are blunted indoors. Breathing rates by activity (§22.2). |
| Explanations | Template sentences built only from computed numbers (`assistant/explain.py`): why the recommendation wins, which road matters most, how robust the advice is, arrival confidence. |
| Metro | Real lines from OpenStreetMap route relations in every city: walk or auto to the station, rides, changes at interchanges, walk or auto at the end (mixed-mode), with a dose for each ride and wait. Typical speeds and waits, not the timetable. |
| Day planning | Whole-day schedule (07:00–23:00): alternative places and departure shifts within your extra-travel budget, scored on the same risk-aware dose (spec §25). Each leg can use its own mode (car to college, metro home). |
| What if | Leave later, change mode, change destination / building, stay in during the peak, with the building's lag in the reasoning (spec §26). |
| Places | Featured places and an example trip and day per city; search over ~2,500 OSM neighbourhoods, stations, destinations and roads, served by Sora's own API. |
| Web app | Landing page, map app (Live, Trip, Day, What if, Insights), `/styleguide`. Insights shows the days you planned and, if you turn it on, the trips you actually made while Sora was open (stays and rides from GPS, with a rough dose); both stay on your device only. WCAG 2.1 AA clean (axe) on every screen, dark and light, desktop and phone. |
| Installable + offline | Web app manifest and service worker (`web/public/sw.js`): installable, works offline on the last saved forecast and says so; trip and day planning need a connection. |
| Notifications | Opt-in, in settings: alerts for the city (smoke, stagnant air, festivals) and suggestions for your saved trip (spec §28.2: ≥15% lower, ≥80% likely, at most one a day), delivered by Web Push even when Sora is closed. Reminder texts and your trip stay on the device; the server keeps only where to push and when (`sora/push.py`). |
| Ops | One process serves API + app, gzip, security headers (CSP with hashed inline script, no framing), per-IP rate limits, `/api/health`, `/api/metrics` (Prometheus), Docker image. CI runs backend tests, the web build, the Docker build, and the browser smoke and accessibility tests on synthetic data (`SORA_FAKE_DATA=1`). |

Placeholders (empty files in the tree below): the T0 field model (station ML + LUR), physics, neural operator, GNNs,
generative uncertainty, simulators, mobility inference, personal twin, baselines and evaluation.

Shortcuts the answers state in their caveats: fixed microenvironment, near-road, indoor and speed priors instead of
fitted values and live traffic; one travel-time spread per mode; metro at typical speeds and waits, not the timetable; field uncertainty
from a fixed prior, not an ensemble; robustness as one uniform perturbation, not per-region sensitivities.

## Run

Development (two terminals):

```
pip install -e ".[dev]"
uvicorn sora.api.main:app --reload            # API on :8000. First start fetches CAMS (~10 s), the OSM road graph (~40 s)
                                              # and the OSM place names (~40 s); the OSM files are cached in data_cache/
cd web; npm install
$env:VITE_USE_MOCK='false'; npm run dev       # app on :5173 against the API (omit the variable for the in-browser mock)
pytest                                        # backend tests on synthetic data, no network
cd web; npm test; cd ..                       # on-device logic (trip recording), Node 22.18+
```

Production, one process serving the API and the built app (`/`, `/app`, `/styleguide`, `/api/*`):

```
cd web; npm ci; npm run build; cd ..
uvicorn sora.api.main:app --host 0.0.0.0 --port 8000
python scripts/smoke.py http://localhost:8000  # release check in a real browser (pip install -e ".[e2e]"; playwright install chromium)
```

Docker: `docker build -t sora .` then `docker run -p 8000:8000 -v sora-data:/data sora`. `/api/health` returns 200
while every live city has a field to serve, and the image's HEALTHCHECK uses it.

`npm run dev` uses the in-browser mock (Delhi demo data); production builds call the real API. Override either with
`VITE_USE_MOCK=true|false`.

| Variable | Default | Purpose |
|---|---|---|
| `OPENAQ_API_KEY` | unset | Station status on the map ([free key](https://explore.openaq.org/register)) |
| `FIRMS_MAP_KEY` | unset | Active fires and the upwind-smoke alert ([free key](https://firms.modaps.eosdis.nasa.gov/api/map_key/)) |
| `SORA_CACHE` | `data_cache/` (`/data` in Docker) | OSM road graph and place-name cache |
| `SORA_WEB_DIST` | `web/dist` | Built web app to serve; nothing is served if the folder is missing |
| `SORA_LOG_LEVEL` | `INFO` | Python log level |
| `SORA_VAPID_SUBJECT` | `mailto:push@sora.invalid` | Contact the push services see (VAPID `sub`): set your site URL or a contact address in production. The key pair is created in `SORA_CACHE` on first use; keep that folder |
| `SORA_TRUST_PROXY` | unset | `1` behind a reverse proxy: rate limits use `X-Forwarded-For`, HSTS follows `X-Forwarded-Proto` |
| `SORA_METRICS_TOKEN` | unset | If set, `/api/metrics` needs `Authorization: Bearer <token>` |
| `SORA_RATE_LIMIT` | on | `off` disables rate limits (tests) |
| `SORA_FAKE_DATA` | unset | `1` serves synthetic, deterministic data with no network (CI browser tests) |

CI (`.github/workflows/ci.yml`): backend tests, web typecheck and build, Docker build, and an `e2e` job that serves the
built app on synthetic data and runs `scripts/smoke.py` (every screen + offline) and `scripts/a11y.py` (WCAG 2.1 AA).

### Hosting

Any container host works: run the image with a persistent volume on `/data` (road graphs, place index, push store,
VAPID key) and HTTPS in front (service workers and push need it). Set `SORA_VAPID_SUBJECT`, `SORA_TRUST_PROXY=1`
behind a proxy, optionally `OPENAQ_API_KEY`, `FIRMS_MAP_KEY` and `SORA_METRICS_TOKEN`. Several workers on one host are fine (the
push store is SQLite, `push.db`, and claims each wake-up once); scaling across hosts needs a shared database first. Before a public launch, move map tiles from
tile.openstreetmap.org (light use only) to a keyed tile provider and add it to the CSP in `sora/api/middleware.py`.

## API

All under `/api`, JSON; full shapes and error codes in [`docs/api_contract.md`](docs/api_contract.md).

| Endpoint | |
|---|---|
| `GET /cities` | Cities, status, field and routable extents |
| `GET /places?city=` | Featured places + the example trip and day |
| `GET /search?city=&q=` | Place search (OSM names, roads, featured places) |
| `GET /field?city=&pollutant=` | 0–72 h field: median, 90% band, wind, stations, fires, data status |
| `GET /events?city=` | Forecast alerts |
| `POST /plan` | Route × departure options for one trip |
| `POST /day` | Optimized whole day |
| `POST /counterfactual` | "What if" on a trip |
| `GET /health` | Uptime check |

Adding a city: add it to `sora/config.py` `CITIES` (with `built=False` it shows as Preview), then its `PLACES` and
`EXAMPLES` (take coordinates from the OSM extract the server caches in `data_cache/places_{city}.json`), then set
`built=True`. Tests check every featured place is routable, every example uses featured places, and no place key
repeats across cities.

## File tree

`●` = implemented; everything else is a placeholder for later tiers.

```text
sora/
├── README.md · pyproject.toml · Dockerfile · .dockerignore
├── .github/workflows/ci.yml          ● tests, web build, Docker build
├── docs/                             spec, API contract, original plan, session history
│
├── configs/                          placeholders for the ML work (cities live in sora/config.py)
│   ├── sim/wrfchem_namelist.template · ensemble.yaml                                           §17.4, §34.2  T1
│   └── experiments/{baselines,operator,ablations}.yaml                                         §35–36
│
├── sora/                             ── backend + ML (Python) ──
│   ├── config.py                     ● cities, featured places, example trip/day, constants   §3.3
│   ├── geo.py                        ● distances, projections
│   ├── pipeline.py                   ● hourly refresh of field, road graph, place index       §18.2
│   ├── push.py                       ● Web Push store (SQLite) and sender (wake-ups, alerts)  §28
│   ├── fake.py                       ● synthetic data for tests and SORA_FAKE_DATA=1
│   │
│   ├── data/                         L1 ingestion                                              §11
│   │   ├── openmeteo.py              ● CAMS PM2.5 + ERA5/IFS met (point API)                    T0
│   │   ├── openaq.py                 ● station status + hourly PM2.5 (OpenAQ v3)                T0
│   │   ├── qc.py                     ● range / stuck / spike checks                             §12.4  T0
│   │   ├── osm.py                    ● road network, place names, metro lines (Overpass)        T0
│   │   ├── fires.py                  ● FIRMS active fires                                       §11.3
│   │   ├── cpcb.py · era5.py · cams.py · satellite.py · buildings.py · traffic.py              T1
│   │   └── inventories.py · campaign.py                                                        T1
│   │
│   ├── fusion/                       L2 obs_operators.py · errors.py · lowcost_calibration.py  §12.3  T1
│   ├── representation/               L3                                                        §13
│   │   ├── road_graph.py             ● OSM graph as arrays, snapping, scipy shortest paths
│   │   ├── places.py                 ● place search index (featured + OSM names + roads)
│   │   ├── transit.py                ● metro network: stations, lines, rides, interchanges     §23.6
│   │   └── grid.py · mapping.py · static_features.py · wind_edges.py
│   │
│   ├── field/                        T0 field model                                            §43
│   │   ├── forecast.py               ● 0–72 h fields, six pollutants (CAMS, L3), cache, backoff  §18
│   │   └── correction.py · downscale_lur.py · aqi.py        station ML, LUR, NAQI             T0
│   │
│   ├── physics/ · operator/ · gnn/   L4 physics layer, neural operator, street GNN             §14–17  T1/T2
│   ├── sim/                          Layer-A simulators                                        §11.8   T1/T2
│   │
│   ├── uncertainty/                  L6                                                        §19
│   │   ├── ensemble.py               ● joint field samples for paired comparisons (fixed prior)
│   │   └── gp_sampler.py · generative.py · conformal.py · coverage.py · calibration.py · sobol.py
│   │
│   ├── events/                       abnormal episodes                                         §30
│   │   ├── detect.py                 ● stagnation, rain, upwind-smoke alerts from forecasts
│   │   ├── calendar.py               ● festival smoke alerts (Diwali, Bhogi dates table)
│   │   └── attribution.py
│   │
│   ├── mobility/                     L7                                                        §20
│   │   ├── travel_time.py            ● travel-time spread by mode, late-arrival risk
│   │   └── trajectory.py · map_matching.py · stay_points.py · mode_inference.py
│   │
│   ├── exposure/                     L8                                                        §21–22
│   │   ├── microenv.py               ● modes, buildings, breathing rates, near-road priors
│   │   ├── dose.py                   ● inhaled dose on samples, indoor dwell
│   │   ├── indoor.py                 ● dynamic mass-balance indoor model (lag, F_inf)
│   │   ├── attribution.py            ● dose by indoor time, walking, named road
│   │   └── ventilation.py
│   │
│   ├── decision/                     L9                                                        §23–26, §31
│   │   ├── routing.py                ● route × departure planning (/api/plan)
│   │   ├── schedule.py               ● whole-day optimization (/api/day)
│   │   ├── counterfactual.py         ● what-if engine (/api/counterfactual)
│   │   ├── confidence.py             ● paired P(improvement), bands, "not reliably different"
│   │   ├── risk.py                   ● risk-aware dose (mean + CVaR)
│   │   ├── voi.py                    ● robustness margin of a recommendation
│   │   └── departure.py · pareto.py  (front lives in routing.py)
│   │
│   ├── assistant/                    L10                                                       §28–29
│   │   ├── explain.py                ● template explanations and caveats
│   │   └── proactive.py · nl_interface.py
│   ├── personal/                     L11 personal twin                                         §27
│   ├── baselines/ · eval/            B0–B3, metrics, splits, ablations                         §34–37
│   │
│   └── api/                          FastAPI                                                   §41.2
│       ├── main.py                   ● app, errors, /health, /metrics, serves web/dist, pipeline + push loops
│       ├── middleware.py             ● security headers (CSP), rate limits, metrics
│       ├── schemas.py                ● request models, contract errors
│       └── routes/field.py · events.py · plan.py (plan, day, what-if) · places.py · push.py   ●
│
├── scripts/
│   ├── smoke.py                      ● end-to-end browser check: every screen, offline mode
│   ├── a11y.py                       ● WCAG 2.1 AA audit (axe-core), dark/light, desktop/phone
│   └── build_city.py · run_simulations.py · train_operator.py · train_street_gnn.py · run_baselines.py · run_ablations.py
│
├── tests/                            ● synthetic data (sora/fake.py), no network
│   ├── conftest.py · test_api.py · test_decision.py · test_pipeline.py · test_places.py · test_dose.py · test_ops.py
│   └── test_{qc,aqi,physics,operator,uncertainty}.py   placeholders
│
└── web/                              ── Frontend (Vite + React 18 + TypeScript + Leaflet) ──
    ├── package.json · tsconfig.json · vite.config.ts · index.html · scripts/spa-routes.mjs · scripts/make_icons.py
    ├── public/sw.js · manifest.webmanifest · icons/   service worker (offline, push), install manifest
    ├── DESIGN.md · README.md
    └── src/
        ├── main.tsx · App.tsx                         "/" landing, "/app" application, "/styleguide"
        ├── design/tokens.css                          design tokens (source of truth)
        ├── landing/Landing.tsx · landing.css          landing page; live preview via the API
        ├── state/store.tsx                            app state, API loading, places, plan/day/what-if runners,
        │                                              on-device history, reminders
        ├── api/types.ts · client.ts · mock.ts         API layer; mock = in-browser backend for `npm run dev`
        ├── data/sora.ts                               UI constants (AQI, modes, routes) + Delhi demo data and model
        │                                              behind the mock and the fail-safes
        ├── lib/field.ts · time.ts · layout.ts         field sampling, IST times, layout geometry
        ├── lib/device.ts                              service worker, on-device storage, Web Push
        ├── lib/track.ts · recorder.ts                 on-device trip recording: stays, rides, dose (npm test)
        ├── styleguide/Styleguide.tsx                  design system page
        └── components/
            ├── Chrome.tsx · MapView.tsx · MapChrome.tsx · SidePanel.tsx · Overlays.tsx · Icon.tsx
            ├── Insights.tsx                           planned-day history, recorded trips, suggestions (on device)
            └── panels/LivePanel.tsx · TripPanel.tsx · DayPanel.tsx · WhatIfPanel.tsx · shared.tsx
```
