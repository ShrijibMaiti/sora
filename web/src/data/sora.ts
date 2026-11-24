/* Sora mock data + deterministic Delhi model (port of the prototype's sora-kit.js).
   Shapes follow the §7 API contracts: GET /api/field, POST /api/plan. */
import type { Example } from '../api/types';

export type LatLng = [number, number];
export type Band = { median: number; p05: number; p95: number };

/* ---------- AQI (CPCB National AQI — fixed functional scale) ---------- */
export type AqiCat = { k: number; name: string; color: string; ink: string; v: string };
/** Colours are token references (tokens.css); canvas code resolves `v` with getComputedStyle. */
export const AQI: AqiCat[] = [
  { k: 0, name: 'Good', color: 'var(--aqi-good)', ink: 'var(--aqi-ink)', v: '--aqi-good' },
  { k: 1, name: 'Satisfactory', color: 'var(--aqi-satisfactory)', ink: 'var(--aqi-ink)', v: '--aqi-satisfactory' },
  { k: 2, name: 'Moderately polluted', color: 'var(--aqi-moderate)', ink: 'var(--aqi-ink)', v: '--aqi-moderate' },
  { k: 3, name: 'Poor', color: 'var(--aqi-poor)', ink: 'var(--aqi-ink)', v: '--aqi-poor' },
  { k: 4, name: 'Very poor', color: 'var(--aqi-very-poor)', ink: 'var(--aqi-ink)', v: '--aqi-very-poor' },
  { k: 5, name: 'Severe', color: 'var(--aqi-severe)', ink: 'var(--aqi-ink-severe)', v: '--aqi-severe' },
];

export type PollKey = 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co';
export const BP: Record<PollKey, number[]> = {
  pm25: [30, 60, 90, 120, 250],
  pm10: [50, 100, 250, 350, 430],
  no2: [40, 80, 180, 280, 400],
  o3: [50, 100, 168, 208, 748],
  so2: [40, 80, 380, 800, 1600],
  co: [1, 2, 10, 17, 34],
};
export const POLL: { k: PollKey; label: string; unit: string }[] = [
  { k: 'pm25', label: 'PM2.5', unit: 'µg/m³' },
  { k: 'pm10', label: 'PM10', unit: 'µg/m³' },
  { k: 'no2', label: 'NO₂', unit: 'µg/m³' },
  { k: 'o3', label: 'O₃', unit: 'µg/m³' },
  { k: 'so2', label: 'SO₂', unit: 'µg/m³' },
  { k: 'co', label: 'CO', unit: 'mg/m³' },
];
export const cat = (v: number, p: PollKey = 'pm25') => {
  const b = BP[p];
  for (let i = 0; i < b.length; i++) if (v <= b[i]) return i;
  return 5;
};
export const aqiIndex = (v: number) => {
  const c = [[0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 380, 400, 500]];
  for (const [a, b, i, j] of c) if (v <= b) return Math.round(i + ((v - a) / (b - a)) * (j - i));
  return 500;
};
export const UNC = Array.from({ length: 8 }, (_, i) => `var(--unc-${i + 1})`);

/* ---------- cities, stations ---------- */
export type Bbox = [number, number, number, number]; // south, west, north, east
/** bbox = forecast field extent, route_bbox = area with a road graph. Must match sora/config.py (docs/api_contract.md). */
export type City = { key: string; name: string; built: boolean; status: string; bbox: Bbox; route_bbox: Bbox; center: LatLng; note: string };
export const CITIES: City[] = [
  { key: 'delhi', name: 'Delhi', built: true, status: 'Live', bbox: [28.4, 76.84, 28.88, 77.35], route_bbox: [28.515, 77.18, 28.645, 77.25], center: [28.61, 77.2], note: 'Winter inversions trap traffic exhaust and smoke from upwind crop fires.' },
  { key: 'kolkata', name: 'Kolkata', built: false, status: 'Preview', bbox: [22.4, 88.2, 22.75, 88.5], route_bbox: [22.52, 88.32, 22.6, 88.4], center: [22.57, 88.36], note: 'Winter outflow down the Gangetic plain adds to local traffic and industry.' },
  { key: 'mumbai', name: 'Mumbai', built: false, status: 'Preview', bbox: [18.88, 72.77, 19.3, 73.0], route_bbox: [19.0, 72.81, 19.08, 72.89], center: [19.07, 72.88], note: 'The sea breeze clears the afternoon; calm winter nights let haze settle.' },
  { key: 'chennai', name: 'Chennai', built: false, status: 'Preview', bbox: [12.85, 80.1, 13.25, 80.33], route_bbox: [13.02, 80.21, 13.1, 80.29], center: [13.06, 80.24], note: 'North-east monsoon rain washes the air; Bhogi bonfires spike it in January.' },
];
export const STATIONS: [number, number, string][] = [
  [28.647, 77.316, 'Anand Vihar'], [28.629, 77.241, 'ITO'], [28.674, 77.131, 'Punjabi Bagh'], [28.563, 77.187, 'RK Puram'], [28.636, 77.201, 'Mandir Marg'],
  [28.571, 77.072, 'Dwarka Sec 8'], [28.733, 77.12, 'Rohini'], [28.733, 77.171, 'Jahangirpuri'], [28.531, 77.271, 'Okhla Ph 2'], [28.568, 77.251, 'Nehru Nagar'],
  [28.776, 77.051, 'Bawana'], [28.471, 77.11, 'Aya Nagar'], [28.57, 76.934, 'Najafgarh'], [28.7, 77.165, 'Wazirpur'], [28.55, 77.216, 'Sirifort'],
];
export const FIRES: LatLng[] = [[28.86, 76.88], [28.84, 76.93], [28.87, 77.0], [28.8, 76.86]];

/* ---------- field model (deterministic, hourly, 0–72 h from 14:00 IST Sat 21 Nov 2026) ---------- */
const g = (d2: number, s: number) => Math.exp(-d2 / (2 * s * s));
const dd = (a: number, b: number, c: number, d: number) => { const y = a - c, x = (b - d) * 0.88; return x * x + y * y; };
const wrapH = (h: number, c: number, w: number) => { let d = Math.abs(h - c); d = Math.min(d, 24 - d); return Math.exp(-(d * d) / (2 * w * w)); };
export const T0_HOUR = 14;
export const HOURS = 73;
export const hourOf = (t: number) => (T0_HOUR + t) % 24;
const DAYS = ['Sat 21 Nov', 'Sun 22 Nov', 'Mon 23 Nov', 'Tue 24 Nov'];
const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (m: number) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
export const timeLabel = (t: number) => {
  const ti = Math.floor(t), h = T0_HOUR + ti, d = Math.floor(h / 24);
  return { day: DAYS[d] || '', time: pad(h % 24) + ':00', short: (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : DAYS[d].slice(0, 3)) + ' ' + pad(h % 24) + ':00' };
};
function spatial(lat: number, lon: number) {
  let s = 1 + 0.55 * g(dd(lat, lon, 28.647, 77.316), 0.05) + 0.42 * g(dd(lat, lon, 28.7, 77.15), 0.06) + 0.32 * g(dd(lat, lon, 28.63, 77.23), 0.07)
    + 0.28 * g(dd(lat, lon, 28.776, 77.051), 0.06) + 0.18 * g(dd(lat, lon, 28.52, 77.28), 0.05) - 0.24 * g(dd(lat, lon, 28.585, 77.165), 0.035) - 0.18 * g(dd(lat, lon, 28.47, 77.13), 0.06);
  const r = Math.sqrt(dd(lat, lon, 28.63, 77.15));
  s *= 1 - 0.28 * Math.min(1, Math.max(0, (r - 0.14) / 0.18));
  return s;
}
const noise = (lat: number, lon: number, t: number) => Math.sin(lat * 61 + t * 0.31) * Math.cos(lon * 53 - t * 0.23) * 0.6 + Math.sin((lat + lon) * 97 + t * 0.11) * 0.4;
const DAYF = [1, 1, 0.9, 1.07, 1];
const diurnal = (h: number) => 0.6 + 0.66 * wrapH(h, 20.5, 2.6) + 0.3 * wrapH(h, 8.5, 1.6);
export const coverage = (lat: number, lon: number) => {
  let s = 0;
  for (const st of STATIONS) s += g(dd(lat, lon, st[0], st[1]), 0.035);
  return Math.min(1, 1 - Math.exp(-s * 1.3));
};
function pmAt(t: number, lat: number, lon: number) {
  const H = T0_HOUR + t, h = H % 24, day = Math.floor(H / 24);
  return 84 * diurnal(h) * spatial(lat, lon) * (DAYF[day] || 1) * (1 + 0.07 * noise(lat, lon, t));
}
export type Sample = Band & { cat: number; coverage: number; spread: number };
export const sample = (t: number, lat: number, lon: number, p: PollKey = 'pm25'): Sample => {
  const t0 = Math.floor(t), f = t - t0;
  const v0 = pmAt(t0, lat, lon), v1 = pmAt(Math.min(HOURS - 1, t0 + 1), lat, lon);
  let m = v0 + (v1 - v0) * f;
  const h = hourOf(t), sp = spatial(lat, lon), traffic = 0.5 + 0.6 * wrapH(h, 9, 1.8) + 0.7 * wrapH(h, 19, 2);
  if (p === 'pm10') m = m * 1.78;
  else if (p === 'no2') m = (28 + 46 * traffic) * sp;
  else if (p === 'o3') m = 14 + (78 * wrapH(h, 14.5, 2.6)) / (sp * 0.8);
  else if (p === 'so2') m = 10 + 8 * sp;
  else if (p === 'co') m = (0.7 + 1.4 * traffic) * sp;
  const cov = coverage(lat, lon), spread = 0.11 + 0.0032 * t + 0.2 * (1 - cov);
  return { median: m, p05: m * (1 - spread * 0.85), p95: m * (1 + spread * 1.15), cat: cat(m, p), coverage: cov, spread };
};
export const inBbox = (lat: number, lon: number, b: Bbox = CITIES[0].bbox) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
export const cityMean = (t: number, p: PollKey = 'pm25'): Band => {
  let a = 0, lo = 0, hi = 0, n = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const s = sample(t, 28.5 + i * 0.05, 77.05 + j * 0.06, p);
    a += s.median; lo += s.p05; hi += s.p95; n++;
  }
  return { median: a / n, p05: lo / n, p95: hi / n };
};

/* ---------- hex grid in lat/lon ---------- */
export const hexGrid = (b: number[], r: number): LatLng[] => {
  const out: LatLng[] = [], k = 0.88, dy = r * 1.5, dx = (r * Math.sqrt(3)) / k;
  let row = 0;
  for (let la = b[0]; la <= b[2]; la += dy, row++) for (let lo = b[1] + (row % 2 ? dx / 2 : 0); lo <= b[3]; lo += dx) out.push([la, lo]);
  return out;
};
export const hexPoly = (la: number, lo: number, r: number, sc = 0.86): LatLng[] => {
  const k = 0.88, out: LatLng[] = [];
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); out.push([la + r * sc * Math.sin(a), lo + (r * sc * Math.cos(a)) / k]); }
  return out;
};

/* ---------- trips ---------- */
export type Place = { k: string; name: string; sub: string; ll: LatLng; building?: BuildingKey };
/* Delhi demo places: the mock's /api/places and the fail-safe the app starts with until the API answers.
   The real list is backend config.PLACES (Anand Vihar and Noida stay here to demo the "outside" error in mock mode). */
export const PLACES: Place[] = [
  { k: 'saket', name: 'Saket', sub: 'Select Citywalk, Press Enclave Marg', ll: [28.5245, 77.2066] },
  { k: 'cp', name: 'Connaught Place', sub: 'Inner Circle, New Delhi', ll: [28.6315, 77.2167] },
  { k: 'lajpat', name: 'Lajpat Nagar', sub: 'Central Market, Lajpat Nagar II', ll: [28.5677, 77.2433] },
  { k: 'iitd', name: 'IIT Delhi', sub: 'Hauz Khas, New Delhi', ll: [28.545, 77.1926] },
  { k: 'hkv', name: 'Hauz Khas Village', sub: 'Gym A · Naturally ventilated', ll: [28.5535, 77.194], building: 'naturally_ventilated' },
  { k: 'greenpark', name: 'Green Park', sub: 'Gym B · AC with filter', ll: [28.559, 77.206], building: 'ac_filtered' },
  { k: 'khan', name: 'Khan Market', sub: 'Rabindra Nagar, New Delhi', ll: [28.6003, 77.227] },
  { k: 'av', name: 'Anand Vihar', sub: 'ISBT, East Delhi', ll: [28.6469, 77.3159] },
  { k: 'noida', name: 'Noida Sector 62', sub: 'Outside the covered area', ll: [28.627, 77.372] },
];
/* Delhi's example trip and day (backend config.EXAMPLES): the mock's answer and the app's first-paint fail-safe. */
export const DEMO_EXAMPLE: Example = {
  trip: { origin: 'saket', dest: 'cp', mode: 'car_ac', dep: '18:15', origin_building: 'naturally_ventilated', dest_building: 'ac_sealed' },
  day: [
    { name: 'Home', place: 'lajpat', before: '08:20', building: 'naturally_ventilated', activity: 'rest' },
    { name: 'College', place: 'iitd', after: '08:45', duration_min: 455, building: 'naturally_ventilated', activity: 'light' },
    { name: 'Gym', place: 'hkv', alt: 'greenpark', alt_building: 'ac_filtered', duration_min: 75, building: 'naturally_ventilated', activity: 'high' },
    { name: 'Restaurant', place: 'khan', after: '18:45', duration_min: 105, building: 'ac_sealed', activity: 'light' },
    { name: 'Home', place: 'lajpat', building: 'naturally_ventilated', activity: 'rest' },
  ],
};
export type ModeKey = 'walk' | 'cycle' | 'two_wheeler' | 'auto' | 'car_ac' | 'bus' | 'metro';
export const MODES: { k: ModeKey; label: string; icon: string; short: string }[] = [
  { k: 'walk', label: 'Walk', icon: 'footprints', short: 'Walk' },
  { k: 'cycle', label: 'Cycle', icon: 'bike', short: 'Cycle' },
  { k: 'two_wheeler', label: 'Two-wheeler', icon: 'two-wheeler', short: '2-wheel' },
  { k: 'auto', label: 'Auto', icon: 'auto', short: 'Auto' },
  { k: 'car_ac', label: 'Car (AC)', icon: 'car', short: 'Car' },
  { k: 'bus', label: 'Bus', icon: 'bus', short: 'Bus' },
  { k: 'metro', label: 'Metro', icon: 'train-front', short: 'Metro' },
];
export type BuildingKey = 'naturally_ventilated' | 'ac_sealed' | 'ac_filtered';
export const BUILDINGS: { k: BuildingKey; label: string }[] = [
  { k: 'naturally_ventilated', label: 'Naturally ventilated' },
  { k: 'ac_sealed', label: 'AC, sealed' },
  { k: 'ac_filtered', label: 'AC with filter' },
];
export type RouteId = 'plan' | 'A' | 'B' | 'C';
export const PATHS: Record<RouteId, LatLng[]> = {
  plan: [[28.5245, 77.2066], [28.537, 77.205], [28.55, 77.206], [28.561, 77.208], [28.568, 77.209], [28.575, 77.211], [28.588, 77.213], [28.6, 77.216], [28.612, 77.219], [28.623, 77.219], [28.6315, 77.2167]],
  A: [[28.5245, 77.2066], [28.533, 77.195], [28.546, 77.185], [28.56, 77.18], [28.575, 77.183], [28.59, 77.19], [28.605, 77.199], [28.618, 77.207], [28.6315, 77.2167]],
  B: [[28.5245, 77.2066], [28.54, 77.21], [28.555, 77.216], [28.57, 77.22], [28.586, 77.223], [28.593, 77.227], [28.605, 77.226], [28.618, 77.223], [28.6315, 77.2167]],
  C: [[28.5245, 77.2066], [28.53, 77.225], [28.545, 77.24], [28.562, 77.244], [28.58, 77.247], [28.6, 77.245], [28.62, 77.238], [28.6315, 77.2167]],
};
const MODEF: Record<ModeKey, { v: number; spd: number; k: number }> = {
  walk: { v: 1.0, spd: 4.8, k: 1.15 }, cycle: { v: 1.9, spd: 14, k: 1.2 }, two_wheeler: { v: 1.1, spd: 24, k: 1.1 }, auto: { v: 1.15, spd: 20, k: 1.05 },
  car_ac: { v: 0.75, spd: 22, k: 0.85 }, bus: { v: 0.9, spd: 16, k: 0.9 }, metro: { v: 0.6, spd: 30, k: 0.18 },
};
export const toMin = (s: string) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const Phi = (x: number) => 1 / (1 + Math.exp(-1.702 * x));

export type PlanQuery = {
  mode: ModeKey; planned_departure: string; dest_building: BuildingKey;
  city?: string; earliest?: string; latest_departure?: string; latest_arrival?: string | null;
  max_extra_min?: number; origin_building?: BuildingKey; force_unreliable?: boolean;
};
/** View model of an option: departure as IST "HH:MM" plus minutes-of-day; departure_iso is set when it came from the API. */
export type TripOption = {
  id: RouteId; label: string; departure: string; departure_min: number; departure_iso?: string; travel_min: number; distance_km: number;
  dose: Band; reduction_pct: Band; p_better: number | null; extra_min: number; path: LatLng[];
};
export type PlanOk = {
  error?: undefined; baseline: TripOption; options: TripOption[]; recommended: RouteId; reliable: boolean; explanation: string[]; caveats: string[];
  degradation: string; window: { start: string; end: string };
};
/** error = API error code (docs/api_contract.md) or 'missing' when the form lacks a start/destination. */
export const PLAN_ERRORS = ['missing', 'invalid', 'outside', 'no_route', 'no_feasible', 'beyond_horizon', 'not_built'] as const;
export type PlanErr = { error: (typeof PLAN_ERRORS)[number]; message?: string; fastest?: number };
export type PlanResult = PlanOk | PlanErr;

/* POST /api/plan */
export const plan = (q: PlanQuery): PlanResult => {
  const mf = MODEF[q.mode] || MODEF.car_ac, dep = toMin(q.planned_departure || '18:15');
  const dist: Record<RouteId, number> = { plan: 11.8, A: 12.9, B: 12.4, C: 13.6 };
  const cong = (m: number) => 1 + 0.35 * wrapH(m / 60, 19, 1.5);
  const baseTravel = Math.round((dist.plan / mf.spd) * 60 * cong(dep));
  const fastest = Math.round(baseTravel * 0.9);
  if (q.latest_arrival && toMin(q.latest_arrival) < toMin(q.earliest || '00:00') + fastest) return { error: 'no_feasible', fastest };
  let pm = 0;
  for (const p of PATHS.plan) pm += sample(Math.max(0, (dep - 14 * 60) / 60), p[0], p[1]).median;
  pm /= PATHS.plan.length;
  const bld: Record<BuildingKey, number> = { naturally_ventilated: 1, ac_sealed: 0.85, ac_filtered: 0.7 };
  const baseDose = pm * mf.v * (baseTravel / 60) * (bld[q.dest_building] || 1) * 1.05 + 18;
  const cov = 0.55;
  const mk = (id: RouteId, label: string, r: number, lo: number, hi: number, extra: number, depOff: number): TripOption => {
    const k = mf.k, R = r * k, sd = Math.max(0.04, ((hi - lo) / 3.29) * Math.max(0.6, k));
    const d = baseDose * (1 - R), sp = 0.16 + 0.1 * (1 - cov);
    return {
      id, label, departure: hhmm(dep + depOff), departure_min: dep + depOff, travel_min: baseTravel + extra, distance_km: dist[id],
      dose: { median: Math.round(d), p05: Math.round(d * (1 - sp)), p95: Math.round(d * (1 + sp * 1.2)) },
      reduction_pct: { median: Math.round(R * 100), p05: Math.round((R - (r - lo) * k) * 100), p95: Math.round((R + (hi - r) * k) * 100) },
      p_better: +Math.min(0.99, Phi((R / sd) * 1.0)).toFixed(2), extra_min: extra, path: PATHS[id],
    };
  };
  const maxX = q.max_extra_min == null ? 15 : q.max_extra_min;
  const A = mk('A', 'Lowest exposure', 0.35, 0.22, 0.46, Math.min(9, Math.max(maxX, 2)), -85);
  const B = mk('B', 'Balanced', 0.28, 0.15, 0.37, Math.min(7, Math.max(maxX, 1)), -55);
  const C = mk('C', 'Fastest', 0.06, -0.07, 0.18, -4, 0);
  const base: TripOption = {
    id: 'plan', label: 'Your plan', departure: hhmm(dep), departure_min: dep, travel_min: baseTravel, distance_km: dist.plan,
    dose: { median: Math.round(baseDose), p05: Math.round(baseDose * 0.82), p95: Math.round(baseDose * 1.22) },
    reduction_pct: { median: 0, p05: 0, p95: 0 }, p_better: null, extra_min: 0, path: PATHS.plan,
  };
  const reliable = q.force_unreliable ? false : (B.p_better ?? 0) >= 0.7;
  return {
    baseline: base, options: [A, B, C], recommended: 'B', reliable,
    explanation: reliable
      ? [
        'Leaving at ' + B.departure + ' avoids the evening build-up, which starts near Ring Road around 18:00.',
        'The Lodhi Road route keeps about 1.4 km further from heavy traffic than your usual route.',
        q.mode === 'car_ac' ? 'Keeping the AC on recirculate lowers in-vehicle levels by about 40%.' : 'Your mode adds little in-vehicle protection, so timing matters more than route.',
      ]
      : ['All options pass through the same evening build-up; differences are smaller than the forecast uncertainty.', 'Underground metro sections already keep your dose low, whichever option you choose.'],
    caveats: ['Monitoring is sparse south of Saket, so uncertainty is higher on the first 3 km.', 'The forecast assumes winds stay light; more smoke from upwind fires could raise levels by 10–20%.'],
    degradation: 'L1', window: { start: hhmm(dep - 90), end: hhmm(dep + 60) },
  };
};

/* ---------- whole day (Plan my day) ---------- */
export type MeKey = 'home' | 'road' | 'vehicle' | 'metro' | 'work' | 'gym' | 'restaurant';
export type DaySeg = { me: MeKey; a: number; b: number; dose: number; label?: string };
const seg = (me: MeKey, a: string, b: string, dose: number, label?: string): DaySeg => ({ me, a: toMin(a), b: toMin(b), dose, label });
export const ME: { k: MeKey; label: string; icon: string }[] = [
  { k: 'home', label: 'Home', icon: 'house' }, { k: 'road', label: 'Road / walk', icon: 'footprints' }, { k: 'vehicle', label: 'Vehicle', icon: 'car' },
  { k: 'metro', label: 'Metro', icon: 'train-front' }, { k: 'work', label: 'College / work', icon: 'graduation-cap' }, { k: 'gym', label: 'Gym', icon: 'dumbbell' },
  { k: 'restaurant', label: 'Restaurant', icon: 'utensils' },
];
export const DAY = {
  stops: [
    { name: 'Home', place: 'Lajpat Nagar', icon: 'house', window: 'until 08:20', dur: '', bld: 'Naturally ventilated' },
    { name: 'College', place: 'IIT Delhi', icon: 'graduation-cap', window: '08:55 – 16:30', dur: '7 h 35 min', bld: 'Naturally ventilated' },
    { name: 'Gym', place: 'Any gym near Hauz Khas', icon: 'dumbbell', window: '17:00 – 18:30', dur: '75 min', bld: '2 alternatives' },
    { name: 'Restaurant', place: 'Khan Market', icon: 'utensils', window: '18:45 – 20:30', dur: '1 h 45 min', bld: 'AC, sealed' },
    { name: 'Home', place: 'Lajpat Nagar', icon: 'house', window: 'from 21:00', dur: '', bld: 'Naturally ventilated' },
  ],
  original: [seg('home', '07:00', '08:20', 48), seg('vehicle', '08:20', '08:55', 92, 'Auto'), seg('work', '08:55', '16:30', 412), seg('road', '16:30', '16:40', 22, 'Walk'), seg('vehicle', '16:40', '17:00', 58, 'Auto'), seg('gym', '17:00', '18:15', 186, 'Gym A'), seg('vehicle', '18:15', '18:40', 84, 'Auto'), seg('restaurant', '18:40', '20:30', 152), seg('vehicle', '20:30', '20:55', 96, 'Auto'), seg('home', '20:55', '23:00', 104)],
  optimized: [seg('home', '07:00', '08:20', 48), seg('vehicle', '08:20', '08:55', 92, 'Auto'), seg('work', '08:55', '16:55', 434), seg('road', '16:55', '17:05', 16, 'Walk'), seg('vehicle', '17:05', '17:25', 44, 'Auto'), seg('gym', '17:25', '18:30', 92, 'Gym B'), seg('road', '18:30', '18:36', 14, 'Walk'), seg('metro', '18:36', '18:57', 26, 'Metro'), seg('road', '18:57', '19:03', 10, 'Walk'), seg('restaurant', '19:03', '20:36', 128), seg('metro', '20:36', '21:03', 34, 'Metro'), seg('home', '21:03', '23:00', 96)],
  changes: [
    { icon: 'clock', title: 'Leave college 25 min later', detail: '16:55 instead of 16:30 — the road peak near Aurobindo Marg eases.', delta: '−18 µg' },
    { icon: 'dumbbell', title: 'Use Gym B in Green Park', detail: 'AC with filter; you breathe hardest during the 65-min session.', delta: '−94 µg' },
    { icon: 'train-front', title: 'Take the metro to Khan Market', detail: 'Yellow Line from Green Park instead of an auto through Lodhi Road.', delta: '−108 µg' },
  ],
  total: { orig: { median: 1254, p05: 1062, p95: 1478 }, opt: { median: 1034, p05: 878, p95: 1219 }, red: { median: 18, p05: 9, p95: 26 }, p: 0.9, extra: 11 },
};

/* ---------- what if ---------- */
export const WHATIF = [
  { q: 'Leave 30 min later', icon: 'clock', d: { median: 9, p05: -2, p95: 18 }, p: 0.18, verdict: 'Probably not', reason: 'Leaving at 18:45 puts you into the 19:00–22:00 build-up; most of the trip would run through the peak.' },
  { q: 'Take the metro', icon: 'train-front', d: { median: -31, p05: -41, p95: -19 }, p: 0.95, verdict: 'Likely helps', reason: 'Sealed coaches and underground sections keep in-vehicle PM2.5 about 40% below road level. The walk to Saket station adds a little back.' },
  { q: 'Use the other gym', icon: 'dumbbell', d: { median: -9, p05: -16, p95: -3 }, p: 0.81, verdict: 'Likely helps', reason: 'Gym B has filtered AC. You breathe about four times harder while exercising, so indoor air there matters most.' },
  { q: 'Stay indoors during the peak', icon: 'house', d: { median: -4, p05: -11, p95: 3 }, p: 0.62, verdict: 'Not reliably different', reason: 'Your home is naturally ventilated, so indoor levels follow outdoor ones about an hour later. The difference is smaller than the uncertainty.' },
];

/* ---------- insights (mock history) ---------- */
export const WEEK = [{ d: 'Sun', m: 980 }, { d: 'Mon', m: 1120 }, { d: 'Tue', m: 1210 }, { d: 'Wed', m: 1060 }, { d: 'Thu', m: 1340 }, { d: 'Fri', m: 1290 }, { d: 'Sat', m: 1254 }]
  .map((x) => ({ ...x, lo: Math.round(x.m * 0.85), hi: Math.round(x.m * 1.18) }));
export const TRIPS = [
  { from: 'Home', to: 'College', mode: 'auto', dose: 92, share: 0.26 },
  { from: 'College', to: 'Gym', mode: 'auto', dose: 80, share: 0.22 },
  { from: 'Gym', to: 'Restaurant', mode: 'auto', dose: 84, share: 0.24 },
  { from: 'Restaurant', to: 'Home', mode: 'auto', dose: 96, share: 0.28 },
];
export type Sev = 'warning' | 'info' | 'success';
export const EVENTS: { k: string; icon: string; title: string; body: string; when: string; sev: Sev }[] = [
  { k: 'fire', icon: 'flame', title: 'Smoke from upwind fires', body: 'Crop-residue fires in Haryana; NW winds carry smoke in after 18:00.', when: 'Today 18:00 – Sun 02:00', sev: 'warning' },
  { k: 'inversion', icon: 'cloud-fog', title: 'Night-time inversion', body: 'A shallow mixing layer keeps evening pollution near the ground.', when: 'Nightly through Mon', sev: 'info' },
  { k: 'dust', icon: 'wind', title: 'Dust from construction and roads', body: 'Dry, calm conditions raise PM10 more than PM2.5.', when: 'Sun afternoon', sev: 'info' },
  { k: 'festival', icon: 'sparkles', title: 'Festival fireworks', body: 'Short, sharp spikes after 20:00 near residential areas.', when: 'Example event', sev: 'warning' },
  { k: 'rain', icon: 'cloud-rain', title: 'Rain washout', body: 'Light rain expected to lower PM2.5 for about 6 hours.', when: 'Tue morning', sev: 'success' },
];

/* ---------- view-model helpers ---------- */
export const sgn = (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '±') + Math.abs(n);
/** Route styling. `token` is the CSS custom property holding the colour. */
export const ROUTE: Record<RouteId, { token: string; dash: string; w: number }> = {
  plan: { token: '--route-plan', dash: '7 6', w: 3 },
  A: { token: '--route-a', dash: '', w: 4 },
  B: { token: '--route-b', dash: '', w: 5 },
  C: { token: '--route-c', dash: '1 7', w: 4 },
};
/** Blue (--route-b) marks the recommended option; the others take teal/purple in order. Your plan stays neutral.
 *  rec = null (nothing reliably better) → every option is the same neutral grey, told apart by dash only. */
export function routeToken(id: RouteId, rec: RouteId | null = 'B') {
  if (id === 'plan') return '--route-plan';
  if (rec == null) return '--route-neutral';
  if (id === rec) return '--route-b';
  const others = (['A', 'B', 'C'] as RouteId[]).filter((x) => x !== rec);
  return others.indexOf(id) === 0 ? '--route-a' : '--route-c';
}
export const routeColor = (id: RouteId, rec: RouteId | null = 'B') => `var(${routeToken(id, rec)})`;

/** A departure that has already left (1 min grace). Options without an absolute time are never "passed". */
export const departed = (o: TripOption, now = Date.now()) => !!o.departure_iso && Date.parse(o.departure_iso) < now - 60e3;

/** The option Sora can honestly recommend right now: none when the plan isn't reliable; if the server's pick has
 *  already left, the best remaining option that still clears 70%; otherwise none. */
export function recOf(res: PlanOk, now = Date.now()): RouteId | null {
  if (!res.reliable) return null;
  const r = res.options.find((o) => o.id === res.recommended);
  if (r && !departed(r, now)) return r.id;
  const alt = res.options.filter((o) => !departed(o, now) && (o.p_better ?? 0) >= 0.7).sort((a, b) => b.reduction_pct.median - a.reduction_pct.median)[0];
  return alt?.id ?? null;
}

export const pareto = (res: PlanOk, W: number, H: number, pad = 28) => {
  const all = [res.baseline, ...res.options];
  const xs = all.map((o) => o.travel_min), ys = all.flatMap((o) => [o.dose.p05, o.dose.p95]);
  const x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4, y0 = 0, y1 = Math.max(...ys) * 1.1;
  const X = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - pad - 10), Y = (v: number) => H - pad - ((v - y0) / (y1 - y0)) * (H - pad - 10);
  const pts = all.map((o) => ({ id: o.id, letter: o.id === 'plan' ? 'You' : o.id, x: X(o.travel_min), y: Y(o.dose.median), y05: Y(o.dose.p05), y95: Y(o.dose.p95), c: routeColor(o.id, recOf(res)), hollow: o.id === 'plan' }));
  const frontier = res.options.slice().sort((a, b) => a.travel_min - b.travel_min).map((o) => X(o.travel_min).toFixed(1) + ',' + Y(o.dose.median).toFixed(1)).join(' ');
  return { pts, frontier, xLabel: 'Travel time (min)' };
};

export const DEGRADE = [
  { l: 'L0', src: 'Stations + CAMS + satellite + street layer', conf: 'High', c: 'var(--success)' },
  { l: 'L1', src: 'Stations + CAMS', conf: 'High', c: 'var(--success)' },
  { l: 'L2', src: 'Stations + CAMS · some stations late', conf: 'Moderate', c: 'var(--warning)' },
  { l: 'L3', src: 'Few stations + CAMS', conf: 'Moderate', c: 'var(--warning)' },
  { l: 'L4', src: 'Stations only · no CAMS', conf: 'Moderate', c: 'var(--warning)' },
  { l: 'L5', src: 'CAMS only', conf: 'Low', c: 'var(--danger)' },
  { l: 'L6', src: 'Last analysis + climatology', conf: 'Low', c: 'var(--danger)' },
  { l: 'L7', src: 'No current data', conf: 'Unavailable', c: 'var(--text-tertiary)' },
];

export type HourBar = { h: number; parts: { me: MeKey; v: number; c: string }[]; tot: number };
export const dayBars = (segs: DaySeg[], from: number, to: number): HourBar[] => {
  const hrs: (HourBar & Record<MeKey, number>)[] = [];
  for (let h = from; h < to; h++) {
    const o = { h, parts: [], tot: 0 } as unknown as HourBar & Record<MeKey, number>;
    ME.forEach((m) => (o[m.k] = 0));
    hrs.push(o);
  }
  segs.forEach((s) => {
    const len = s.b - s.a;
    for (let m = s.a; m < s.b; m++) { const i = Math.floor(m / 60) - from; if (hrs[i]) hrs[i][s.me] += s.dose / len; }
  });
  hrs.forEach((o) => ME.forEach((m) => { if (o[m.k] > 0) { o.parts.push({ me: m.k, v: o[m.k], c: 'var(--me-' + m.k + ')' }); o.tot += o[m.k]; } }));
  return hrs;
};

/** 20-segment confidence meter colours. */
export const segs = (p: number, rel: boolean) =>
  Array.from({ length: 20 }, (_, i) => (i < Math.round(p * 20) ? (rel ? 'var(--brand)' : 'var(--text-tertiary)') : 'var(--border-strong)'));
