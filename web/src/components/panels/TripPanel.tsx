import { useEffect, type FormEvent } from 'react';
import { BUILDINGS, MODES, ROUTE, pareto, recOf, departed, routeColor, sgn, segs, toMin, hhmm, type BuildingKey, type PlanOk, type TripOption } from '../../data/sora';
import { placeOf, useSora } from '../../state/store';
import { istDayStart, istHHMM, istMinutes } from '../../lib/time';
import { Select } from '../Chrome';
import { Icon } from '../Icon';
import { Disclaimer, Dl, Meter, PanelHeader, SubTabs } from './shared';

export const placeName = (k: string) => (k === 'custom_here' ? 'Your location' : placeOf(k)?.name || (k.startsWith('custom_') ? 'Dropped pin' : 'Choose a place'));
export const modeLabel = (k: string) => MODES.find((m) => m.k === k)?.label || '';

export function TripPanel() {
  const { st, set, setTrip, runPlan, selectOpt } = useSora();
  const { trip, res } = st;
  /* every edit already re-plans; submitting (Enter) just closes the form */
  const submit = (e: FormEvent) => { e.preventDefault(); set({ editTrip: false }); };

  /* answer-first: the heading is the decision; the route is context underneath */
  const ok = res && !res.error ? res : null, recId = ok ? recOf(ok) : null, rec = ok?.options.find((o) => o.id === recId);
  /* the map's time follows the answer: opening Trip shows the air at the selected option's departure */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ok) selectOpt(st.sel); }, [!!ok]);
  const allPassed = !!ok && ok.reliable && !rec;
  const head = !ok ? { title: `${placeName(trip.origin)} → ${placeName(trip.dest)}`, sub: undefined }
    : allPassed ? { title: 'The cleaner departures have already left', sub: <>Of the times still ahead, none beats your plan with 70% confidence. Leaving at {ok.baseline.departure} as planned is reasonable.</> }
    : rec
      ? { title: `Leave at ${rec.departure} by the ${rec.label.toLowerCase()} route`, sub: <>About <b style={{ fontWeight: 500 }}>{rec.reduction_pct.median}% less exposure</b> <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({rec.reduction_pct.p05}–{rec.reduction_pct.p95}%)</span>, {rec.extra_min >= 0 ? '+' : '−'}{Math.abs(rec.extra_min)} min, {Math.round((rec.p_better || 0) * 100)}% likely lower than your plan.</> }
      : { title: 'Go whichever way suits you', sub: <>No option beats your plan with 70% confidence today, so the differences below are within the forecast's error.</> };

  return (
    <div className="stack g32">
      <PanelHeader title={head.title} sub={head.sub}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p className="lede" style={{ flex: 1, minWidth: 200, fontSize: 'var(--fs-small)' }}>{ok ? `${placeName(trip.origin)} → ${placeName(trip.dest)} · ` : ''}{modeLabel(trip.mode)}, planned {trip.dep} IST · window ± {trip.win} min · up to {trip.maxExtra} extra min</p>
          <button className="btn-outline" style={{ height: 40, padding: '0 16px' }} onClick={() => set((s) => ({ editTrip: !s.editTrip }))} aria-expanded={st.editTrip}>
            <Icon name={st.editTrip ? 'check' : 'sliders-horizontal'} size={14} />{st.editTrip ? 'Done' : 'Edit trip'}
          </button>
        </div>
      </PanelHeader>

      {st.editTrip && <TripForm onSubmit={submit} />}

      {res?.error && (() => {
        /* keyed by API error code (docs/api_contract.md); the server's message is the body text */
        /* recovery actions come from the city's example trip (GET /api/places) and the clock, not fixed places */
        const ex = st.example?.trip;
        const example = () => ex && setTrip({ origin: ex.origin, dest: ex.dest }, true);
        const exLabel = ex ? `Use ${placeName(ex.origin)} → ${placeName(ex.dest)}` : 'Edit trip';
        const fix = ex ? example : () => set({ editTrip: true });
        const now = Math.ceil(istMinutes(new Date().toISOString()) / 5) * 5 + 5;
        const E = ({
          no_feasible: ['clock-alert', 'No departure meets your arrival time', 'Clear arrival time', () => { set({ demo: 'none' }); setTrip({ latest: '' }, true); }],
          outside: ['map-pin-off', 'Point outside the routable area', exLabel, fix],
          no_route: ['route', 'No route for this mode', exLabel, fix],
          missing: ['map-pin', 'Choose a start and destination', ex ? 'Use an example' : 'Edit trip', fix],
          beyond_horizon: ['clock-alert', 'Outside the forecast window', `Leave at ${hhmm(now)}`, () => setTrip({ dep: hhmm(now) }, true)],
        } as Record<string, [string, string, string, () => void]>)[res.error] ?? ['circle-slash', 'This trip could not be planned', 'Try again', runPlan];
        const body = res.message || 'Search, pick from the list, or click the map.';
        return (
          <section role="alert" className="sec">
            <h2 style={{ margin: 0, fontSize: 'var(--fs-h3-lg)', fontWeight: 400, letterSpacing: 'var(--tr-h2)', display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ color: 'var(--danger)', display: 'flex' }}><Icon name={E[0]} size={18} /></span>{E[1]}</h2>
            <p className="lede">{body}</p>
            <button className="btn-outline" style={{ alignSelf: 'flex-start' }} onClick={E[3]}>{E[2]}</button>
          </section>
        );
      })()}

      {res && !res.error && <TripResult res={res} />}
      <Disclaimer />
    </div>
  );
}

function TripForm({ onSubmit }: { onSubmit: (e: FormEvent) => void }) {
  const { st, set, setTrip } = useSora();
  const { trip } = st;
  const placeOpts = [...st.places, ...Object.keys(st.custom).map((k) => ({ k: 'custom_' + k, name: k === 'here' ? 'Your location' : `Dropped pin (${st.custom[k][0].toFixed(3)}, ${st.custom[k][1].toFixed(3)})` }))];
  const ends = [['origin', 'Start', '50%', 'var(--route-halo)'], ['dest', 'Destination', '2px', 'var(--text-primary)']] as const;
  const lbl = (t: string) => <span className="eyebrow">{t}</span>;
  return (
    <form onSubmit={onSubmit} className="stack g32 ruled">
      <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eyebrow" style={{ padding: 0, marginBottom: 12 }}>Route</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 12, alignItems: 'center' }}>
          <div className="stack g8">
            {ends.map(([k, l, r, fill]) => {
              const picking = st.pick === k;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 6px 0 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', border: `1px solid ${picking ? 'var(--brand)' : 'var(--border-default)'}` }}>
                  <span style={{ width: 10, height: 10, flex: 'none', borderRadius: r, border: '2px solid var(--text-primary)', background: fill }} />
                  <div className="sel-wrap" style={{ flex: 1, minWidth: 0 }}>
                    <select value={trip[k]} aria-label={l}
                      onChange={(e) => { const b = placeOf(e.target.value)?.building; setTrip({ [k]: e.target.value, ...(b ? { [k === 'origin' ? 'ob' : 'db']: b } : {}) }, true); }}
                      style={{ appearance: 'none', WebkitAppearance: 'none', width: '100%', height: 48, border: 0, background: 'transparent', fontSize: 'var(--fs-body)', paddingRight: 20, textOverflow: 'ellipsis' }}>
                      {!placeOpts.some((o) => o.k === trip[k]) && <option value={trip[k]} disabled>{placeName(trip[k])}</option>}
                      {placeOpts.map((o) => <option key={o.k} value={o.k}>{o.name}</option>)}
                    </select>
                    <span className="chev" style={{ right: 0 }}><Icon name="chevron-down" size={14} /></span>
                  </div>
                  <button type="button" aria-pressed={picking} aria-label={`Pick ${l.toLowerCase()} on map`} title="Pick on map"
                    onClick={() => set((s) => ({ pick: s.pick === k ? null : k, sheet: s.w < 768 ? 0 : s.sheet }))}
                    style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-pill)', border: 0, background: picking ? 'var(--brand)' : 'transparent', color: picking ? 'var(--text-on-accent)' : 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="mouse-pointer-click" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="icon-btn" aria-label="Swap start and destination" onClick={() => setTrip({ origin: trip.dest, dest: trip.origin }, true)}
            style={{ border: '1px solid var(--border-default)', transform: 'rotate(90deg)' }}><Icon name="arrow-left-right" size={15} /></button>
        </div>
        {st.pick && (
          <span style={{ fontSize: 'var(--fs-small)', color: 'var(--brand-text)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="crosshair" size={14} />{st.pick === 'origin' ? 'Click the map to set the start. Esc to cancel.' : 'Click the map to set the destination. Esc to cancel.'}
          </span>
        )}
      </fieldset>

      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="eyebrow" style={{ padding: 0, marginBottom: 12 }}>Mode</legend>
        <ModePicker />
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: '24px 16px' }}>
        <label className="field">{lbl('Planned departure')}
          <div className="input-box"><Icon name="clock" size={15} /><input type="time" value={trip.dep} onChange={(e) => e.target.value && setTrip({ dep: e.target.value }, true)} /><span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>IST</span></div>
        </label>
        <label className="field">{lbl('Departure window')}
          <Select className="sel-lg" chevClass="lg" value={trip.win} onChange={(v) => setTrip({ win: v }, true)}
            options={[{ k: '30', label: '± 30 min' }, { k: '60', label: '± 60 min' }, { k: '90', label: '± 90 min' }, { k: '0', label: 'Fixed time' }]} />
        </label>
        <label className="field">{lbl('Latest arrival · optional')}
          <div className="input-box"><Icon name="flag" size={15} /><input type="time" value={trip.latest} onChange={(e) => setTrip({ latest: e.target.value }, true)} /></div>
        </label>
        <label className="field">{lbl('Max extra time')}
          <div className="input-box"><Icon name="timer" size={15} /><input type="number" min={0} max={45} value={trip.maxExtra} onChange={(e) => setTrip({ maxExtra: Math.max(0, Math.min(45, +e.target.value || 0)) }, true)} /><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>min</span></div>
        </label>
        <label className="field">{lbl('Building at start')}
          <Select<BuildingKey> className="sel-lg" chevClass="lg" value={trip.ob} options={BUILDINGS} onChange={(v) => setTrip({ ob: v }, true)} />
        </label>
        <label className="field">{lbl('Building at destination')}
          <Select<BuildingKey> className="sel-lg" chevClass="lg" value={trip.db} options={BUILDINGS} onChange={(v) => setTrip({ db: v }, true)} />
        </label>
      </div>
      {/* options update as you edit; this line reports it instead of a second submit button */}
      <p aria-live="polite" style={{ margin: 0, minHeight: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>
        {st.planning ? <><span className="spin" />Updating options…</> : 'Options update as you change the trip.'}
      </p>
    </form>
  );
}

/** Seven-mode radio grid; also used in onboarding (compact). */
export function ModePicker({ compact = false }: { compact?: boolean }) {
  const { st, set, setTrip } = useSora();
  return (
    <div role="radiogroup" aria-label="Mode" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: compact ? 4 : 6 }}>
      {MODES.map((m) => (
        <button key={m.k} type="button" role="radio" className="mode-btn" aria-checked={st.trip.mode === m.k} aria-label={m.label} title={m.label}
          style={compact ? { minHeight: 52, gap: 3, fontSize: 'var(--fs-micro)', padding: 0 } : undefined}
          onClick={() => { setTrip({ mode: m.k }, st.onb < 0); if (st.onb >= 0) set((s) => ({ prefs: { ...s.prefs, mode: m.k } })); }}>
          <Icon name={m.icon} size={18} />{m.short}
        </button>
      ))}
    </div>
  );
}

function OptionRow({ o, res }: { o: TripOption; res: PlanOk }) {
  const { st, selectOpt } = useSora();
  /* reliability is only claimed when the plan as a whole is reliable and this departure hasn't left */
  const recId = recOf(res), gone = departed(o);
  const isPlan = o.id === 'plan', p = o.p_better, rel = res.reliable && !gone && p != null && p >= 0.7, R = ROUTE[o.id];
  const selected = st.sel === o.id, recommended = recId === o.id;
  const pTxt = p == null ? '' : Math.round(p * 100) + '%';
  const redTxt = isPlan ? 'Your baseline' : `${sgn(-o.reduction_pct.median)}% (${sgn(-o.reduction_pct.p05)} to ${sgn(-o.reduction_pct.p95)})`;
  return (
    <button className="opt-row" onClick={() => selectOpt(o.id)} aria-pressed={selected} style={gone ? { opacity: 0.6 } : undefined}
      aria-label={`${o.label}: estimated dose ${o.dose.median} µg, range ${o.dose.p05} to ${o.dose.p95}${p != null ? `, ${pTxt} chance it is lower than your plan` : ''}`}>
      <svg width="32" height="12" style={{ marginTop: 6 }} aria-hidden="true">
        <line x1="2" y1="6" x2="30" y2="6" stroke="var(--route-halo)" strokeWidth={R.w + 3} strokeLinecap="round" />
        <line x1="2" y1="6" x2="30" y2="6" stroke={routeColor(o.id, recId)} strokeWidth={R.w} strokeDasharray={R.dash || undefined} strokeLinecap="round" />
      </svg>
      {/* three lines: name · cost · confidence */}
      <div className="stack g8" style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--fs-lead)', letterSpacing: 'var(--tr-h3)' }}>{isPlan ? 'Your plan' : `${o.id} · ${o.label}`}</span>
          {recommended && <span className="tag-rec">Recommended</span>}
        </span>
        <span className="mono" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>
          <span>leave {o.departure}{gone ? ' · already left' : ''}</span>
          {!isPlan && <span>{(o.extra_min >= 0 ? '+' : '−') + Math.abs(o.extra_min)} min</span>}
          <span style={{ color: !isPlan && rel ? 'var(--success)' : undefined }}>{redTxt}</span>
        </span>
        {!isPlan && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 300 }}>
            <span style={{ flex: 1 }}><Meter colors={segs(res.reliable && !gone ? p || 0 : 0, rel)} /></span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{!res.reliable ? 'not reliably different' : gone ? 'already left' : ` `}</span>
          </span>
        )}
      </div>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="tnum" style={{ fontSize: 'var(--fs-num-md)', fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em' }}>{o.dose.median}</span>
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>µg</span>
        </span>
        <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>{o.dose.p05}–{o.dose.p95}</span>
      </span>
    </button>
  );
}

/** Where an option's dose comes from over the planning window (spec §22.4), largest part first. */
function DoseParts({ o, mode, window }: { o: TripOption; mode: string; window: string }) {
  const parts = o.segments ?? [], total = parts.reduce((a, s) => a + s.dose, 0) || 1;
  const travel = mode === 'metro' ? 'var(--me-metro)' : ['walk', 'cycle', 'two_wheeler'].includes(mode) ? 'var(--me-road)' : 'var(--me-vehicle)';
  const color = (k: string) => (k === 'indoor' ? 'var(--me-home)' : k === 'access' ? 'var(--me-road)' : travel);
  return (
    <section aria-label="Where the dose comes from" className="stack g12" style={{ marginTop: 8 }}>
      <span className="eyebrow">Where the dose comes from, {window} IST</span>
      {parts.map((s) => {
        const pct = s.dose / total;
        return (
          <div key={s.label} className="stack g6">
            <div style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-small)' }}>
              <span style={{ flex: 1 }}>{s.label[0].toUpperCase() + s.label.slice(1)}</span>
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>{s.minutes} min · {Math.round(pct * 100)}%</span>
            </div>
            <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'var(--surface-raised)' }}>
              <span style={{ display: 'block', width: `${(pct * 100).toFixed(1)}%`, height: '100%', borderRadius: 3, background: color(s.kind) }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TripResult({ res }: { res: PlanOk }) {
  const { st, set, selectOpt, remind } = useSora();
  const all = [res.baseline, ...res.options];
  const sub = st.sub.trip;
  const so = all.find((o) => o.id === st.sel) || res.options[1], isP = so.id === 'plan';
  const PR = pareto(res, 360, 190);
  const caveats = [...res.caveats, ...(st.demo === 'degraded' ? ['Satellite data only: treat this advice as indicative.'] : [])];
  /* the trip ends on an action: a reminder 10 min before the chosen departure (today, or tomorrow if that has passed) */
  /* 10 min before the option's real departure; if that moment has passed (or no date is known), the same time tomorrow */
  const today0 = istDayStart(new Date().toISOString());
  let at = so.departure_iso ? Date.parse(so.departure_iso) - 10 * 60e3 : today0 + (toMin(so.departure) - 10) * 60e3;
  while (at < Date.now()) at += 86400e3;
  const tomorrow = at >= today0 + 86400e3;
  const remindAt = () => new Date(at).toISOString();
  const remindLabel = `Remind me ${tomorrow ? 'tomorrow ' : ''}at ${hhmm(toMin(so.departure) - 10)}`;
  const recId = recOf(res);
  const claim = !isP && recId === so.id ? `${so.label} option: about ${so.reduction_pct.median}% lower estimated dose than your plan.` : isP ? 'Your planned trip.' : `${so.label} option.`;
  return (
    <div className="stack g32">
      {/* the commit action sits right under the answer, above the detail */}
      <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => remind({ at: remindAt(), title: `Leave at ${so.departure}`, body: claim })}>
        <Icon name="bell" size={16} />{remindLabel}
      </button>
      <SubTabs label="Trip results" items={[['options', 'Options'], ['why', 'Why'], ['chart', 'Chart']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, trip: k } }))} />
      {sub === 'options' && (
        <section aria-label="Options" className="stack g20">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span className="eyebrow">Your plan and {res.options.length} alternatives</span>
            <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>{res.window.start}–{res.window.end} IST</span>
          </div>
          <div className="stack" style={{ borderTop: '1px solid var(--border-default)' }}>
            {all.map((o) => (
              <div key={o.id} className="stack">
                <OptionRow o={o} res={res} />
                {recId === o.id && recId === res.recommended && res.explanation[0] && (
                  <p style={{ margin: 0, padding: 'var(--space-3) 0 var(--space-4) 48px', fontSize: 'var(--fs-small)', lineHeight: 1.55, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)', textWrap: 'pretty' }}>{res.explanation[0]}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sub === 'why' && (
        <section aria-label="Why" className="sec">
          <span className="eyebrow">Why {isP ? 'your plan' : `option ${so.id} · ${so.label.toLowerCase()}`}</span>
          <div className="stack g12" style={{ fontSize: 'var(--fs-h4)', lineHeight: 1.55 }}>
            {(isP ? [`This is the trip as you planned it: leave at ${so.departure} on your usual route.`] : res.explanation).map((t) => <p key={t} style={{ margin: 0, textWrap: 'pretty' }}>{t}</p>)}
          </div>
          {!!so.segments?.length && <DoseParts o={so} mode={st.trip.mode} window={`${res.window.start}–${res.window.end}`} />}
          <div style={{ marginTop: 8 }}>
            <Dl rows={[
              ['Benefit', isP ? `Baseline · ${so.dose.median} µg (${so.dose.p05}–${so.dose.p95})` : `${sgn(-so.reduction_pct.median)}% (${sgn(-so.reduction_pct.p05)} to ${sgn(-so.reduction_pct.p95)})`, { fontFamily: 'var(--font-mono)' }],
              ['Cost', isP ? `${so.travel_min} min · leave ${so.departure}`
                : `${so.extra_min >= 0 ? '+' : '−'}${Math.abs(so.extra_min)} min · leave ${so.departure}` + (so.departure_min !== res.baseline.departure_min ? ` (${Math.abs(res.baseline.departure_min - so.departure_min)} min ${so.departure_min < res.baseline.departure_min ? 'earlier' : 'later'})` : ''), { fontFamily: 'var(--font-mono)' }],
              ['Confidence', isP ? '—' : `${Math.round((so.p_better || 0) * 100)}% chance it's lower than your plan` + ((so.p_better || 0) >= 0.7 ? '' : ' · not reliable')],
              ['Caveats', <>{caveats.map((c) => <span key={c}>{c}</span>)}</>, { display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-secondary)', lineHeight: 1.55 }],
            ]} />
          </div>
        </section>
      )}

      {sub === 'chart' && (
        <section aria-label="Trade-off chart" className="sec">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span className="eyebrow">Exposure against travel time</span>
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>bars = 90% range{PR.front.length ? ' · dots = best trade-offs' : ''}</span>
          </div>
          <svg viewBox="0 0 360 190" role="img" style={{ width: '100%', height: 'auto' }}
            aria-label={all.map((o) => `${o.label}: dose ${o.dose.median} µg, range ${o.dose.p05}–${o.dose.p95}, ${o.travel_min} min` + (o.p_better != null ? `, ${Math.round(o.p_better * 100)}% chance lower` : '')).join('; ')}>
            <line x1="28" y1="162" x2="350" y2="162" stroke="var(--border-default)" />
            <line x1="28" y1="10" x2="28" y2="162" stroke="var(--border-default)" />
            <polyline points={PR.frontier} fill="none" stroke="var(--text-tertiary)" strokeDasharray="3 4" />
            {PR.front.map(({ x, y, f }) => (
              <circle key={f.departure + f.travel_min} cx={x} cy={y} r={3} fill="var(--text-tertiary)">
                <title>{`Leave ${istHHMM(f.departure)} · ${f.travel_min} min · ${f.dose.median} µg (${f.dose.p05}–${f.dose.p95})`}</title>
              </circle>
            ))}
            {PR.pts.map((p) => {
              const on = p.id === st.sel;
              return (
                <g key={p.id} role="button" tabIndex={0} aria-pressed={on} aria-label={p.id === 'plan' ? 'Select your plan' : `Select option ${p.id}`} className="chart-pt" style={{ cursor: 'pointer' }}
                  onClick={() => selectOpt(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOpt(p.id); } }}>
                  <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
                  <line x1={p.x} x2={p.x} y1={p.y05} y2={p.y95} stroke={p.c} strokeWidth={on ? 3 : 2} opacity={0.55} />
                  <circle cx={p.x} cy={p.y} r={on ? 7 : 5} fill={p.hollow ? 'var(--surface-raised)' : p.c} stroke={p.c} strokeWidth={2} />
                  <text x={p.x + 9} y={p.y - 6} fontSize={11} fill="var(--text-secondary)" style={{ fontFamily: 'var(--font-mono)' }}>{p.letter}</text>
                </g>
              );
            })}
            <text x="350" y="182" textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{PR.xLabel}</text>
            <text x="32" y="18" fontSize={10} fill="var(--text-tertiary)">µg</text>
          </svg>
        </section>
      )}
    </div>
  );
}
