/* In-browser mock of the Sora API (docs/api_contract.md), built on the deterministic Delhi model in data/sora.ts.
   Same request/response shapes and errors as the real backend, so switching VITE_USE_MOCK off needs no UI change. */
import {
  CITIES, EVENTS, FIRES, PATHS, POLL, STATIONS, coverage, hhmm, inBbox, plan as modelPlan, sample,
  type BuildingKey, type LatLng, type MeKey, type ModeKey, type PollKey, type RouteId, type TripOption,
} from '../data/sora';
import { HOUR_MS, IST_MS, istDayStart, istHHMM, istMinutes } from '../lib/time';
import {
  ApiError, type ApiEvent, type Change, type CounterfactualResponse, type DayRequest, type DayResponse, type Field,
  type Place, type PlanRequest, type PlanResponse, type WireOption,
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

/* ---------- whole-day simulation (spec §25): dose = concentration × building/vehicle factor × breathing × minutes ---------- */
const VENT = { rest: 7, light: 12, moderate: 25, high: 45 } as const; // L/min; priors after US EPA Exposure Factors Handbook (spec §22.2)
const BLD_F: Record<BuildingKey, number> = { naturally_ventilated: 0.8, ac_sealed: 0.45, ac_filtered: 0.25 }; // indoor/outdoor priors (spec §21.4)
const BLD_LABEL: Record<BuildingKey, string> = { naturally_ventilated: 'Naturally ventilated', ac_sealed: 'AC, sealed', ac_filtered: 'AC with filter' };
const TRAVEL: Record<ModeKey, { me: MeKey; label: string; kmh: number; f: number; vent: number }> = {
  walk: { me: 'road', label: 'Walk', kmh: 4.8, f: 1, vent: 20 }, cycle: { me: 'road', label: 'Cycle', kmh: 13, f: 1, vent: 28 },
  two_wheeler: { me: 'road', label: 'Two-wheeler', kmh: 22, f: 1.1, vent: 11 }, auto: { me: 'vehicle', label: 'Auto', kmh: 20, f: 1.1, vent: 9 },
  car_ac: { me: 'vehicle', label: 'Car', kmh: 22, f: 0.5, vent: 8 }, bus: { me: 'vehicle', label: 'Bus', kmh: 16, f: 0.9, vent: 9 },
  metro: { me: 'metro', label: 'Metro', kmh: 30, f: 0.4, vent: 9 },
};
const meOf = (name: string): MeKey => (/home/i.test(name) ? 'home' : /gym/i.test(name) ? 'gym' : /restaurant|dinner|lunch|cafe/i.test(name) ? 'restaurant' : 'work');
const ICON: Record<MeKey, string> = { home: 'house', work: 'graduation-cap', gym: 'dumbbell', restaurant: 'utensils', road: 'footprints', vehicle: 'car', metro: 'train-front' };
const km = (a: Place, b: Place) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * Math.PI) / 360) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(((b.lon - a.lon) * Math.PI) / 360) ** 2));
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const Phi = (x: number) => 1 / (1 + Math.exp(-1.702 * x));

type Stop = DayRequest['stops'][number];
type Sim = { segs: { me: MeKey; a: number; b: number; dose: number; label?: string }[]; total: number; travel: number; ok: boolean; ends: number[] };

function simulate(stops: Stop[], mode: ModeKey, day0: number, choice: number[], shift: number[]): Sim {
  const t0 = t0ms(), tr = TRAVEL[mode], segs: Sim['segs'] = [], ends: number[] = [];
  const conc = (p: Place, min: number) => sample(modelT(0, t0) + (day0 + min * 60e3 - t0) / HOUR_MS, p.lat, p.lon).median;
  const at = (iso?: string) => (iso ? (Date.parse(iso) - day0) / 60e3 : null);
  const placeOf = (i: number) => (choice[i] && stops[i].alternatives?.length ? stops[i].alternatives![0] : stops[i].place);
  const bldOf = (i: number) => (choice[i] && stops[i].alternatives?.length ? (stops[i].alternatives![0] as Place & { building?: BuildingKey }).building ?? stops[i].building : stops[i].building);
  const dwellDose = (i: number, a: number, b: number) => {
    let d = 0;
    for (let m = a; m < b; m += 30) { const len = Math.min(30, b - m); d += conc(placeOf(i), m + len / 2) * BLD_F[bldOf(i)] * (VENT[stops[i].activity ?? 'light'] / 1000) * len; }
    return d;
  };
  let t = 7 * 60, total = 0, travel = 0, ok = true;
  stops.forEach((s, i) => {
    const last = i === stops.length - 1, start = t, before = at(s.leave_before);
    let end = last ? 23 * 60 : i === 0 ? (before ?? 8 * 60 + 20) + shift[i] : t + (s.duration_min ?? 60) + shift[i];
    if (!last) {
      const nxt = stops[i + 1], from = placeOf(i), to = placeOf(i + 1), mins = Math.round(4 + ((km(from, to) * 1.3) / tr.kmh) * 60), after = at(nxt.arrive_after);
      if (after != null && end + mins < after) end = after - mins; // wait here rather than arrive early
      if (before != null && end > before && i > 0) ok = false;
      const dw = dwellDose(i, start, end);
      segs.push({ me: meOf(s.name), a: start, b: end, dose: dw, label: choice[i] ? placeOf(i).label : undefined });
      let td = 0;
      for (const f of [0.25, 0.5, 0.75]) td += conc({ label: '', lat: from.lat + (to.lat - from.lat) * f, lon: from.lon + (to.lon - from.lon) * f }, end + mins * f) / 3;
      td *= tr.f * (tr.vent / 1000) * mins;
      segs.push({ me: tr.me, a: end, b: end + mins, dose: td, label: tr.label });
      total += dw + td; travel += mins; ends.push(end); t = end + mins;
    } else {
      const dw = dwellDose(i, start, Math.max(start, end));
      segs.push({ me: meOf(s.name), a: start, b: Math.max(start, end), dose: dw });
      total += dw; ends.push(end);
    }
    if (end - start < 15 && !last && i > 0) ok = false;
  });
  return { segs: segs.map((x) => ({ ...x, dose: Math.round(x.dose) })), total, travel, ok, ends };
}

export async function day(q: DayRequest): Promise<DayResponse> {
  await delay(500);
  cityOrThrow(q.city);
  if (q.stops.length < 2) throw new ApiError(400, 'invalid', 'A day needs at least two stops.');
  const day0 = istDayStart(new Date(t0ms()).toISOString()), n = q.stops.length;
  const base = simulate(q.stops, q.mode, day0, Array(n).fill(0), Array(n).fill(0));
  if (!base.ok) throw new ApiError(400, 'no_feasible', 'The stops do not fit their time windows. Shorten a stay or widen a window.');

  /* coordinate descent over location choices and ±30 min departure shifts, within the extra-travel budget */
  let choice: number[] = Array(n).fill(0), shift: number[] = Array(n).fill(0), best = base;
  const better = (c: number[], s: number[]) => {
    const r = simulate(q.stops, q.mode, day0, c, s);
    if (r.ok && r.travel - base.travel <= q.max_extra_min && r.total < best.total - 0.5) { best = r; choice = c; shift = s; }
  };
  for (let pass = 0; pass < 2; pass++) {
    q.stops.forEach((s, i) => { if (s.alternatives?.length) better(choice.map((v, j) => (j === i ? 1 - v : v)), shift); });
    for (let i = 0; i < n - 1; i++) for (const d of [-30, -15, 15, 30]) if (Math.abs(shift[i] + d) <= 30) better(choice, shift.map((v, j) => (j === i ? v + d : v)));
  }

  /* each change's own contribution: revert it alone */
  const changes: DayResponse['changes'] = [];
  q.stops.forEach((s, i) => {
    if (choice[i]) {
      const r = simulate(q.stops, q.mode, day0, choice.map((v, j) => (j === i ? 0 : v)), shift);
      const alt = s.alternatives![0] as Place & { building?: BuildingKey };
      changes.push({ icon: ICON[meOf(s.name)], title: `Use ${alt.label} instead of ${s.place.label}`, detail: `${BLD_LABEL[alt.building ?? s.building]}${s.activity === 'high' ? '; you breathe hardest during this stop.' : '.'}`, delta_ug: Math.round(best.total - r.total) });
    }
    /* label by the departure that actually moved (waits for a later window can absorb a shift) */
    const moved = Math.round(best.ends[i] - base.ends[i]);
    if (shift[i] && Math.abs(moved) >= 5 && Math.sign(moved) === Math.sign(shift[i]) && i < n - 1) {
      const r = simulate(q.stops, q.mode, day0, choice, shift.map((v, j) => (j === i ? 0 : v)));
      changes.push({ icon: 'clock', title: `Leave ${s.name.toLowerCase() === 'home' ? 'home' : s.name} ${Math.abs(moved)} min ${moved > 0 ? 'later' : 'earlier'}`, detail: `${hhmm(base.ends[i])} → ${hhmm(best.ends[i])} IST.`, delta_ug: Math.round(best.total - r.total) });
    }
  });

  const band = (v: number) => ({ median: Math.round(v), p05: Math.round(v * 0.85), p95: Math.round(v * 1.18) });
  const red = (1 - best.total / base.total) * 100, sd = Math.max(2, Math.abs(red) * 0.35);
  const seg = (s: Sim['segs'][number]) => ({ me: s.me, start: iso(day0 + s.a * 60e3), end: iso(day0 + s.b * 60e3), dose: s.dose, label: s.label || undefined });
  return {
    stops: q.stops.map((s, i) => {
      const a = i === 0 ? 7 * 60 : base.segs[2 * i - 1].b, b = base.ends[i], alt = s.alternatives?.[0];
      return {
        name: s.name, place: s.place.label, chosen: choice[i] && alt ? alt.label : s.place.label, icon: ICON[meOf(s.name)],
        window: i === 0 ? `until ${hhmm(b)}` : i === n - 1 ? `from ${hhmm(a)}` : `${hhmm(a)} – ${hhmm(b)}`,
        duration: i === 0 || i === n - 1 ? '' : dur(b - a), building: BLD_LABEL[s.building] + (alt ? ` · or ${alt.label}` : ''),
      };
    }),
    original: { segments: base.segs.map(seg), total: band(base.total) },
    optimized: { segments: best.segs.map(seg), total: band(best.total) },
    changes: changes.filter((c) => c.delta_ug < 0).sort((a, b) => a.delta_ug - b.delta_ug),
    reduction_pct: { median: Math.round(red), p05: Math.round(red - 1.645 * sd), p95: Math.round(red + 1.645 * sd) },
    p_better: +Math.min(0.99, Phi(red / sd)).toFixed(2), extra_min: Math.max(0, best.travel - base.travel),
  };
}

/* ---------- what if (spec §26): re-run the trip model with one thing changed ---------- */
export async function counterfactual(q: { plan: PlanRequest; change: Change }): Promise<CounterfactualResponse> {
  await delay(300);
  cityOrThrow(q.plan.city);
  const p = q.plan, c = q.change;
  const run = (o: Partial<{ mode: ModeKey; dep: string; dest_building: BuildingKey }>) => {
    const r = modelPlan({ mode: o.mode ?? p.mode, planned_departure: o.dep ?? istHHMM(p.planned_departure), dest_building: o.dest_building ?? p.dest_building });
    return r.error ? NaN : r.baseline.dose.median;
  };
  const base = run({});
  let dose = base, reason = '';
  if (c.kind === 'shift_departure') {
    const dep = hhmm(istMinutes(p.planned_departure) + c.minutes);
    dose = run({ dep });
    reason = `Leaving at ${dep} instead of ${istHHMM(p.planned_departure)} ${dose < base ? 'moves more of the trip out of' : 'puts more of the trip into'} the evening build-up.`;
  } else if (c.kind === 'mode') {
    dose = run({ mode: c.mode });
    reason = `${TRAVEL[c.mode].label} changes how much road air reaches you: in-vehicle levels are about ${Math.round(TRAVEL[c.mode].f * 100)}% of the roadside for this mode, against ${Math.round(TRAVEL[p.mode].f * 100)}% for ${TRAVEL[p.mode].label.toLowerCase()}.`;
  } else if (c.kind === 'destination') {
    const bld = c.dest_building ?? p.dest_building;
    dose = run({ dest_building: bld });
    reason = `The other place is ${BLD_LABEL[bld].toLowerCase()}; indoor air there is about ${Math.round(BLD_F[bld] * 100)}% of outdoor levels, against ${Math.round(BLD_F[p.dest_building] * 100)}% now.`;
  } else {
    dose = base * (1 - (1 - BLD_F[p.origin_building]) * 0.2);
    reason = `Your start building is ${BLD_LABEL[p.origin_building].toLowerCase()}, so indoor levels there follow outdoor ones with a lag. ${p.origin_building === 'naturally_ventilated' ? 'Staying in saves little.' : 'Staying in during the peak helps.'}`;
  }
  const d = ((dose - base) / base) * 100, sd = 4 + Math.abs(d) * 0.35, pb = +Math.min(0.99, Math.max(0.01, Phi(-d / sd))).toFixed(2);
  return {
    delta_pct: { median: Math.round(d), p05: Math.round(d - 1.645 * sd), p95: Math.round(d + 1.645 * sd) }, p_better: pb,
    verdict: pb >= 0.7 ? 'Likely helps' : pb <= 0.3 ? 'Probably not' : 'Not reliably different', reason,
  };
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
