import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import {
  CITIES, PLACES, PLAN_ERRORS, POLL, WHATIF, toMin,
  type BuildingKey, type City, type LatLng, type ModeKey, type PlanOk, type PlanResult, type PollKey, type RouteId, type TripOption,
} from '../data/sora';
import { ApiError, api, type DayView } from '../api/client';
import type { ApiEvent, Change, CounterfactualResponse, DayRequest, Field, PlanRequest } from '../api/types';
import { fieldSeries } from '../lib/field';
import { HOUR_MS, hourIndex, istDayStart, istHHMM, istTimeOnOrAfter } from '../lib/time';

export type Tab = 'live' | 'trip' | 'day' | 'what' | 'ins';
export type Demo = 'none' | 'loading' | 'offline' | 'degraded' | 'unreliable' | 'nofeasible' | 'notbuilt';
export type Theme = 'dark' | 'light';
export type Trip = {
  origin: string; dest: string; mode: ModeKey; dep: string; win: string; latest: string; maxExtra: number; ob: BuildingKey; db: BuildingKey;
};
export type SubTabs = { live: 'overview' | 'poll' | 'events' | 'data'; trip: 'options' | 'why' | 'chart'; day: 'schedule' | 'result' | 'changes' | 'timeline' };
export type WhatIfAnswer = CounterfactualResponse | 'error' | null;
/** One row of the Plan my day editor. Times are IST "HH:MM" ('' = no constraint); dur in minutes (0 = until the next leg). */
export type DayStop = {
  name: string; place: string; alt: string; altBld: BuildingKey;
  after: string; before: string; dur: number; bld: BuildingKey; activity: 'rest' | 'light' | 'moderate' | 'high';
};
export const NEW_STOP: DayStop = { name: 'New stop', place: 'cp', alt: '', altBld: 'naturally_ventilated', after: '', before: '', dur: 60, bld: 'naturally_ventilated', activity: 'light' };

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
  /* API data */
  cities: City[]; reload: number;
  fields: Partial<Record<PollKey, Field | 'unavailable'>>;
  events: ApiEvent[]; day: DayView | null; whatif: WhatIfAnswer[];
  dayStops: DayStop[]; toast: string | null;
};

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* City list from GET /api/cities; module-level so cityOf() stays synchronous. Static list until it loads. */
let CITY_LIST: City[] = CITIES;
export const cityOf = (key: string) => CITY_LIST.find((c) => c.key === key) || CITY_LIST[0];

/** Field for the selected pollutant, falling back to PM2.5 while it loads. */
export function activeField(st: State): Field | null {
  const f = st.fields[st.poll], pm = st.fields.pm25;
  return f && f !== 'unavailable' ? f : pm && pm !== 'unavailable' ? pm : null;
}

function initialState(): State {
  const theme = (store.get('sora.theme') as Theme) || 'dark';
  const hash = new URLSearchParams(location.hash.slice(1));
  const tabMap: Record<string, Tab> = { trip: 'trip', day: 'day', whatif: 'what', insights: 'ins', live: 'live' };
  return {
    w: window.innerWidth || 1280, h: window.innerHeight || 800, booting: true, theme,
    tab: tabMap[hash.get('tab') || ''] || 'live', panelOpen: true,
    city: hash.get('city') && CITIES.some((c) => c.key === hash.get('city')) ? hash.get('city')! : 'delhi',
    t: 0, playing: false, poll: 'pm25', unc: false, lay: { stations: true, wind: false, fires: true },
    layersOpen: false, legendOpen: false, pt: null, cityOpen: false, menuOpen: false, searchOpen: false, searchQ: '',
    trip: { origin: 'saket', dest: 'cp', mode: 'car_ac', dep: '18:15', win: '90', latest: '', maxExtra: 15, ob: 'naturally_ventilated', db: 'ac_sealed' },
    custom: {}, pick: null, res: null, sel: 'B', planning: false, editTrip: false,
    dayDone: true, dayBusy: false, dayView: 'opt', wi: [1], demo: 'none', offline: false,
    onb: store.get('sora.onboarded') ? -1 : 0,
    sheet: 1, drag: null,
    prefs: { mode: 'car_ac', bld: 'naturally_ventilated', extra: 15 },
    sub: { live: 'overview', trip: 'options', day: 'result' },
    cities: CITIES, reload: 0, fields: {}, events: [], day: null, whatif: WHATIF.map(() => null),
    dayStops: [
      { name: 'Home', place: 'lajpat', alt: '', altBld: 'naturally_ventilated', after: '', before: '08:20', dur: 0, bld: 'naturally_ventilated', activity: 'rest' },
      { name: 'College', place: 'iitd', alt: '', altBld: 'naturally_ventilated', after: '08:45', before: '', dur: 455, bld: 'naturally_ventilated', activity: 'light' },
      { name: 'Gym', place: 'hkv', alt: 'greenpark', altBld: 'ac_filtered', after: '', before: '', dur: 75, bld: 'naturally_ventilated', activity: 'high' },
      { name: 'Restaurant', place: 'khan', alt: '', altBld: 'naturally_ventilated', after: '18:45', before: '', dur: 105, bld: 'ac_sealed', activity: 'light' },
      { name: 'Home', place: 'lajpat', alt: '', altBld: 'naturally_ventilated', after: '', before: '', dur: 0, bld: 'naturally_ventilated', activity: 'rest' },
    ],
    toast: null,
  };
}

/* ---------- on-device storage for reminders and "notify me" (spec §40: nothing here leaves the device) ---------- */
type Reminder = { at: string; title: string; body: string };
const readList = <T,>(k: string): T[] => { try { return JSON.parse(store.get(k) || '[]') as T[]; } catch { return []; } };
const DEVICE_KEYS = ['sora.reminders', 'sora.notify'];
// shortcut: reminders fire only while a Sora tab is open (setTimeout + Notification); needs a service worker + push for background delivery
function schedule(r: Reminder) {
  const ms = Date.parse(r.at) - Date.now();
  if (ms <= 0 || ms > 86400e3) return;
  setTimeout(() => {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(r.title, { body: r.body });
  }, ms);
}

export const placeLL = (st: State, k: string): LatLng | undefined =>
  k.startsWith('custom_') ? st.custom[k.slice(7)] : PLACES.find((p) => p.k === k)?.ll;

/** POST /api/plan body from the trip form. Form times are IST "HH:MM", placed at or after the forecast start. */
export function planRequest(st: State, F: Field): PlanRequest | { error: 'missing'; message: string } {
  const o = placeLL(st, st.trip.origin), d = placeLL(st, st.trip.dest), t = st.trip;
  if (!o || !d) return { error: 'missing', message: 'Choose a start and destination.' };
  /* plan from now, not from the forecast's first hour: a planned time that has already passed today means tomorrow,
     and the search window never starts in the past */
  const t0 = F.times[0], nowIso = new Date(Math.max(Date.now(), Date.parse(t0))).toISOString();
  const dep = istTimeOnOrAfter(t.dep, nowIso), depMs = Date.parse(dep), win = +t.win * 60e3;
  const earliest = new Date(Math.max(depMs - win, Date.parse(nowIso))).toISOString();
  let latestArrival = t.latest ? istTimeOnOrAfter(t.latest, earliest) : null;
  if (st.demo === 'nofeasible') latestArrival = new Date(Date.parse(earliest) + 10 * 60e3).toISOString();
  return {
    city: st.city, origin: o, dest: d, mode: t.mode, planned_departure: dep, earliest, latest_departure: new Date(depMs + win).toISOString(),
    latest_arrival: latestArrival, max_extra_min: +t.maxExtra, origin_building: t.ob, dest_building: t.db,
  };
}

/** Preview-state adjustments (profile menu → Preview states); a no-op in normal use. */
function applyDemoToPlan(st: State, res: PlanOk): PlanOk {
  if (st.demo === 'degraded') {
    [res.baseline, ...res.options].forEach((x) => { if (x.p_better != null) x.p_better = +(x.p_better * 0.82).toFixed(2); });
    res.reliable = (res.options.find((o) => o.id === res.recommended)?.p_better ?? 0) >= 0.7;
  }
  if (st.demo === 'unreliable') res.reliable = false;
  return res;
}

/* What-if questions → POST /api/counterfactual changes (labels/icons are UI copy). */
export const QUESTIONS = WHATIF.map((w) => ({ q: w.q, icon: w.icon }));
function questionChanges(F: Field): Change[] {
  const gymB = PLACES.find((p) => p.k === 'greenpark')!.ll;
  const ser = fieldSeries(F).slice(0, 24), peak = ser.reduce((b, s, i) => (s.median > ser[b].median ? i : b), 0);
  const peakMs = Date.parse(F.times[peak]);
  return [
    { kind: 'shift_departure', minutes: 30 },
    { kind: 'mode', mode: 'metro' },
    { kind: 'destination', dest: gymB, dest_building: 'ac_filtered' },
    { kind: 'stay_indoors', start: new Date(peakMs - HOUR_MS).toISOString(), end: new Date(peakMs + 2 * HOUR_MS).toISOString() },
  ];
}

/** POST /api/day body from the Plan my day editor, on the forecast's first IST day. */
function dayRequest(st: State, F: Field): DayRequest {
  const P = (k: string) => { const p = PLACES.find((x) => x.k === k)!; return { label: p.name, lat: p.ll[0], lon: p.ll[1] }; };
  const day0 = istDayStart(F.times[0]), at = (t: string) => (t ? new Date(day0 + toMin(t) * 60e3).toISOString() : undefined);
  return {
    city: st.city, mode: st.prefs.mode, max_extra_min: st.prefs.extra,
    stops: st.dayStops.map((s) => ({
      name: s.name.trim() || 'Stop', place: P(s.place),
      alternatives: s.alt ? [{ ...P(s.alt), building: s.altBld }] : undefined,
      arrive_after: at(s.after), leave_before: at(s.before), duration_min: s.dur || undefined,
      building: s.bld, activity: s.activity,
    })),
  };
}

type Patch = Partial<State> | ((s: State) => Partial<State>);
const isOffline = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || e.status >= 500;

function useSoraStore() {
  const [st, setSt] = useState<State>(initialState);
  const ref = useRef(st);
  ref.current = st;
  const mapRef = useRef<LeafletMap | null>(null);
  const searchElRef = useRef<HTMLInputElement | null>(null);
  const rm = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const timers = useRef<{ plan?: number }>({});
  const seq = useRef({ plan: 0, whatif: 0 });

  const set = useCallback((p: Patch) => {
    setSt((s) => {
      const next = { ...s, ...(typeof p === 'function' ? p(s) : p) };
      ref.current = next;
      return next;
    });
  }, []);

  const jumpTo = useCallback((o?: TripOption) => {
    const F = activeField(ref.current);
    if (!o?.departure_iso || !F) return;
    set({ t: Math.max(0, Math.min(F.times.length - 1, Math.round(hourIndex(o.departure_iso, F.times[0])))) });
  }, [set]);

  /** jump=false keeps the time slider where it is (used for the plan fetched at load). */
  const runPlan = useCallback((jump: unknown = true) => {
    set({ planning: true });
    clearTimeout(timers.current.plan);
    timers.current.plan = window.setTimeout(async () => {
      const id = ++seq.current.plan, s = ref.current, F = s.fields.pm25;
      if (!F || F === 'unavailable') { set({ planning: false }); return; }
      const req = planRequest(s, F);
      let res: PlanResult;
      if ('error' in req) res = req;
      else {
        try { res = applyDemoToPlan(ref.current, await api.plan(req)); }
        catch (e) {
          if (id !== seq.current.plan) return;
          if (isOffline(e)) { set({ planning: false, offline: true }); return; }
          const a = e as ApiError, known = PLAN_ERRORS.find((c) => c === a.code);
          res = { error: known ?? 'invalid', message: a.message, fastest: a.extra.fastest_min as number | undefined };
        }
      }
      if (id !== seq.current.plan) return;
      const sel = (!res.error && res.recommended) || 'B';
      set({ res, planning: false, sel });
      if (!res.error && jump !== false) jumpTo([res.baseline, ...res.options].find((o) => o.id === sel));
    }, 200);
  }, [set, jumpTo]);

  const askWhatIf = useCallback(async () => {
    const id = ++seq.current.whatif, s = ref.current, F = s.fields.pm25;
    if (!F || F === 'unavailable') return;
    const req = planRequest(s, F);
    if ('error' in req) return;
    set({ whatif: QUESTIONS.map(() => null) });
    const answers = await Promise.all(questionChanges(F).map((change) => api.counterfactual({ plan: req, change }).catch(() => 'error' as const)));
    if (id === seq.current.whatif) set({ whatif: answers });
  }, [set]);

  const toastTimer = useRef(0);
  const notify = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    set({ toast: msg });
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 5000);
  }, [set]);

  /** `field` is passed at load time: set() updates ref.current lazily, so the new field may not be in it yet. */
  const loadDay = useCallback(async (field?: Field) => {
    const F = field ?? ref.current.fields.pm25;
    if (!F || F === 'unavailable') return;
    set({ dayBusy: true });
    try { set({ day: await api.day(dayRequest(ref.current, F)), dayBusy: false, dayDone: true }); }
    catch (e) {
      set({ dayBusy: false, ...(isOffline(e) ? { offline: true } : {}) });
      if (!isOffline(e)) notify((e as ApiError).message);
    }
  }, [set, notify]);

  /** Save an on-device reminder and ask for notification permission. */
  const remind = useCallback(async (r: Reminder) => {
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* blocked */ } }
    store.set('sora.reminders', JSON.stringify([...readList<Reminder>('sora.reminders'), r]));
    schedule(r);
    const denied = !('Notification' in window) || Notification.permission === 'denied';
    notify(`Reminder set for ${istHHMM(r.at)}.` + (denied ? ' Notifications are blocked in this browser, so check back then.' : ' It arrives while Sora is open in a tab.'));
  }, [notify]);

  const notifyWhenLive = useCallback((key: string) => {
    store.set('sora.notify', JSON.stringify([...new Set([...readList<string>('sora.notify'), key])]));
    notify(`Saved. You'll see a notice here when ${cityOf(key).name} goes live.`);
  }, [notify]);

  const clearHistory = useCallback(() => {
    DEVICE_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } });
    set({ menuOpen: false });
    notify('History on this device deleted: reminders and saved notices.');
  }, [set, notify]);

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
    if (k === 'loading') { set((s) => ({ ...base, demo: 'none', reload: s.reload + 1 })); return; }
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

  /* mount: cities, resize, keyboard, play loop */
  useEffect(() => {
    document.documentElement.dataset.theme = ref.current.theme;
    api.cities().then((list) => {
      CITY_LIST = list;
      set({ cities: list });
      const waiting = readList<string>('sora.notify'), live = list.filter((c) => c.built && waiting.includes(c.key));
      if (live.length) {
        store.set('sora.notify', JSON.stringify(waiting.filter((k) => !live.some((c) => c.key === k))));
        notify(`${live.map((c) => c.name).join(' and ')} ${live.length > 1 ? 'are' : 'is'} now live in Sora.`);
      }
    }, () => { /* keep the static list; field load reports offline */ });
    readList<Reminder>('sora.reminders').forEach(schedule);
    const onR = () => set({ w: window.innerWidth, h: window.innerHeight });
    const onK = (e: KeyboardEvent) => {
      if (e.key === 'Escape') set({ cityOpen: false, menuOpen: false, searchOpen: false, layersOpen: false, pt: null, pick: null });
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.key === '/' && !/input|select|textarea/.test(tag)) { e.preventDefault(); openSearch(); }
    };
    window.addEventListener('resize', onR);
    window.addEventListener('keydown', onK);
    const iv = setInterval(() => {
      const s = ref.current, F = activeField(s);
      if (s.playing && F && !document.hidden) set({ t: (s.t + 1) % F.times.length });
    }, rm ? 1500 : 700);
    return () => { clearInterval(iv); window.removeEventListener('resize', onR); window.removeEventListener('keydown', onK); };
  }, [set, rm, openSearch, notify]);

  /* city (or retry): PM2.5 field first, then plan, events, day and the other pollutants */
  useEffect(() => {
    let live = true;
    const city = st.city;
    set({ booting: true, fields: {}, events: [], res: null, day: null, pt: null, t: 0 });
    (async () => {
      try {
        const pm = await api.field(city, 'pm25');
        if (!live) return;
        set({ fields: { pm25: pm }, booting: false, offline: false });
        runPlan(false);
        loadDay(pm);
        api.events(city).then((ev) => live && set({ events: ev }), () => {});
        POLL.filter((p) => p.k !== 'pm25').forEach((p) => api.field(city, p.k).then(
          (f) => live && set((s) => ({ fields: { ...s.fields, [p.k]: f } })),
          () => live && set((s) => ({ fields: { ...s.fields, [p.k]: 'unavailable' }, poll: s.poll === p.k ? 'pm25' : s.poll })),
        ));
      } catch (e) {
        if (!live) return;
        set({ booting: false, offline: isOffline(e) });
      }
    })();
    return () => { live = false; };
  }, [st.city, st.reload, set, runPlan, loadDay]);

  return {
    st, set, ref, mapRef, searchElRef, rm, runPlan, askWhatIf, loadDay, selectOpt, setTrip, applyDemo, toggleTheme, finishOnboarding, flyTo, openSearch,
    notify, remind, notifyWhenLive, clearHistory,
  };
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
