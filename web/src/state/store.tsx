import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import {
  CITIES, DEMO_EXAMPLE, PLACES, PLAN_ERRORS, POLL, toMin,
  type Band, type BuildingKey, type City, type LatLng, type MeKey, type ModeKey, type Place, type PlanOk, type PlanResult, type PollKey, type RouteId, type TripOption,
} from '../data/sora';
import { ApiError, api, onSaved, type DayView } from '../api/client';
import { clearDevice, disablePush, enablePush, pushOn, saveTripContext, scheduleWake } from '../lib/device';
import type { ApiEvent, Change, CounterfactualResponse, DayRequest, Example, Field, PlanRequest } from '../api/types';
import { fieldSeries, planDay0 } from '../lib/field';
import { HOUR_MS, IST_MS, hourIndex, istHHMM, istTimeOnOrAfter } from '../lib/time';

export type Tab = 'live' | 'trip' | 'day' | 'what' | 'ins';
export type Demo = 'none' | 'loading' | 'offline' | 'degraded' | 'unreliable' | 'nofeasible' | 'notbuilt';
export type Theme = 'dark' | 'light';
export type Trip = {
  origin: string; dest: string; mode: ModeKey; dep: string; win: string; latest: string; maxExtra: number; ob: BuildingKey; db: BuildingKey;
};
export type SubTabs = { live: 'overview' | 'poll' | 'events' | 'data'; trip: 'options' | 'why' | 'chart'; day: 'schedule' | 'result' | 'changes' | 'timeline' };
export type WhatIfAnswer = CounterfactualResponse | 'error' | null;
export type WhatIf = { q: string; icon: string; a: WhatIfAnswer };
/** One planned day kept on this device for Insights (spec §27, §40: never sent anywhere). */
export type DayRecord = {
  date: string; city: string; orig: Band; opt: Band; reduction: Band; p: number;
  byMe: Partial<Record<MeKey, number>>; legs: { from: string; to: string; mode: string; dose: number }[];
};
/** One row of the Plan my day editor. Times are IST "HH:MM" ('' = no constraint); dur in minutes (0 = until the next leg). */
export type DayStop = {
  name: string; place: string; alt: string; altBld: BuildingKey;
  after: string; before: string; dur: number; bld: BuildingKey; activity: 'rest' | 'light' | 'moderate' | 'high';
  mode?: ModeKey | ''; // how to travel on to the next stop; '' or absent = the day's mode
};
export const NEW_STOP: DayStop = { name: 'New stop', place: '', alt: '', altBld: 'naturally_ventilated', after: '', before: '', dur: 60, bld: 'naturally_ventilated', activity: 'light' };

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
  places: Place[]; example: Example | null; // the city's places (GET /api/places) plus places picked from search
  fields: Partial<Record<PollKey, Field | 'unavailable'>>;
  events: ApiEvent[]; day: DayView | null; whatif: WhatIf[];
  dayStops: DayStop[]; toast: string | null;
  savedAt: string | null;  // offline: the forecast on screen is the copy the service worker saved at this time
  notif: { alerts: boolean; proactive: boolean; push: boolean };
};
/** Spec §28.2 thresholds: notify only for ≥15% expected reduction with ≥80% chance it helps (same as public/sw.js). */
export const PROACTIVE = { rMin: 15, cMin: 0.8 };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* City list from GET /api/cities; module-level so cityOf() stays synchronous. Static list until it loads. */
let CITY_LIST: City[] = CITIES;
export const cityOf = (key: string) => CITY_LIST.find((c) => c.key === key) || CITY_LIST[0];

/* Places by key: each city's list from GET /api/places plus places picked from search. Seeded with the Delhi demo
   list so a first paint has names; replaced as soon as the API answers. */
let PLACE_LIST: Place[] = PLACES;
export const placeOf = (k: string) => PLACE_LIST.find((p) => p.k === k);
function registerPlaces(ps: Place[]) {
  PLACE_LIST = [...PLACE_LIST.filter((p) => !ps.some((x) => x.k === p.k)), ...ps];
}

/** Trip form and day stops from a city's example (the same shapes the editors use). */
function fromExample(ex: Example, trip: Trip): { trip: Trip; dayStops: DayStop[] } {
  const t = ex.trip;
  return {
    trip: { ...trip, origin: t.origin, dest: t.dest, mode: t.mode, dep: t.dep, ob: t.origin_building, db: t.dest_building },
    dayStops: ex.day.map((s) => ({
      name: s.name, place: s.place, alt: s.alt ?? '', altBld: s.alt_building ?? 'naturally_ventilated', after: s.after ?? '',
      before: s.before ?? '', dur: s.duration_min ?? 0, bld: s.building, activity: s.activity,
    })),
  };
}

/** Field for the selected pollutant, falling back to PM2.5 while it loads. */
export function activeField(st: State): Field | null {
  const f = st.fields[st.poll], pm = st.fields.pm25;
  return f && f !== 'unavailable' ? f : pm && pm !== 'unavailable' ? pm : null;
}

function initialState(): State {
  const theme = (store.get('sora.theme') as Theme) || 'dark';
  const hash = new URLSearchParams(location.hash.slice(1));
  const tabMap: Record<string, Tab> = { trip: 'trip', day: 'day', whatif: 'what', insights: 'ins', live: 'live' };
  const seed: Trip = { origin: '', dest: '', mode: 'car_ac', dep: '18:15', win: '90', latest: '', maxExtra: 15, ob: 'naturally_ventilated', db: 'ac_sealed' };
  return {
    w: window.innerWidth || 1280, h: window.innerHeight || 800, booting: true, theme,
    tab: tabMap[hash.get('tab') || ''] || 'live', panelOpen: true,
    city: hash.get('city') && CITIES.some((c) => c.key === hash.get('city')) ? hash.get('city')! : 'delhi',
    t: 0, playing: false, poll: 'pm25', unc: false, lay: { stations: true, wind: false, fires: true },
    layersOpen: false, legendOpen: false, pt: null, cityOpen: false, menuOpen: false, searchOpen: false, searchQ: '',
    /* fail-safe first paint: the Delhi example until GET /api/places answers with the city's own */
    ...fromExample(DEMO_EXAMPLE, seed),
    custom: {}, pick: null, res: null, sel: 'B', planning: false, editTrip: false,
    dayDone: true, dayBusy: false, dayView: 'opt', wi: [1], demo: 'none', offline: false,
    onb: store.get('sora.onboarded') ? -1 : 0,
    sheet: 1, drag: null,
    prefs: { mode: 'car_ac', bld: 'naturally_ventilated', extra: 15 },
    sub: { live: 'overview', trip: 'options', day: 'result' },
    cities: CITIES, reload: 0, places: PLACES, example: null, fields: {}, events: [], day: null, whatif: [],
    toast: null, savedAt: null,
    notif: { alerts: false, proactive: false, ...readJSON<{ alerts: boolean; proactive: boolean }>('sora.notif'), push: pushOn() },
  };
}

/* ---------- on-device storage for reminders and "notify me" (spec §40: nothing here leaves the device) ---------- */
type Reminder = { id: string; at: string; title: string; body: string };
const readList = <T,>(k: string): T[] => { try { return JSON.parse(store.get(k) || '[]') as T[]; } catch { return []; } };
function readJSON<T>(k: string): Partial<T> { try { return JSON.parse(store.get(k) || '{}') as Partial<T>; } catch { return {}; } }
const DEVICE_KEYS = ['sora.reminders', 'sora.notify', 'sora.days', 'sora.notif', 'sora.proactive', 'sora.track', 'sora.recording'];
export const readDays = () => readList<DayRecord>('sora.days');
const KEEP_DAYS = 30;

/** Keep the planned day on this device for Insights; one record per city and date, newest wins. */
function saveDay(city: string, date: string, d: DayView, stops: DayStop[], mode: ModeKey) {
  const byMe: DayRecord['byMe'] = {};
  d.original.forEach((s) => (byMe[s.me] = (byMe[s.me] || 0) + s.dose));
  const name = (k: string) => placeOf(k)?.name ?? 'Stop';
  const legs = d.original.filter((_, i) => i % 2 === 1).map((s, i) => ({
    from: stops[i]?.name || name(stops[i]?.place), to: stops[i + 1]?.name || name(stops[i + 1]?.place), mode, dose: s.dose,
  }));
  const rec: DayRecord = { date, city, orig: d.total.orig, opt: d.total.opt, reduction: d.total.red, p: d.total.p, byMe, legs };
  const rest = readDays().filter((r) => !(r.city === city && r.date === date));
  store.set('sora.days', JSON.stringify([...rest, rec].sort((a, b) => a.date.localeCompare(b.date)).slice(-KEEP_DAYS)));
}
// shortcut: reminders fire only while a Sora tab is open (setTimeout + Notification); needs a service worker + push for background delivery
function schedule(r: Reminder) {
  const ms = Date.parse(r.at) - Date.now();
  if (ms <= 0 || ms > 86400e3) return;
  setTimeout(() => {
    /* same tag as the service worker's push copy, so a reminder never shows twice */
    if ('Notification' in window && Notification.permission === 'granted') new Notification(r.title, { body: r.body, tag: 'reminder-' + r.id });
  }, ms);
}

export const placeLL = (st: State, k: string): LatLng | undefined =>
  k.startsWith('custom_') ? st.custom[k.slice(7)] : placeOf(k)?.ll;

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
    pollutant: planPollutant(st),
  };
}

/** Plan for the pollutant on the map when its forecast is loaded, else PM2.5 (spec §22.5). */
export const planPollutant = (st: State): PollKey => {
  const f = st.fields[st.poll];
  return f && f !== 'unavailable' ? st.poll : 'pm25';
};

/** Preview-state adjustments (profile menu → Preview states); a no-op in normal use. */
function applyDemoToPlan(st: State, res: PlanOk): PlanOk {
  if (st.demo === 'degraded') {
    [res.baseline, ...res.options].forEach((x) => { if (x.p_better != null) x.p_better = +(x.p_better * 0.82).toFixed(2); });
    res.reliable = (res.options.find((o) => o.id === res.recommended)?.p_better ?? 0) >= 0.7;
  }
  if (st.demo === 'unreliable') res.reliable = false;
  return res;
}

/** What-if questions for the current trip → POST /api/counterfactual changes. */
function whatIfQuestions(st: State, F: Field): { q: string; icon: string; change: Change }[] {
  const t = st.trip, dest = placeLL(st, t.dest);
  const ser = fieldSeries(F).slice(0, 24), peak = ser.reduce((b, s, i) => (s.median > ser[b].median ? i : b), 0);
  const peakMs = Date.parse(F.times[peak]);
  const qs: { q: string; icon: string; change: Change }[] = [
    { q: 'Leave 30 min later', icon: 'clock', change: { kind: 'shift_departure', minutes: 30 } },
    t.mode === 'metro'
      ? { q: 'Go by car instead', icon: 'car', change: { kind: 'mode', mode: 'car_ac' } }
      : { q: 'Take the metro', icon: 'train-front', change: { kind: 'mode', mode: 'metro' } },
  ];
  /* a day stop at this trip's destination that lists an alternative place, else the same place with filtered AC */
  const stop = st.dayStops.find((s) => s.place === t.dest && s.alt), alt = stop && placeOf(stop.alt);
  if (alt && stop) qs.push({ q: `Go to ${alt.name} instead`, icon: 'map-pin', change: { kind: 'destination', dest: alt.ll, dest_building: stop.altBld } });
  else if (dest && t.db !== 'ac_filtered') qs.push({ q: 'If the destination had filtered AC', icon: 'air-vent', change: { kind: 'destination', dest, dest_building: 'ac_filtered' } });
  qs.push({ q: 'Stay indoors during the peak', icon: 'house', change: { kind: 'stay_indoors', start: new Date(peakMs - HOUR_MS).toISOString(), end: new Date(peakMs + 2 * HOUR_MS).toISOString() } });
  return qs;
}

/** POST /api/day body from the Plan my day editor, for the day planDay0 picks. */
function dayRequest(st: State, F: Field): DayRequest {
  const P = (k: string) => {
    const p = placeOf(k);
    if (!p) throw new ApiError(400, 'invalid', 'Choose a place for every stop.');
    return { label: p.name, lat: p.ll[0], lon: p.ll[1] };
  };
  const day0 = planDay0(F), at = (t: string) => (t ? new Date(day0 + toMin(t) * 60e3).toISOString() : undefined);
  return {
    city: st.city, mode: st.prefs.mode, max_extra_min: st.prefs.extra, pollutant: planPollutant(st),
    stops: st.dayStops.map((s) => ({
      name: s.name.trim() || 'Stop', place: P(s.place),
      alternatives: s.alt ? [{ ...P(s.alt), building: s.altBld }] : undefined,
      arrive_after: at(s.after), leave_before: at(s.before), duration_min: s.dur || undefined,
      building: s.bld, activity: s.activity, mode: s.mode || undefined,
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
  const exampleFor = useRef<string | null>(null);

  /** A place picked from search becomes selectable as a trip start, destination or day stop. */
  const addPlace = useCallback((p: Place) => {
    registerPlaces([p]);
    setSt((s) => {
      const next = s.places.some((x) => x.k === p.k) ? s : { ...s, places: [...s.places, p] };
      ref.current = next;
      return next;
    });
  }, []);

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
          /* showing a saved forecast offline: say planning needs a connection instead of blocking the map */
          if (isOffline(e) && ref.current.savedAt) res = { error: 'offline', message: "You're offline. Planning needs a connection; the map shows the last saved forecast." };
          else if (isOffline(e)) { set({ planning: false, offline: true }); return; }
          else {
            const a = e as ApiError, known = PLAN_ERRORS.find((c) => c === a.code);
            res = { error: known ?? 'invalid', message: a.message, fastest: a.extra.fastest_min as number | undefined };
          }
        }
      }
      if (id !== seq.current.plan) return;
      const sel = (!res.error && res.recommended) || 'B';
      set({ res, planning: false, sel });
      if (!res.error && jump !== false) jumpTo([res.baseline, ...res.options].find((o) => o.id === sel));
      if (!res.error) proactive(ref.current, res);
    }, 200);
  }, [set, jumpTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const askWhatIf = useCallback(async () => {
    const id = ++seq.current.whatif, s = ref.current, F = s.fields.pm25;
    if (!F || F === 'unavailable') return;
    const req = planRequest(s, F);
    if ('error' in req) return;
    const qs = whatIfQuestions(s, F);
    set({ whatif: qs.map((q) => ({ q: q.q, icon: q.icon, a: null })) });
    const answers = await Promise.all(qs.map((q) => api.counterfactual({ plan: req, change: q.change }).catch(() => 'error' as const)));
    if (id === seq.current.whatif) set({ whatif: qs.map((q, i) => ({ q: q.q, icon: q.icon, a: answers[i] })) });
  }, [set]);

  const toastTimer = useRef(0);
  const notify = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    set({ toast: msg });
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 5000);
  }, [set]);

  /** `field` and `stops` are passed at load time: set() updates ref.current lazily, so they may not be in it yet. */
  const loadDay = useCallback(async (field?: Field, stops?: DayStop[]) => {
    const F = field ?? ref.current.fields.pm25;
    if (!F || F === 'unavailable') return;
    const s = stops ? { ...ref.current, dayStops: stops } : ref.current;
    set({ dayBusy: true });
    try {
      const day = await api.day(dayRequest(s, F));
      set({ day, dayBusy: false, dayDone: true });
      if (planPollutant(s) === 'pm25') saveDay(s.city, new Date(planDay0(F) + IST_MS).toISOString().slice(0, 10), day, s.dayStops, s.prefs.mode); // IST date; history stays PM2.5 so days compare
    }
    catch (e) {
      const saved = isOffline(e) && !!ref.current.savedAt; // offline on a saved forecast: keep the map, explain
      set({ dayBusy: false, ...(isOffline(e) && !saved ? { offline: true } : {}) });
      if (!isOffline(e) || saved) notify(saved ? "You're offline. Planning your day needs a connection." : (e as ApiError).message);
    }
  }, [set, notify]);

  /** Save an on-device reminder. With push on it also arrives when Sora is closed (the server only gets a wake-up time). */
  const remind = useCallback(async (input: Omit<Reminder, 'id'> & { id?: string }) => {
    const r: Reminder = { id: input.id ?? 'r' + Date.now().toString(36), at: input.at, title: input.title, body: input.body };
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* blocked */ } }
    store.set('sora.reminders', JSON.stringify([...readList<Reminder>('sora.reminders'), r]));
    schedule(r);
    const pushed = await scheduleWake(r.id, r.at, r.title, r.body);
    const denied = !('Notification' in window) || Notification.permission === 'denied';
    notify(`Reminder set for ${istHHMM(r.at)}.` + (denied ? ' Notifications are blocked in this browser, so check back then.'
      : pushed ? ' It arrives even when Sora is closed.' : ' It arrives while Sora is open in a tab; turn on notifications in settings to get it when Sora is closed.'));
  }, [notify]);

  /** Spec §28.2 on this device: for the saved trip, one suggestion a day when it is clearly and confidently better. */
  const proactive = useCallback((s: State, res: PlanOk) => {
    const rec = res.options.find((o) => o.id === res.recommended), t = s.trip, o = placeLL(s, t.origin), d = placeLL(s, t.dest);
    if (o && d) saveTripContext({ city: s.city, origin: o, dest: d, mode: t.mode, dep: t.dep, win: +t.win, maxExtra: t.maxExtra, ob: t.ob, db: t.db, destName: placeOf(t.dest)?.name ?? 'your destination', proactive: s.notif.proactive });
    if (!s.notif.proactive || !res.reliable || !rec?.departure_iso || rec.departure === res.baseline.departure && rec.extra_min >= 0) return;
    if (rec.reduction_pct.median < PROACTIVE.rMin || (rec.p_better ?? 0) < PROACTIVE.cMin) return;
    const at = Date.parse(rec.departure_iso) - 15 * 60e3, today = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
    if (at < Date.now() + 5 * 60e3 || store.get('sora.proactive') === today) return;
    store.set('sora.proactive', today);
    remind({ id: 'p' + today.replace(/-/g, ''), at: new Date(at).toISOString(), title: `Leave at ${rec.departure} for ${placeOf(t.dest)?.name ?? 'your destination'}`,
      body: `About ${rec.reduction_pct.median}% less exposure than leaving at ${t.dep} (${Math.round((rec.p_better ?? 0) * 100)}% chance it helps).` });
  }, [remind]);

  /** Notifications: city alerts and proactive suggestions, both off by default (spec §28). Push is enabled on first use. */
  const setNotif = useCallback(async (p: Partial<State['notif']>) => {
    const next = { ...ref.current.notif, ...p };
    if (next.alerts || next.proactive) {
      const r = await enablePush(ref.current.city, next.alerts);
      if (r !== 'on') {
        notify(r === 'denied' ? 'Notifications are blocked for Sora in this browser. Allow them in the site settings, then try again.'
          : r === 'unsupported' ? "This browser can't show notifications from Sora." : "Couldn't turn notifications on. Try again later.");
        return;
      }
    } else await disablePush();
    store.set('sora.notif', JSON.stringify({ alerts: next.alerts, proactive: next.proactive }));
    set({ notif: { ...next, push: pushOn() } });
  }, [set, notify]);

  const notifyWhenLive = useCallback((key: string) => {
    store.set('sora.notify', JSON.stringify([...new Set([...readList<string>('sora.notify'), key])]));
    notify(`Saved. You'll see a notice here when ${cityOf(key).name} goes live.`);
  }, [notify]);

  const clearHistory = useCallback(() => {
    DEVICE_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } });
    clearDevice(); // push subscription, reminder texts and the saved trip in the service worker's storage
    window.dispatchEvent(new Event('sora:cleared')); // stops a recording in progress
    set({ menuOpen: false, notif: { alerts: false, proactive: false, push: false } });
    notify('History on this device deleted: planned days, recorded trips, reminders, notifications and saved notices.');
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
    const unSaved = onSaved((savedAt) => set({ savedAt }));
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
    return () => { clearInterval(iv); unSaved(); window.removeEventListener('resize', onR); window.removeEventListener('keydown', onK); };
  }, [set, rm, openSearch, notify]);

  /* plans follow the pollutant on the map, once its forecast has loaded */
  const polled = planPollutant(st);
  useEffect(() => {
    if (ref.current.booting) return;
    runPlan(false);
    loadDay();
  }, [polled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* city alerts follow the city on screen (permission is already granted, so no prompt) */
  useEffect(() => {
    if (ref.current.notif.alerts && pushOn()) enablePush(st.city, true);
  }, [st.city]);

  /* city (or retry): PM2.5 field first, then plan, events, day and the other pollutants */
  useEffect(() => {
    let live = true;
    const city = st.city;
    set({ booting: true, fields: {}, events: [], res: null, day: null, pt: null, t: 0 });
    (async () => {
      try {
        /* places can fail on their own (e.g. a city without a place list): keep the current ones then */
        const [pm, pl] = await Promise.all([api.field(city, 'pm25'), api.places(city).catch(() => null)]);
        if (!live) return;
        let stops: DayStop[] | undefined;
        if (pl) {
          registerPlaces(pl.places);
          /* the example replaces the trip and day only on arriving in a city, never on a retry, so edits survive */
          const ex = pl.example && exampleFor.current !== city ? fromExample(pl.example, ref.current.trip) : null;
          exampleFor.current = city;
          stops = ex?.dayStops;
          set({ places: pl.places, example: pl.example, ...(ex ?? {}) });
        }
        set({ fields: { pm25: pm }, booting: false, offline: false });
        runPlan(false);
        loadDay(pm, stops);
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
    notify, remind, notifyWhenLive, clearHistory, addPlace, setNotif,
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
