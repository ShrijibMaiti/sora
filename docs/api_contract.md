# Sora API contract (v1)

Single source of truth for the HTTP API between `web/` and the FastAPI backend (`sora/api/`).
Spec references (§) point to `docs/sora_master_spec.md`. Wire types live in `web/src/api/types.ts`;
the frontend mock (`web/src/api/mock.ts`) implements exactly this contract.

## Conventions

- Base path `/api`. JSON in and out. In dev, Vite forwards `/api` to `http://127.0.0.1:8000`.
- **Times are ISO 8601 with offset** (`2026-11-21T18:15:00+05:30` or `…Z`). The UI displays IST.
- Coordinates are `[lat, lon]` in WGS84 decimal degrees. Bounding boxes are `[south, west, north, east]`.
- Ranges are `Band = { median, p05, p95 }` (90% interval, spec §19).
- Concentrations in µg/m³ (CO in mg/m³); doses in µg (spec §22.3).
- **Errors:** any non-2xx response has the body

  ```json
  { "detail": { "code": "outside", "message": "Start point is outside the routable area for Delhi.", "fastest_min": 42 } }
  ```

  `code` is machine-readable, `message` is safe to show to users, extra fields are optional.
  This is what FastAPI produces for `HTTPException(status_code, detail={...})`.

| code | HTTP | meaning |
|---|---|---|
| `invalid` | 400 | Request failed validation (bad time window, unknown mode/building) |
| `outside` | 400 | Origin or destination outside the city's `route_bbox` |
| `no_route` | 400 | No path between the points for this mode |
| `no_feasible` | 400 | No departure meets `latest_arrival`; `fastest_min` included |
| `not_built` | 404 | City exists but its model is not live yet |
| `unavailable` | 404 | Pollutant not forecast for this city (MVP forecasts PM2.5 only) |
| `unknown_city` | 404 | City key not recognised |
| `beyond_horizon` | 400 | Requested times fall outside the 0–72 h forecast |
| `upstream` | 503 | Forecast inputs (CAMS / met) unreachable and no field from the last 3 h to fall back on |

## GET /api/cities

```ts
City[] = {
  key: string; name: string;
  built: boolean; status: "Live" | "Preview";
  bbox: Bbox;        // forecast field extent (backend config.City.bbox)
  route_bbox: Bbox;  // area with a road graph; trips must start and end inside it (config.City.route_bbox)
  center: LatLng; note: string;
}[]
```

## GET /api/field?city={key}&pollutant={pm25|pm10|no2|o3|so2|co}

Hourly forecast field for one pollutant, 0–72 h (spec §18). Errors: `not_built`, `unavailable`, `unknown_city`, `upstream`.

Backend status: all six pollutants from the CAMS global forecast on a 12×12 grid, each with a fixed log-normal error
band (wider for NO₂ and SO₂, which CAMS resolves poorly at city scale; `degradation: "L5"`). A pollutant with no CAMS
data answers `unavailable`. The planner (`/plan`, `/day`, `/counterfactual`) uses PM2.5 only. No stations are
assimilated yet (`coverage` all 0: the UI then treats every cell as having data); `stations` lists OpenAQ monitors for
display when a key is set.

Planner backend (`sora/decision/`): routes on the OSM graph for `route_bbox`, typical speeds by road class with a rush-hour
factor, fixed microenvironment and near-road priors (spec §21.4), and 128 shared field samples for every band and
`p_better`. Every dose (plan options and what-if) covers the same window, from `earliest` to the latest possible
arrival, including indoor time at both ends.

```ts
{
  city: string; pollutant: PollKey; unit: "µg/m³" | "mg/m³";
  times: ISO[];                  // hourly, times[0] = analysis hour
  lats: number[]; lons: number[];// ascending grid axes, any resolution
  median: number[][][];          // [t][lat][lon]
  p05: number[][][]; p95: number[][][];
  coverage: number[][];          // [lat][lon], 0–1 observation coverage (spec §19.7)
  stations: { name: string; lat: number; lon: number; reporting: boolean }[];
  fires: LatLng[];               // active fire detections (spec §11.3)
  wind: { dir_deg: number[]; speed_ms: number[] };  // city-mean per hour, same length as times; dir = direction wind blows TO
  meta: {
    analysis_time: ISO; next_update: ISO; built_at: ISO;
    degradation: "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";  // spec §39
    n_stations: number; n_reporting: number;
    background: string;          // e.g. "CAMS 00 UTC run"
  }
}
```

AQI category is derived on the client from the CPCB breakpoints (`web/src/data/sora.ts` `BP`), so it is not sent.

## POST /api/plan

Route × departure-time options for one trip (spec §23, §24, §31).

Request:

```ts
{
  city: string; origin: LatLng; dest: LatLng;
  mode: "walk" | "cycle" | "two_wheeler" | "auto" | "car_ac" | "bus" | "metro";
  planned_departure: ISO; earliest: ISO; latest_departure: ISO; latest_arrival: ISO | null;
  max_extra_min: number;
  origin_building: "naturally_ventilated" | "ac_sealed" | "ac_filtered";
  dest_building:   "naturally_ventilated" | "ac_sealed" | "ac_filtered";
}
```

Response:

```ts
{
  baseline: Option;              // id "plan": the user's own plan
  options: Option[];             // ids "A" lowest exposure, "B" balanced, "C" fastest
  recommended: "A" | "B" | "C";
  reliable: boolean;             // false → "options not reliably different today" (spec §31.7)
  explanation: string[]; caveats: string[];
  degradation: string;
  window: { start: ISO; end: ISO };
  front?: { departure: ISO; travel_min: number; extra_min: number; dose: Band; risk: number }[];
                                 // Pareto front: feasible departure × route pairs nothing beats on both travel time
                                 // and risk-aware dose, fastest first (spec §31.1)
  robustness?: { margin_pct: number; where: string; unmonitored: boolean } | null;
                                 // for the recommendation when reliable: how much worse than forecast the air along
                                 // `where` would have to be for it to stop beating the plan (spec §31.5–31.6)
}
Option = {
  id: "plan" | "A" | "B" | "C"; label: string;
  departure: ISO; travel_min: number; distance_km: number;
  dose: Band;                    // µg over the window (spec §22)
  reduction_pct: Band;           // vs baseline, positive = lower dose
  p_better: number | null;       // paired P(dose < baseline), null for baseline (spec §31.5)
  extra_min: number;
  path: LatLng[];
  segments?: { label: string; kind: "indoor" | "access" | "road"; minutes: number; dose: number }[];
                                 // where the dose comes from (spec §22.4), on the median field, largest first
}
```

Options compete on the risk-aware dose `0.5·mean + 0.5·CVaR₉₀` over the samples (spec §31.2): A has the lowest,
B is the knee with small penalties for extra travel and moving the departure, C is the fastest. With
`latest_arrival`, an option is feasible only if it arrives in time on at least 90% of samples, travel times varying
by mode (spec §31.3). Indoor time uses the dynamic mass-balance model (spec §21.3). `front`, `robustness` and
`segments` are absent from the in-browser mock.

Errors: `invalid`, `outside`, `no_route`, `no_feasible`, `beyond_horizon`, `not_built`.

## POST /api/day

Whole-day schedule optimization (spec §25).

Request:

```ts
{
  city: string; mode: Mode; max_extra_min: number;
  stops: {
    name: string;                // "Home", "College", "Gym"…
    place: { label: string; lat: number; lon: number };
    alternatives?: { label: string; lat: number; lon: number; building?: Building }[];  // location choice (spec §25.4)
    arrive_after?: ISO; leave_before?: ISO; duration_min?: number;
    building: Building;
    activity?: "rest" | "light" | "moderate" | "high";
  }[];
}
```

Errors: `invalid` (fewer than two stops), `no_feasible` (stops don't fit their windows), `not_built`.

Response:

```ts
{
  stops: { name: string; place: string; chosen: string; icon: string; window: string; duration: string; building: string }[];  // display rows; chosen = place used in the optimized day
  original:  { segments: Segment[]; total: Band };
  optimized: { segments: Segment[]; total: Band };
  changes: { icon: string; title: string; detail: string; delta_ug: number }[];
  reduction_pct: Band; p_better: number; extra_min: number;
}
Segment = { me: "home"|"road"|"vehicle"|"metro"|"work"|"gym"|"restaurant"; start: ISO; end: ISO; dose: number; label?: string }
```

## POST /api/counterfactual

"What if" on a planned trip (spec §26).

Request: `{ plan: PlanRequest; change: Change }` where

```ts
Change =
  | { kind: "shift_departure"; minutes: number }
  | { kind: "mode"; mode: Mode }
  | { kind: "destination"; dest: LatLng; dest_building?: Building }
  | { kind: "stay_indoors"; start: ISO; end: ISO }
```

Response: `{ delta_pct: Band; p_better: number; verdict: string; reason: string }`
(`delta_pct` negative = lower dose; `p_better` = chance the change lowers the dose).

## GET /api/events?city={key}

Abnormal-episode alerts (spec §30).

```ts
{ kind: "fire" | "inversion" | "dust" | "festival" | "rain" | "traffic" | "industrial";
  title: string; body: string; start: ISO; end: ISO | null;
  severity: "warning" | "info" | "success"; probability: number }[]
```

Sources today: `inversion` (forecast mixing height + wind), `rain` (forecast precipitation), `fire` (FIRMS detections
upwind, needs `FIRMS_MAP_KEY`), `festival` (calendar: Diwali, Bhogi; `sora/events/calendar.py`). Sorted by `start`.

## GET /api/places?city={key}

The city's featured places and the trip / day the app opens with (backend `config.PLACES`, `config.EXAMPLES`).
Errors: `not_built`, `unknown_city`.

```ts
{
  places: Place[];
  example: {
    trip: { origin: string; dest: string; mode: Mode; dep: string; origin_building: Building; dest_building: Building };  // place keys; dep is IST "HH:MM"
    day: { name: string; place: string; alt?: string; alt_building?: Building; after?: string; before?: string;
           duration_min?: number; building: Building; activity: "rest" | "light" | "moderate" | "high" }[];
  } | null;
}
Place = { key: string; name: string; sub: string; lat: number; lon: number; building: Building | null }
```

## GET /api/search?city={key}&q={text}

Up to 8 places matching `q` (2+ characters), all inside `route_bbox`: featured places, then OSM neighbourhoods,
stations and everyday destinations (colleges, gyms, markets…), then named roads. Search runs on Sora's server from a
cached OSM extract; the query never goes to a third party. Returns `Place[]`. Errors: `invalid` (no `q`), `not_built`,
`unknown_city`. If the OSM extract can't be fetched, only featured places are searched.

## GET /api/health

For uptime checks, not used by the app. `200` when every live city has a field to serve (current, or under 3 h old
after an upstream failure), else `503`. Never triggers a build.

```ts
{ ok: boolean; cities: { [key: string]: { fresh: boolean; analysis_time: ISO | null; usable: boolean } } }
```

## Not an endpoint: Insights

Exposure history, trends and proactive suggestions are computed **on the device** from the user's
own trajectory history (spec §27, §40, §41.3). Raw location history never goes to the server, so
there is deliberately no `/api/insights`. Until trajectories are tracked, the Insights screen shows the days the user
planned (each `/api/day` result is kept in localStorage, last 30) and suggestions from the live plan, day and events.

## Routable area (Delhi)

`route_bbox` must cover every place a demo trip uses. Delhi: `[28.515, 77.18, 28.645, 77.25]`
(Saket → Connaught Place, Lajpat Nagar, IIT Delhi, Hauz Khas, Green Park, Khan Market).
Backend: `sora/config.py` `City.route_bbox`; road graph fetched for exactly this box.
