/* Recording a day on this device (spec §27, §40): GPS fixes → stays and moves → estimated dose. Nothing leaves the device.
   Pure functions only (no imports at runtime), so `npm test` runs them under Node.

   shortcut: a speed threshold tells walking from riding, so car, auto, bus and metro all count as "vehicle" with one
   in-between protection factor, and every stay as a naturally ventilated building; let people label stays and rides
   (or use activity recognition in a native app) to do better. */

export type Fix = { t: number; lat: number; lon: number; acc: number }; // t: epoch ms; acc: metres (95%)
export type Piece = { kind: 'stay' | 'walk' | 'vehicle'; start: number; end: number; lat: number; lon: number; km: number; dose: number };

export const STAY_M = 150;          // a stay: within this radius ...
export const STAY_MS = 10 * 60e3;   // ... for at least this long (Li et al. 2008 stay points)
export const GAP_MS = 20 * 60e3;    // no fix for longer than this: unknown, not counted
export const WALK_KMH = 7;          // faster than this is riding something
export const MAX_ACC_M = 100;       // coarser fixes are dropped
// breathing (L/min) and fraction of outdoor air, as the planner uses them (sora/exposure/microenv.py)
const VENT = { stay: 12, walk: 20, vehicle: 12 }, FACTOR = { stay: 0.82, walk: 1, vehicle: 0.8 };

export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return 6371e3 * Math.hypot(x, y);
}

/** Whether to keep a new fix: accurate enough, and 30 s or 25 m since the last kept one (saves storage). */
export const keep = (prev: Fix | undefined, f: Fix) =>
  f.acc <= MAX_ACC_M && (!prev || f.t - prev.t >= 30e3 || metres(prev, f) >= 25);

/** Stays and moves over time-ordered fixes; `conc(tMs, lat, lon)` gives outdoor µg/m³ for the dose. */
export function segment(fixes: Fix[], conc: (t: number, lat: number, lon: number) => number): Piece[] {
  const f = fixes.filter((x) => x.acc <= MAX_ACC_M);
  const stayAt: (number | null)[] = f.map(() => null); // stay id per fix
  let i = 0, id = 0;
  while (i < f.length) {
    let j = i;
    while (j + 1 < f.length && metres(f[i], f[j + 1]) <= STAY_M && f[j + 1].t - f[j].t <= GAP_MS) j++;
    if (f[j].t - f[i].t >= STAY_MS) { for (let k = i; k <= j; k++) stayAt[k] = id; id++; i = j + 1; } else i++;
  }
  const out: Piece[] = [];
  for (let k = 0; k + 1 < f.length; k++) {
    const a = f[k], b = f[k + 1], dt = b.t - a.t;
    if (dt <= 0 || dt > GAP_MS) continue;
    const km = metres(a, b) / 1000, kmh = km / (dt / 3600e3);
    const kind: Piece['kind'] = stayAt[k] !== null && stayAt[k] === stayAt[k + 1] ? 'stay' : kmh > WALK_KMH ? 'vehicle' : 'walk';
    const lat = (a.lat + b.lat) / 2, lon = (a.lon + b.lon) / 2;
    const dose = conc(a.t + dt / 2, lat, lon) * FACTOR[kind] * VENT[kind] / 1000 * (dt / 60e3);
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.end === a.t) {
      const w = (last.end - last.start) / (last.end - last.start + dt); // running centroid, time-weighted
      Object.assign(last, { end: b.t, km: last.km + km, dose: last.dose + dose, lat: last.lat * w + lat * (1 - w), lon: last.lon * w + lon * (1 - w) });
    } else out.push({ kind, start: a.t, end: b.t, lat, lon, km, dose });
  }
  // a short "walk" between two stays at the same place is GPS jitter: fold it into the stay
  return out.filter((p, k) => !(p.kind === 'walk' && p.end - p.start < 3 * 60e3 && out[k - 1]?.kind === 'stay' && out[k + 1]?.kind === 'stay'));
}
