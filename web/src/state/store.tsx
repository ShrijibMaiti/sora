import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import {
  CITIES, PATHS, PLACES, hhmm, inBbox, plan, toMin,
  type BuildingKey, type LatLng, type ModeKey, type PlanResult, type PollKey, type RouteId, type TripOption,
} from '../data/sora';

export type Tab = 'live' | 'trip' | 'day' | 'what' | 'ins';
export type Demo = 'none' | 'loading' | 'offline' | 'degraded' | 'unreliable' | 'nofeasible' | 'notbuilt';
export type Theme = 'dark' | 'light';
export type Trip = {
  origin: string; dest: string; mode: ModeKey; dep: string; win: string; latest: string; maxExtra: number; ob: BuildingKey; db: BuildingKey;
};
export type SubTabs = { live: 'overview' | 'poll' | 'events' | 'data'; trip: 'options' | 'why' | 'chart'; day: 'schedule' | 'result' | 'changes' | 'timeline' };

export type State = {
  w: number; h: number; booting: boolean; theme: Theme;
  tab: Tab; panelOpen: boolean; city: string; t: number; playing: boolean; poll: PollKey; unc: boolean;
  lay: { stations: boolean; wind: boolean; fires: boolean };
  layersOpen: boolean; legendOpen: boolean; pt: LatLng | null; cityOpen: boolean; menuOpen: boolean; searchOpen: boolean; searchQ: string;
  trip: Trip; custom: Record<string, LatLng>; pick: 'origin' | 'dest' | null; res: PlanResult | null; sel: RouteId; planning: boolean; editTrip: boolean;
  dayDone: boolean; dayBusy: boolean; dayView: 'opt' | 'orig'; wi: number[]; demo: Demo; offline: boolean; onb: number;
  sheet: number; drag: number | null;
  prefs: { mode: ModeKey; bld: BuildingKey; extra: number };
  sub: SubTabs;
};

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function initialState(): State {
  const theme = (store.get('sora.theme') as Theme) || 'dark';
  const hash = new URLSearchParams(location.hash.slice(1));
  const tabMap: Record<string, Tab> = { trip: 'trip', day: 'day', whatif: 'what', insights: 'ins', live: 'live' };
  return {
    w: window.innerWidth || 1280, h: window.innerHeight || 800, booting: true, theme,
    tab: tabMap[hash.get('tab') || ''] || 'live', panelOpen: true,
    city: hash.get('city') && CITIES.some((c) => c.key === hash.get('city')) ? hash.get('city')! : 'delhi',
    t: 5, playing: false, poll: 'pm25', unc: false, lay: { stations: true, wind: false, fires: true },
    layersOpen: false, legendOpen: false, pt: null, cityOpen: false, menuOpen: false, searchOpen: false, searchQ: '',
    trip: { origin: 'saket', dest: 'cp', mode: 'car_ac', dep: '18:15', win: '90', latest: '', maxExtra: 15, ob: 'naturally_ventilated', db: 'ac_sealed' },
    custom: {}, pick: null, res: null, sel: 'B', planning: false, editTrip: false,
    dayDone: true, dayBusy: false, dayView: 'opt', wi: [1], demo: 'none', offline: false,
    onb: store.get('sora.onboarded') ? -1 : 0,
    sheet: 1, drag: null,
    prefs: { mode: 'car_ac', bld: 'naturally_ventilated', extra: 15 },
    sub: { live: 'overview', trip: 'options', day: 'result' },
  };
}

export const placeLL = (st: State, k: string): LatLng | undefined =>
  k.startsWith('custom_') ? st.custom[k.slice(7)] : PLACES.find((p) => p.k === k)?.ll;

/** Wraps POST /api/plan with the prototype's client-side adjustments (custom endpoints, demo states). */
export function computePlan(st: State, trip: Trip): PlanResult {
  const o = placeLL(st, trip.origin), d = placeLL(st, trip.dest);
  if (!o || !d) return { error: 'missing' };
  if (!inBbox(o[0], o[1]) || !inBbox(d[0], d[1])) return { error: 'outside' };
  const dm = toMin(trip.dep), win = +trip.win;
  const q = {
    city: st.city, mode: trip.mode, planned_departure: trip.dep, earliest: hhmm(dm - win), latest_departure: hhmm(dm + win),
    latest_arrival: trip.latest || null, max_extra_min: +trip.maxExtra, origin_building: trip.ob, dest_building: trip.db, force_unreliable: st.demo === 'unreliable',
  };
  if (st.demo === 'nofeasible') q.latest_arrival = hhmm(dm - win + 10);
  const res = plan(q);
  if (res.error) return res;
  const hv = (a: LatLng, b: LatLng) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.88);
  const P = PATHS.plan, base = hv(P[0], P[P.length - 1]), k = Math.max(0.25, hv(o, d) / base);
  const isDefault = trip.origin === 'saket' && trip.dest === 'cp';
  const mkPath = (off: number, wig: number): LatLng[] => {
    const pts: LatLng[] = [], n = 10, dx = d[0] - o[0], dy = d[1] - o[1], Ln = Math.hypot(dx, dy) || 1;
    for (let i = 0; i <= n; i++) {
      const s = i / n, b = Math.sin(Math.PI * s);
      pts.push([o[0] + dx * s + (-dy / Ln) * off * b * Ln + wig * Math.sin(s * 9) * b * 0.003, o[1] + dy * s + ((dx / Ln) * off * b * Ln) / 0.88]);
    }
    return pts;
  };
  const offs: Record<RouteId, [number, number]> = { plan: [0, 1], A: [-0.14, 1.5], B: [0.06, 1], C: [0.18, 0.6] };
  [res.baseline, ...res.options].forEach((x: TripOption) => {
    if (!isDefault) x.path = mkPath(offs[x.id][0], offs[x.id][1]);
    x.distance_km = +(x.distance_km * k).toFixed(1);
    x.travel_min = Math.max(4, Math.round(x.travel_min * k));
    x.extra_min = Math.round(x.extra_min * Math.min(1, k + 0.2));
    (['median', 'p05', 'p95'] as const).forEach((q) => (x.dose[q] = Math.max(2, Math.round(x.dose[q] * k))));
    if (st.demo === 'degraded' && x.p_better != null) x.p_better = +(x.p_better * 0.82).toFixed(2);
  });
  if (st.demo === 'degraded') res.reliable = (res.options[1].p_better ?? 0) >= 0.7;
  if (trip.win === '0') res.options.forEach((x) => { x.departure = res.baseline.departure; x.departure_min = res.baseline.departure_min; });
  return res;
}

type Patch = Partial<State> | ((s: State) => Partial<State>);

function useSoraStore() {
  const [st, setSt] = useState<State>(initialState);
  const ref = useRef(st);
  ref.current = st;
  const mapRef = useRef<LeafletMap | null>(null);
  const searchElRef = useRef<HTMLInputElement | null>(null);
  const rm = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const timers = useRef<{ plan?: number }>({});

  const set = useCallback((p: Patch) => {
    setSt((s) => {
      const next = { ...s, ...(typeof p === 'function' ? p(s) : p) };
      ref.current = next;
      return next;
    });
  }, []);

  const jumpTo = useCallback((o?: TripOption) => {
    if (!o) return;
    set({ t: Math.max(0, Math.min(72, Math.round((o.departure_min - 840) / 60))) });
  }, [set]);

  const runPlan = useCallback(() => {
    set({ planning: true });
    clearTimeout(timers.current.plan);
    timers.current.plan = window.setTimeout(() => {
      const s = ref.current, res = computePlan(s, s.trip);
      const sel = (!res.error && res.recommended) || 'B';
      set({ res, planning: false, sel });
      if (!res.error) jumpTo(res.options.find((o) => o.id === sel));
    }, 550);
  }, [set, jumpTo]);

  const selectOpt = useCallback((id: RouteId) => {
    const res = ref.current.res;
    set({ sel: id });
    if (res && !res.error) jumpTo([res.baseline, ...res.options].find((o) => o.id === id));
  }, [set, jumpTo]);

  const setTrip = useCallback((p: Partial<Trip>, run?: boolean) => {
    set((s) => ({ trip: { ...s.trip, ...p } }));
    if (run) runPlan();
  }, [set, runPlan]);

  const applyDemo = useCallback((k: Demo) => {
    const base = { demo: k, menuOpen: false, offline: k === 'offline' };
    if (k === 'loading') { set({ ...base, booting: true, demo: 'none' }); setTimeout(() => set({ booting: false }), 1600); return; }
    if (k === 'notbuilt') { set({ ...base, city: 'kolkata' }); return; }
    if (k === 'unreliable' || k === 'nofeasible') { set({ ...base, tab: 'trip', panelOpen: true, city: 'delhi' }); runPlan(); return; }
    set((s) => ({ ...base, city: k === 'none' ? 'delhi' : s.city }));
    runPlan();
  }, [set, runPlan]);

  const toggleTheme = useCallback(() => {
    const t: Theme = ref.current.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    store.set('sora.theme', t);
    set({ theme: t });
  }, [set]);

  const finishOnboarding = useCallback(() => { store.set('sora.onboarded', '1'); set({ onb: -1 }); }, [set]);

  const flyTo = useCallback((ll: LatLng, z: number) => { mapRef.current?.flyTo(ll, z, { duration: rm ? 0 : 0.6 }); }, [rm]);

  const openSearch = useCallback(() => { set({ searchOpen: true }); requestAnimationFrame(() => searchElRef.current?.focus()); }, [set]);

  /* mount: boot, resize, keyboard, play loop */
  useEffect(() => {
    document.documentElement.dataset.theme = ref.current.theme;
    set((s) => ({ res: computePlan(s, s.trip) }));
    const boot = setTimeout(() => set({ booting: false }), 900);
    const onR = () => set({ w: window.innerWidth, h: window.innerHeight });
    const onK = (e: KeyboardEvent) => {
      if (e.key === 'Escape') set({ cityOpen: false, menuOpen: false, searchOpen: false, layersOpen: false, pt: null, pick: null });
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.key === '/' && !/input|select|textarea/.test(tag)) { e.preventDefault(); openSearch(); }
    };
    window.addEventListener('resize', onR);
    window.addEventListener('keydown', onK);
    const iv = setInterval(() => { if (ref.current.playing && !document.hidden) set((s) => ({ t: (s.t + 1) % 73 })); }, rm ? 1500 : 700);
    return () => { clearTimeout(boot); clearInterval(iv); window.removeEventListener('resize', onR); window.removeEventListener('keydown', onK); };
  }, [set, rm, openSearch]);

  return { st, set, ref, mapRef, searchElRef, rm, runPlan, selectOpt, setTrip, applyDemo, toggleTheme, finishOnboarding, flyTo, openSearch };
}

export type Sora = ReturnType<typeof useSoraStore>;
const Ctx = createContext<Sora | null>(null);

export function SoraProvider({ children }: { children: ReactNode }) {
  const v = useSoraStore();
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useSora() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSora must be used inside <SoraProvider>');
  return v;
}

export const cityOf = (key: string) => CITIES.find((c) => c.key === key) || CITIES[0];
