/* In-browser mock of the Sora API (docs/api_contract.md), built on the deterministic Delhi model in data/sora.ts.
   Same request/response shapes and errors as the real backend, so switching VITE_USE_MOCK off needs no UI change. */
import {
  CITIES, DAY, EVENTS, FIRES, PATHS, POLL, STATIONS, WHATIF, coverage, inBbox, plan as modelPlan, sample,
  type LatLng, type PollKey, type RouteId, type TripOption,
} from '../data/sora';
import { HOUR_MS, IST_MS, istDayStart, istHHMM, istMinutes } from '../lib/time';
import {
  ApiError, type ApiEvent, type Change, type CounterfactualResponse, type DayRequest, type DayResponse, type Field,
  type PlanRequest, type PlanResponse, type WireOption,
} from './types';

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const iso = (ms: number) => new Date(ms).toISOString();
const GRID_STEP = 0.02; // ≈2 km; the map interpolates between grid points

/** Forecast start: the current IST hour (the model's diurnal cycle is keyed to IST hours). */
function t0ms() {
  const ist = Date.now() + IST_MS;
  return ist - (ist % HOUR_MS) - IST_MS;
}
/** Index into the model's own clock (hour 0 = 14:00 IST) for forecast hour i. */
const modelT = (i: number, t0: number) => ((Math.floor(istMinutes(iso(t0)) / 60) - 14 + 24) % 24) + i;

function cityOrThrow(key: string) {
  const c = CITIES.find((x) => x.key === key);
  if (!c) throw new ApiError(404, 'unknown_city', `Unknown city "${key}".`);
  if (!c.built) throw new ApiError(404, 'not_built', `${c.name} isn't live yet.`);
  return c;
}

export async function cities() {
  await delay(60);
  return CITIES.map((c) => ({ ...c }));
}

export async function field(cityKey: string, pollutant: PollKey): Promise<Field> {
  await delay();
  const city = cityOrThrow(cityKey);
  const [s, w, n, e] = city.bbox, t0 = t0ms();
  const lats: number[] = [], lons: number[] = [];
  for (let la = s; la <= n + 1e-9; la += GRID_STEP) lats.push(+la.toFixed(4));
  for (let lo = w; lo <= e + 1e-9; lo += GRID_STEP) lons.push(+lo.toFixed(4));
  const times: string[] = [], median: number[][][] = [], p05: number[][][] = [], p95: number[][][] = [];
  const dir: number[] = [], spd: number[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = modelT(i, t0), h = (14 + t) % 24;
    times.push(iso(t0 + i * HOUR_MS));
    const m: number[][] = [], lo5: number[][] = [], hi95: number[][] = [];
    for (const la of lats) {
      const rm: number[] = [], r5: number[] = [], r95: number[] = [];
      for (const lo of lons) { const x = sample(t, la, lo, pollutant); rm.push(+x.median.toFixed(2)); r5.push(+x.p05.toFixed(2)); r95.push(+x.p95.toFixed(2)); }
      m.push(rm); lo5.push(r5); hi95.push(r95);
    }
    median.push(m); p05.push(lo5); p95.push(hi95);
    dir.push(+(128 + 18 * Math.sin(t / 6)).toFixed(1));
    spd.push(+(1.6 + 1.4 * Math.exp(-Math.pow((h - 14 + 24) % 24, 2) / 18)).toFixed(2));
  }
  return {
    city: city.key, pollutant, unit: POLL.find((p) => p.k === pollutant)!.unit,
    times, lats, lons, median, p05, p95,
    coverage: lats.map((la) => lons.map((lo) => +coverage(la, lo).toFixed(3))),
    stations: STATIONS.map(([lat, lon, name], i) => ({ name, lat, lon, reporting: i !== 10 })),
    fires: FIRES,
    wind: { dir_deg: dir, speed_ms: spd },
    meta: {
      analysis_time: times[0], next_update: iso(t0 + HOUR_MS), built_at: iso(t0 + 6 * 60e3),
      degradation: 'L1', n_stations: STATIONS.length, n_reporting: STATIONS.length - 1, background: 'CAMS 00 UTC run',
    },
  };
}

const near = (a: LatLng, b: LatLng) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;

export async function plan(q: PlanRequest): Promise<PlanResponse> {
  await delay(450);
  const city = cityOrThrow(q.city);
  for (const [ll, what] of [[q.origin, 'Start'], [q.dest, 'Destination']] as const)
    if (!inBbox(ll[0], ll[1], city.route_bbox)) {
      const [s, w, n, e] = city.route_bbox;
      throw new ApiError(400, 'outside', `${what} is outside the area Sora can route in ${city.name} (${s}–${n}° N, ${w}–${e}° E).`);
    }
  const depMs = Date.parse(q.planned_departure), depMin = istMinutes(q.planned_departure);
  const res = modelPlan({
    mode: q.mode, planned_departure: istHHMM(q.planned_departure), earliest: istHHMM(q.earliest), latest_departure: istHHMM(q.latest_departure),
    latest_arrival: q.latest_arrival ? istHHMM(q.latest_arrival) : null, max_extra_min: q.max_extra_min,
    origin_building: q.origin_building, dest_building: q.dest_building, city: q.city,
  });
  if (res.error === 'no_feasible')
    throw new ApiError(400, 'no_feasible', `No departure in your window arrives by ${istHHMM(q.latest_arrival!)}. The fastest option takes about ${res.fastest} min.`, { fastest_min: res.fastest });
  if (res.error) throw new ApiError(400, 'invalid', 'The trip could not be planned.');

  /* The model has one fixed Saket → Connaught Place trip; other endpoints get synthetic paths scaled by distance. */
  const o = q.origin, d = q.dest, isDefault = near(o, PATHS.plan[0]) && near(d, PATHS.plan[PATHS.plan.length - 1]);
  const hv = (a: LatLng, b: LatLng) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.88);
  const k = Math.max(0.25, hv(o, d) / hv(PATHS.plan[0], PATHS.plan[PATHS.plan.length - 1]));
  const mkPath = (off: number, wig: number): LatLng[] => {
    const pts: LatLng[] = [], dx = d[0] - o[0], dy = d[1] - o[1], Ln = Math.hypot(dx, dy) || 1;
    for (let i = 0; i <= 10; i++) {
      const s = i / 10, b = Math.sin(Math.PI * s);
      pts.push([o[0] + dx * s + (-dy / Ln) * off * b * Ln + wig * Math.sin(s * 9) * b * 0.003, o[1] + dy * s + ((dx / Ln) * off * b * Ln) / 0.88]);
    }
    return pts;
  };
  const offs: Record<RouteId, [number, number]> = { plan: [0, 1], A: [-0.14, 1.5], B: [0.06, 1], C: [0.18, 0.6] };
  const fixedWindow = Date.parse(q.earliest) === depMs && Date.parse(q.latest_departure) === depMs;
  const wire = (x: TripOption): WireOption => ({
    id: x.id, label: x.label,
    departure: iso(fixedWindow ? depMs : depMs + (x.departure_min - depMin) * 60e3),
    travel_min: Math.max(4, Math.round(x.travel_min * k)), distance_km: +(x.distance_km * k).toFixed(1),
    dose: { median: Math.max(2, Math.round(x.dose.median * k)), p05: Math.max(2, Math.round(x.dose.p05 * k)), p95: Math.max(2, Math.round(x.dose.p95 * k)) },
    reduction_pct: x.reduction_pct, p_better: x.p_better, extra_min: Math.round(x.extra_min * Math.min(1, k + 0.2)),
    path: isDefault ? x.path : mkPath(offs[x.id][0], offs[x.id][1]),
  });
  return {
    baseline: wire(res.baseline), options: res.options.map(wire), recommended: res.recommended as Exclude<RouteId, 'plan'>,
    reliable: res.reliable, explanation: res.explanation, caveats: res.caveats, degradation: res.degradation,
    window: { start: iso(depMs - 90 * 60e3), end: iso(depMs + 60 * 60e3) },
  };
}

export async function day(q: DayRequest): Promise<DayResponse> {
  await delay(600);
  cityOrThrow(q.city);
  const base = istDayStart(new Date().toISOString());
  const seg = (s: (typeof DAY.original)[number]) => ({ me: s.me, start: iso(base + s.a * 60e3), end: iso(base + s.b * 60e3), dose: s.dose, label: s.label });
  const T = DAY.total;
  return {
    stops: DAY.stops.map((s) => ({ name: s.name, place: s.place, icon: s.icon, window: s.window, duration: s.dur, building: s.bld })),
    original: { segments: DAY.original.map(seg), total: T.orig },
    optimized: { segments: DAY.optimized.map(seg), total: T.opt },
    changes: DAY.changes.map((c) => ({ icon: c.icon, title: c.title, detail: c.detail, delta_ug: -Number(c.delta.replace(/[^\d]/g, '')) })),
    reduction_pct: T.red, p_better: T.p, extra_min: T.extra,
  };
}

const CHANGE_INDEX: Record<Change['kind'], number> = { shift_departure: 0, mode: 1, destination: 2, stay_indoors: 3 };
export async function counterfactual(q: { plan: PlanRequest; change: Change }): Promise<CounterfactualResponse> {
  await delay(300);
  cityOrThrow(q.plan.city);
  const w = WHATIF[CHANGE_INDEX[q.change.kind]];
  return { delta_pct: w.d, p_better: w.p, verdict: w.verdict, reason: w.reason };
}

export async function events(cityKey: string): Promise<ApiEvent[]> {
  await delay(120);
  const c = CITIES.find((x) => x.key === cityKey);
  if (!c?.built) return [];
  const day0 = istDayStart(new Date().toISOString()), at = (d: number, h: number) => iso(day0 + (d * 24 + h) * HOUR_MS);
  const win: Record<string, [string, string | null]> = {
    fire: [at(0, 18), at(1, 2)], inversion: [at(0, 21), at(2, 8)], dust: [at(1, 13), at(1, 18)], rain: [at(3, 6), at(3, 12)],
  };
  return EVENTS.filter((e) => win[e.k]).map((e) => ({
    kind: e.k, title: e.title, body: e.body, start: win[e.k][0], end: win[e.k][1], severity: e.sev, probability: e.sev === 'warning' ? 0.7 : 0.6,
  }));
}
