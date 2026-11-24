/* Read values out of a /api/field response: bilinear in space, linear in time. */
import { cat, type Band, type Sample } from '../data/sora';
import type { Field } from '../api/types';
import { istDay, istDayStart, istHHMM } from './time';

/** Lower index and weight of v on an ascending axis (clamped to the ends). */
function locate(a: number[], v: number): [number, number] {
  const n = a.length;
  if (n < 2 || v <= a[0]) return [0, 0];
  if (v >= a[n - 1]) return [n - 2, 1];
  let i = 0;
  while (a[i + 1] < v) i++;
  return [i, (v - a[i]) / (a[i + 1] - a[i])];
}
function bil(g: number[][], [iy, wy]: [number, number], [ix, wx]: [number, number]) {
  const y1 = Math.min(iy + 1, g.length - 1), x1 = Math.min(ix + 1, g[0].length - 1);
  return (g[iy][ix] * (1 - wx) + g[iy][x1] * wx) * (1 - wy) + (g[y1][ix] * (1 - wx) + g[y1][x1] * wx) * wy;
}

export const lastHour = (F: Field) => F.times.length - 1;

export function sampleField(F: Field, t: number, lat: number, lon: number): Sample {
  const T = lastHour(F), tc = Math.max(0, Math.min(T, t)), t0 = Math.floor(tc), t1 = Math.min(T, t0 + 1), wt = tc - t0;
  const y = locate(F.lats, lat), x = locate(F.lons, lon);
  const at = (G: number[][][]) => bil(G[t0], y, x) * (1 - wt) + bil(G[t1], y, x) * wt;
  const median = at(F.median), p05 = at(F.p05), p95 = at(F.p95);
  return { median, p05, p95, cat: cat(median, F.pollutant), coverage: bil(F.coverage, y, x), spread: median > 0 ? (p95 - p05) / median : 0 };
}

/** Coverage below which a cell counts as no-data. A background-only field (no stations assimilated, coverage 0
    everywhere) still has a forecast in every cell, so nothing is masked. */
export const covFloor = (F: Field) => (F.coverage.some((row) => row.some((c) => c >= 0.05)) ? 0.05 : -Infinity);

/** City average over cells with some observation coverage (the populated area). */
export function fieldMean(F: Field, t: number): Band {
  const ti = Math.max(0, Math.min(lastHour(F), Math.round(t))), floor = covFloor(F);
  let m = 0, lo = 0, hi = 0, n = 0;
  F.coverage.forEach((row, y) => row.forEach((c, x) => {
    if (c < floor) return;
    m += F.median[ti][y][x]; lo += F.p05[ti][y][x]; hi += F.p95[ti][y][x]; n++;
  }));
  return n ? { median: m / n, p05: lo / n, p95: hi / n } : { median: 0, p05: 0, p95: 0 };
}

export const fieldSeries = (F: Field) => F.times.map((_, t) => fieldMean(F, t));

/** IST midnight (epoch ms) of the day "Plan my day" covers (07:00–23:00): the forecast's first day, or the next one
    once its 07:00 has passed, so the whole day is inside the forecast. Same rule as sora/decision/schedule.py. */
export function planDay0(F: Field) {
  const d = istDayStart(F.times[0]);
  return Date.parse(F.times[0]) > d + 7 * 3600e3 ? d + 86400e3 : d;
}

/** "Today 18:00" style label relative to the forecast start. */
export function relDay(iso: string, refIso: string) {
  const d = Math.round((istDayStart(iso) - istDayStart(refIso)) / 86400e3);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : istDay(iso).slice(0, 3);
}
export function fieldTime(F: Field, t: number) {
  const iso = F.times[Math.max(0, Math.min(lastHour(F), Math.floor(t)))];
  return { iso, day: istDay(iso), time: istHHMM(iso), short: relDay(iso, F.times[0]) + ' ' + istHHMM(iso) };
}
/** "Today 18:00 – Sun 02:00" for an event window. */
export const eventWhen = (start: string, end: string | null, refIso: string) =>
  relDay(start, refIso) + ' ' + istHHMM(start) + (end ? ' – ' + relDay(end, refIso) + ' ' + istHHMM(end) : ' onwards');
