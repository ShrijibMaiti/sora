import type { FormEvent } from 'react';
import { BUILDINGS, MODES, PLACES, ROUTE, pareto, routeColor, sgn, segs, type BuildingKey, type PlanOk, type TripOption } from '../../data/sora';
import { useSora } from '../../state/store';
import { Select } from '../Chrome';
import { Icon } from '../Icon';
import { Disclaimer, Dl, Meter, PanelHeader, SubTabs } from './shared';

export const placeName = (k: string) => PLACES.find((p) => p.k === k)?.name || 'Dropped pin';
export const modeLabel = (k: string) => MODES.find((m) => m.k === k)?.label || '';

export function TripPanel() {
  const { st, set, setTrip, runPlan } = useSora();
  const { trip, res } = st;
  const submit = (e: FormEvent) => { e.preventDefault(); set({ editTrip: false }); runPlan(); };

  return (
    <div className="stack g32">
      <PanelHeader eyebrow="02 · Plan a trip" title={`${placeName(trip.origin)} → ${placeName(trip.dest)}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p className="lede" style={{ flex: 1, minWidth: 200 }}>{modeLabel(trip.mode)}, leaving {trip.dep} IST · window ± {trip.win} min · up to {trip.maxExtra} extra min</p>
          <button className="btn-outline" style={{ height: 40, padding: '0 16px' }} onClick={() => set((s) => ({ editTrip: !s.editTrip }))} aria-expanded={st.editTrip}>
            <Icon name={st.editTrip ? 'check' : 'sliders-horizontal'} size={14} />{st.editTrip ? 'Done' : 'Edit trip'}
          </button>
        </div>
      </PanelHeader>

      {st.editTrip && <TripForm onSubmit={submit} />}

      {res?.error && (() => {
        /* keyed by API error code (docs/api_contract.md); the server's message is the body text */
        const example = () => setTrip({ origin: 'saket', dest: 'cp' }, true);
        const E = ({
          no_feasible: ['clock-alert', 'No departure meets your arrival time', 'Clear arrival time', () => { set({ demo: 'none' }); setTrip({ latest: '' }, true); }],
          outside: ['map-pin-off', 'Point outside the routable area', 'Use Saket → Connaught Place', example],
          no_route: ['route', 'No route for this mode', 'Use Saket → Connaught Place', example],
          missing: ['map-pin', 'Choose a start and destination', 'Use an example', example],
          beyond_horizon: ['clock-alert', 'Outside the forecast window', 'Leave at 18:15', () => setTrip({ dep: '18:15' }, true)],
        } as Record<string, [string, string, string, () => void]>)[res.error] ?? ['circle-slash', 'This trip could not be planned', 'Try again', runPlan];
        const body = res.message || 'Search, pick from the list, or click the map.';
        return (
          <section role="alert" className="sec">
            <span className="eyebrow" style={{ color: 'var(--danger)', display: 'flex', gap: 8, alignItems: 'center' }}><Icon name={E[0]} size={14} />Can't plan this trip</span>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-.02em' }}>{E[1]}</h2>
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
  const placeOpts = [...PLACES, ...Object.keys(st.custom).map((k) => ({ k: 'custom_' + k, name: `Dropped pin (${st.custom[k][0].toFixed(3)}, ${st.custom[k][1].toFixed(3)})` }))];
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
                    <select value={trip[k]} aria-label={l} onChange={(e) => setTrip({ [k]: e.target.value }, true)}
                      style={{ appearance: 'none', WebkitAppearance: 'none', width: '100%', height: 48, border: 0, background: 'transparent', fontSize: 15, paddingRight: 20, textOverflow: 'ellipsis' }}>
                      {placeOpts.map((o) => <option key={o.k} value={o.k}>{o.name}</option>)}
                    </select>
                    <span className="chev" style={{ right: 0 }}><Icon name="chevron-down" size={14} /></span>
                  </div>
                  <button type="button" aria-pressed={picking} aria-label={`Pick ${l.toLowerCase()} on map`} title="Pick on map"
                    onClick={() => set((s) => ({ pick: s.pick === k ? null : k, sheet: s.w < 768 ? 0 : s.sheet }))}
                    style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-pill)', border: 0, background: picking ? 'var(--brand)' : 'transparent', color: picking ? '#fff' : 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}>
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
          <span style={{ fontSize: 13, color: 'var(--brand)', display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <div className="input-box"><Icon name="clock" size={15} /><input type="time" value={trip.dep} onChange={(e) => e.target.value && setTrip({ dep: e.target.value }, true)} /><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>IST</span></div>
        </label>
        <label className="field">{lbl('Departure window')}
          <Select className="sel-lg" chevClass="lg" value={trip.win} onChange={(v) => setTrip({ win: v }, true)}
            options={[{ k: '30', label: '± 30 min' }, { k: '60', label: '± 60 min' }, { k: '90', label: '± 90 min' }, { k: '0', label: 'Fixed time' }]} />
        </label>
        <label className="field">{lbl('Latest arrival · optional')}
          <div className="input-box"><Icon name="flag" size={15} /><input type="time" value={trip.latest} onChange={(e) => setTrip({ latest: e.target.value }, true)} /></div>
        </label>
        <label className="field">{lbl('Max extra time')}
          <div className="input-box"><Icon name="timer" size={15} /><input type="number" min={0} max={45} value={trip.maxExtra} onChange={(e) => setTrip({ maxExtra: Math.max(0, Math.min(45, +e.target.value || 0)) }, true)} /><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>min</span></div>
        </label>
        <label className="field">{lbl('Building at start')}
          <Select<BuildingKey> className="sel-lg" chevClass="lg" value={trip.ob} options={BUILDINGS} onChange={(v) => setTrip({ ob: v }, true)} />
        </label>
        <label className="field">{lbl('Building at destination')}
          <Select<BuildingKey> className="sel-lg" chevClass="lg" value={trip.db} options={BUILDINGS} onChange={(v) => setTrip({ db: v }, true)} />
        </label>
      </div>
      <button type="submit" className="btn-primary" aria-busy={st.planning} style={{ alignSelf: 'flex-start', height: 52, padding: '0 28px', fontSize: 15 }}>
        {st.planning && <span className="spin" />}{st.planning ? 'Finding options…' : 'Find cleaner options'}
      </button>
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
          style={compact ? { minHeight: 52, gap: 3, fontSize: 10, padding: 0 } : undefined}
          onClick={() => { setTrip({ mode: m.k }, st.onb < 0); if (st.onb >= 0) set((s) => ({ prefs: { ...s.prefs, mode: m.k } })); }}>
          <Icon name={m.icon} size={18} />{m.short}
        </button>
      ))}
    </div>
  );
}

function OptionRow({ o, res }: { o: TripOption; res: PlanOk }) {
  const { st, selectOpt } = useSora();
  const isPlan = o.id === 'plan', p = o.p_better, rel = p != null && p >= 0.7, R = ROUTE[o.id];
  const selected = st.sel === o.id, recommended = res.reliable && res.recommended === o.id;
  const pTxt = p == null ? '' : Math.round(p * 100) + '%';
  const redTxt = isPlan ? 'Your baseline' : `${sgn(-o.reduction_pct.median)}% (${sgn(-o.reduction_pct.p05)} to ${sgn(-o.reduction_pct.p95)})`;
  return (
    <button className="opt-row" onClick={() => selectOpt(o.id)} aria-pressed={selected}
      aria-label={`${o.label}: estimated dose ${o.dose.median} µg, range ${o.dose.p05} to ${o.dose.p95}${p != null ? `, ${pTxt} chance it is lower than your plan` : ''}`}>
      <svg width="32" height="12" style={{ marginTop: 6 }} aria-hidden="true">
        <line x1="2" y1="6" x2="30" y2="6" stroke="var(--route-halo)" strokeWidth={R.w + 3} strokeLinecap="round" />
        <line x1="2" y1="6" x2="30" y2="6" stroke={routeColor(o.id)} strokeWidth={R.w} strokeDasharray={R.dash || undefined} strokeLinecap="round" />
      </svg>
      <div className="stack g14" style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{isPlan ? '—' : o.id}</span>
          <span style={{ fontSize: 17, letterSpacing: '-.01em' }}>{o.label}</span>
          {recommended && <span className="tag-rec">Recommended</span>}
        </span>
        <span className="mono" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ color: !isPlan && rel ? 'var(--success)' : 'var(--text-secondary)' }}>{redTxt}</span>
          <span>{(o.extra_min >= 0 ? '+' : '−') + Math.abs(o.extra_min)} min</span>
          <span>leave {o.departure}</span>
        </span>
        <span className="stack g8" style={{ maxWidth: 280 }}>
          <Meter colors={segs(p || 0, rel)} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{isPlan ? 'Your own plan' : rel ? 'Reliably lower' : 'Not reliably lower'} <span className="mono" style={{ color: 'var(--text-secondary)' }}>{pTxt}</span></span>
        </span>
      </div>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="tnum" style={{ fontSize: 34, fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em' }}>{o.dose.median}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>µg</span>
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{o.dose.p05}–{o.dose.p95}</span>
      </span>
    </button>
  );
}

function TripResult({ res }: { res: PlanOk }) {
  const { st, set, selectOpt } = useSora();
  const all = [res.baseline, ...res.options];
  const sub = st.sub.trip;
  const so = all.find((o) => o.id === st.sel) || res.options[1], isP = so.id === 'plan';
  const PR = pareto(res, 360, 190);
  const caveats = [...res.caveats, ...(st.demo === 'degraded' ? ['CAMS only — treat this advice as indicative.'] : [])];
  return (
    <div className="stack g48">
      <SubTabs items={[['options', 'Options'], ['why', 'Why'], ['chart', 'Trade-off']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, trip: k } }))} />
      {sub === 'options' && (
        <section aria-label="Options" className="stack g20">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span className="eyebrow">Options</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>window {res.window.start}–{res.window.end} IST</span>
          </div>
          {!res.reliable && (
            <div role="status" style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 14, padding: 20, borderRadius: 'var(--radius-lg)', background: 'var(--warning-soft)' }}>
              <span style={{ color: 'var(--warning)', display: 'flex', paddingTop: 3 }}><Icon name="equal-approximately" size={16} /></span>
              <div className="stack g6">
                <span style={{ fontSize: 16 }}>Options not reliably different today</span>
                <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>None of them beats your plan with 70% confidence. Go whichever way suits you.</span>
              </div>
            </div>
          )}
          <div className="stack" style={{ borderTop: '1px solid var(--border-default)' }}>
            {all.map((o) => <OptionRow key={o.id} o={o} res={res} />)}
          </div>
        </section>
      )}

      {sub === 'why' && (
        <section aria-label="Why" className="sec">
          <span className="eyebrow">Why {isP ? 'your plan' : `option ${so.id} · ${so.label.toLowerCase()}`}</span>
          <div className="stack g12" style={{ fontSize: 16, lineHeight: 1.55 }}>
            {(isP ? [`This is the trip as you planned it: leave at ${so.departure} on your usual route.`] : res.explanation).map((t) => <p key={t} style={{ margin: 0, textWrap: 'pretty' }}>{t}</p>)}
          </div>
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
            <span className="eyebrow">Exposure vs travel time</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>bars = 90% range</span>
          </div>
          <svg viewBox="0 0 360 190" role="img" style={{ width: '100%', height: 'auto' }}
            aria-label={all.map((o) => `${o.label}: dose ${o.dose.median} µg, range ${o.dose.p05}–${o.dose.p95}, ${o.travel_min} min` + (o.p_better != null ? `, ${Math.round(o.p_better * 100)}% chance lower` : '')).join('; ')}>
            <line x1="28" y1="162" x2="350" y2="162" stroke="var(--border-default)" />
            <line x1="28" y1="10" x2="28" y2="162" stroke="var(--border-default)" />
            <polyline points={PR.frontier} fill="none" stroke="var(--text-tertiary)" strokeDasharray="3 4" />
            {PR.pts.map((p) => {
              const on = p.id === st.sel;
              return (
                <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => selectOpt(p.id)}>
                  <line x1={p.x} x2={p.x} y1={p.y05} y2={p.y95} stroke={p.c} strokeWidth={on ? 3 : 2} opacity={0.55} />
                  <circle cx={p.x} cy={p.y} r={on ? 7 : 5} fill={p.hollow ? 'var(--surface-raised)' : p.c} stroke={p.c} strokeWidth={2} />
                  <text x={p.x + 9} y={p.y - 6} fontSize={11} fill="var(--text-secondary)" fontFamily="Geist Mono">{p.letter}</text>
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
