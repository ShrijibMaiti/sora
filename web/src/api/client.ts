/* Typed client for the Sora API (docs/api_contract.md). Production builds call the real /api; `npm run dev` uses the
   in-browser mock. Override either way with VITE_USE_MOCK=true|false (Vite forwards /api to :8000 in dev and preview). */
import type { DaySeg, Place, PlanOk, PollKey, TripOption } from '../data/sora';
import { istHHMM, istMinutes } from '../lib/time';
import * as mock from './mock';
import {
  ApiError, type ApiEvent, type Change, type City, type CounterfactualResponse, type DayRequest, type DayResponse, type Example, type Field,
  type PlacesResponse, type PlanRequest, type PlanResponse, type Segment, type WireOption, type WirePlace,
} from './types';

const mockEnv = import.meta.env.VITE_USE_MOCK;
export const USE_MOCK = mockEnv ? mockEnv !== 'false' : import.meta.env.DEV;

async function http<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api' + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network', "Can't reach Sora's servers.");
  }
  if (!r.ok) {
    const d = await r.json().then((j) => j?.detail, () => null);
    if (d && typeof d === 'object' && !Array.isArray(d) && typeof d.code === 'string') throw new ApiError(r.status, d.code, String(d.message ?? d.code), d);
    throw r.status === 422 ? new ApiError(422, 'invalid', 'The request was rejected as invalid.') : new ApiError(r.status, 'http_' + r.status, `Server error (${r.status}).`);
  }
  return r.json() as Promise<T>;
}

const q = encodeURIComponent;
const remote = {
  cities: () => http<City[]>('/cities'),
  field: (city: string, pollutant: PollKey) => http<Field>(`/field?city=${q(city)}&pollutant=${q(pollutant)}`),
  plan: (body: PlanRequest) => http<PlanResponse>('/plan', body),
  day: (body: DayRequest) => http<DayResponse>('/day', body),
  counterfactual: (body: { plan: PlanRequest; change: Change }) => http<CounterfactualResponse>('/counterfactual', body),
  events: (city: string) => http<ApiEvent[]>(`/events?city=${q(city)}`),
  places: (city: string) => http<PlacesResponse>(`/places?city=${q(city)}`),
  search: (city: string, text: string) => http<WirePlace[]>(`/search?city=${q(city)}&q=${q(text)}`),
};
const raw: typeof remote = USE_MOCK ? mock : remote;

/* ---------- wire → view (screens show IST wall-clock times) ---------- */
const place = (p: WirePlace): Place => ({ k: p.key, name: p.name, sub: p.sub, ll: [p.lat, p.lon], building: p.building ?? undefined });
const opt = (o: WireOption): TripOption => ({ ...o, departure: istHHMM(o.departure), departure_min: istMinutes(o.departure), departure_iso: o.departure });
const seg = (s: Segment): DaySeg => ({ me: s.me, a: istMinutes(s.start), b: istMinutes(s.end), dose: s.dose, label: s.label });

export type DayView = {
  stops: { name: string; place: string; chosen: string; icon: string; window: string; dur: string; bld: string }[];
  original: DaySeg[]; optimized: DaySeg[];
  changes: { icon: string; title: string; detail: string; delta: string }[];
  total: { orig: DayResponse['original']['total']; opt: DayResponse['optimized']['total']; red: DayResponse['reduction_pct']; p: number; extra: number };
};

export const api = {
  cities: raw.cities,
  field: raw.field,
  events: raw.events,
  counterfactual: raw.counterfactual,
  async places(city: string): Promise<{ places: Place[]; example: Example | null }> {
    const r = await raw.places(city);
    return { places: r.places.map(place), example: r.example };
  },
  search: async (city: string, text: string) => (await raw.search(city, text)).map(place),
  async plan(body: PlanRequest): Promise<PlanOk> {
    const r = await raw.plan(body);
    return { ...r, baseline: opt(r.baseline), options: r.options.map(opt), window: { start: istHHMM(r.window.start), end: istHHMM(r.window.end) } };
  },
  async day(body: DayRequest): Promise<DayView> {
    const r = await raw.day(body);
    return {
      stops: r.stops.map((s) => ({ name: s.name, place: s.place, chosen: s.chosen, icon: s.icon, window: s.window, dur: s.duration, bld: s.building })),
      original: r.original.segments.map(seg), optimized: r.optimized.segments.map(seg),
      changes: r.changes.map((c) => ({ icon: c.icon, title: c.title, detail: c.detail, delta: (c.delta_ug < 0 ? '−' : '+') + Math.abs(c.delta_ug) + ' µg' })),
      total: { orig: r.original.total, opt: r.optimized.total, red: r.reduction_pct, p: r.p_better, extra: r.extra_min },
    };
  },
};

export { ApiError };
