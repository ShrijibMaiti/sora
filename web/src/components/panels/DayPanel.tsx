import { useMemo, useState } from 'react';
import { BUILDINGS, ME, PLACES, dayBars, hhmm, type BuildingKey, type DaySeg } from '../../data/sora';
import { NEW_STOP, activeField, useSora, type DayStop } from '../../state/store';
import { istDay } from '../../lib/time';
import { planDay0 } from '../../lib/field';
import { Select } from '../Chrome';
import { Icon } from '../Icon';
import { Disclaimer, Dl, PanelHeader, SubTabs } from './shared';

const fmt = (n: number) => n.toLocaleString('en-IN');
const PLACE_OPTS = PLACES.filter((p) => p.k !== 'noida').map((p) => ({ k: p.k, label: p.name }));
const ACTIVITY: { k: DayStop['activity']; label: string }[] = [{ k: 'rest', label: 'Resting' }, { k: 'light', label: 'Light: sitting, walking' }, { k: 'moderate', label: 'Moderate' }, { k: 'high', label: 'Exercise' }];
const COUNT = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const lbl = (t: string) => <span className="eyebrow">{t}</span>;

function StopEditor({ i, onRemove }: { i: number; onRemove: () => void }) {
  const { st, set } = useSora();
  const s = st.dayStops[i], n = st.dayStops.length, first = i === 0, last = i === n - 1;
  const up = (p: Partial<DayStop>) => set((x) => ({ dayStops: x.dayStops.map((d, j) => (j === i ? { ...d, ...p } : d)) }));
  return (
    <div className="stack g20" style={{ padding: '4px 0 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: '20px 16px' }}>
        <label className="field">{lbl('Name')}<div className="input-box"><input value={s.name} maxLength={32} onChange={(e) => up({ name: e.target.value })} /></div></label>
        <label className="field">{lbl('Place')}<Select className="sel-lg" chevClass="lg" value={s.place} options={PLACE_OPTS} label="Place" onChange={(v) => up({ place: v })} /></label>
        {!first && <label className="field">{lbl('Arrive after · optional')}<div className="input-box"><Icon name="clock" size={15} /><input type="time" value={s.after} onChange={(e) => up({ after: e.target.value })} /><span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>IST</span></div></label>}
        {!last && <label className="field">{lbl(first ? 'Leave at' : 'Leave by · optional')}<div className="input-box"><Icon name="flag" size={15} /><input type="time" value={s.before} onChange={(e) => up({ before: e.target.value })} /><span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>IST</span></div></label>}
        {!first && !last && <label className="field">{lbl('Stay')}<div className="input-box"><Icon name="timer" size={15} /><input type="number" min={15} max={720} step={5} value={s.dur} onChange={(e) => up({ dur: Math.max(15, Math.min(720, +e.target.value || 15)) })} /><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>min</span></div></label>}
        <label className="field">{lbl('Building')}<Select<BuildingKey> className="sel-lg" chevClass="lg" value={s.bld} options={BUILDINGS} label="Building" onChange={(v) => up({ bld: v })} /></label>
        {!first && !last && <label className="field">{lbl('Activity')}<Select<DayStop['activity']> className="sel-lg" chevClass="lg" value={s.activity} options={ACTIVITY} label="Activity" onChange={(v) => up({ activity: v })} /></label>}
        {!first && !last && <label className="field">{lbl('Alternative place · optional')}<Select className="sel-lg" chevClass="lg" value={s.alt} options={[{ k: '', label: 'None' }, ...PLACE_OPTS.filter((p) => p.k !== s.place)]} label="Alternative place" onChange={(v) => up({ alt: v })} /></label>}
        {!first && !last && s.alt && <label className="field">{lbl('Alternative building')}<Select<BuildingKey> className="sel-lg" chevClass="lg" value={s.altBld} options={BUILDINGS} label="Alternative building" onChange={(v) => up({ altBld: v })} /></label>}
      </div>
      {!first && !last && <button className="btn-ghost-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 8, alignItems: 'center' }} onClick={onRemove}><Icon name="trash-2" size={14} />Remove stop</button>}
    </div>
  );
}

function Strip({ segs }: { segs: DaySeg[] }) {
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
      {segs.map((s, i) => <span key={i} title={`${hhmm(s.a)}–${hhmm(s.b)} · ${s.label || s.me} · ${s.dose} µg`} style={{ flex: s.b - s.a, background: `var(--me-${s.me})` }} />)}
    </div>
  );
}

export function DayPanel() {
  const { st, set, loadDay } = useSora();
  const sub = st.sub.day, DAY = st.day, F = activeField(st);
  const [open, setOpen] = useState<number | null>(null);
  const [sent, setSent] = useState(() => JSON.stringify(st.dayStops));
  const dirty = JSON.stringify(st.dayStops) !== sent, stops = st.dayStops, n = stops.length;
  const { bo, bn, mxb } = useMemo(() => {
    if (!DAY) return { bo: [], bn: [], mxb: 1 };
    const bo = dayBars(DAY.original, 7, 23), bn = dayBars(DAY.optimized, 7, 23);
    return { bo, bn, mxb: Math.max(...bo.map((b) => b.tot), ...bn.map((b) => b.tot)) };
  }, [DAY]);
  if (!DAY) return <p className="lede" aria-busy="true">{st.dayBusy ? 'Optimizing your day…' : 'Loading your day…'}</p>;
  const T = DAY.total;
  const cur = st.dayView === 'opt' ? bn : bo;
  const optimize = async () => { setSent(JSON.stringify(st.dayStops)); setOpen(null); await loadDay(); set((s) => ({ sub: { ...s.sub, day: 'result' } })); };
  const addStop = () => { set((s) => ({ dayStops: [...s.dayStops.slice(0, -1), { ...NEW_STOP }, s.dayStops[s.dayStops.length - 1]] })); setOpen(n - 1); };
  const removeStop = (i: number) => { set((s) => ({ dayStops: s.dayStops.filter((_, j) => j !== i) })); setOpen(null); };
  const placeName = (k: string) => PLACES.find((p) => p.k === k)?.name ?? '';
  const mono = { fontFamily: 'var(--font-mono)' };

  return (
    <div className="stack g32">
      {/* answer-first once optimized; while editing, the heading says what the button will do */}
      {!dirty && st.dayDone
        ? <PanelHeader title={T.p >= 0.7 ? `Your day: about ${T.red.median}% less exposure` : 'Your day is already close to its best'}
            sub={<><span className="tnum">{fmt(T.orig.median)} → {fmt(T.opt.median)} µg</span> <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({fmt(T.opt.p05)}–{fmt(T.opt.p95)})</span>, +{T.extra} min travel, {Math.round(T.p * 100)}% likely lower. {DAY.changes.length} change{DAY.changes.length === 1 ? '' : 's'} for {F ? istDay(new Date(planDay0(F)).toISOString()) : 'today'}.</>} />
        : <PanelHeader title={`Plan ${COUNT[n - 2] ?? n} stops together`}
            sub={<>Sora weighs the whole day at once: when you leave, which gym, how you get to dinner.</>} />}
      <SubTabs label="Day plan" items={st.dayDone ? [['schedule', 'Schedule'], ['result', 'Result'], ['changes', 'Changes'], ['timeline', 'Timeline']] : [['schedule', 'Schedule']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, day: k } }))} />

      {sub === 'schedule' && (
        <section aria-label="Schedule" className="sec">
          <span className="eyebrow">Schedule</span>
          <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {stops.map((s, i) => {
              const r = !dirty ? DAY.stops[i] : undefined, isOpen = open === i;
              const where = r ? (st.dayView === 'opt' ? r.chosen : r.place) : placeName(s.place);
              const when = r ? r.window : [s.after && `after ${s.after}`, s.before && `by ${s.before}`].filter(Boolean).join(' · ') || '—';
              return (
                <li key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <button className="row-btn" aria-expanded={isOpen} aria-controls={'stop-' + i} onClick={() => setOpen(isOpen ? null : i)}
                    style={{ width: '100%', display: 'grid', gridTemplateColumns: '96px 20px minmax(0,1fr) 16px', gap: 16, alignItems: 'start', padding: '18px 0', textAlign: 'left' }}>
                    <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)', paddingTop: 3 }}>{when}</span>
                    <span style={{ display: 'flex', paddingTop: 2, color: 'var(--text-secondary)' }}><Icon name={r?.icon ?? 'map-pin'} size={16} /></span>
                    <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--fs-h4)', letterSpacing: '-.01em' }}>{s.name || 'Stop'} <span style={{ color: 'var(--text-secondary)' }}>· {where}</span></span>
                      <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-tertiary)' }}>{r ? r.bld + (r.dur ? ' · ' + r.dur : '') : BUILDINGS.find((b) => b.k === s.bld)!.label + (s.dur ? ` · ${s.dur} min` : '')}</span>
                    </span>
                    <span style={{ display: 'flex', paddingTop: 3, color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}><Icon name="chevron-down" size={16} /></span>
                  </button>
                  {isOpen && <div id={'stop-' + i}><StopEditor i={i} onRemove={() => removeStop(i)} /></div>}
                </li>
              );
            })}
          </ol>
          {dirty && <p className="lede" role="status" style={{ fontSize: 'var(--fs-ui)' }}>Schedule changed. Optimize to update the result.</p>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={addStop} disabled={n >= 10}><Icon name="plus" size={14} />Add a stop</button>
            <button className="btn-primary" onClick={optimize} aria-busy={st.dayBusy}>
              {st.dayBusy && <span className="spin" />}{st.dayBusy ? 'Optimizing…' : dirty ? 'Optimize my day' : 'Re-optimize my day'}
            </button>
          </div>
        </section>
      )}

      {st.dayDone && sub === 'result' && (
        <section aria-label="Result" className="sec">
          <span className="eyebrow">Result · 07:00–23:00</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="stack g8">
              <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>Original day</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="tnum" style={{ fontSize: 'var(--fs-num-2xl)', fontWeight: 300, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--text-secondary)' }}>{fmt(T.orig.median)}</span><span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-tertiary)' }}>µg</span></span>
              <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>({fmt(T.orig.p05)}–{fmt(T.orig.p95)})</span>
            </div>
            <div className="stack g8" style={{ paddingLeft: 24, borderLeft: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-primary)', fontWeight: 500 }}>Optimized day</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="tnum" style={{ fontSize: 'var(--fs-num-2xl)', fontWeight: 300, lineHeight: 1, letterSpacing: '-.03em' }}>{fmt(T.opt.median)}</span><span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>µg</span></span>
              <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>({fmt(T.opt.p05)}–{fmt(T.opt.p95)})</span>
            </div>
          </div>
          <Dl gap="14px 24px" rows={[
            ['Benefit', `−${T.red.median}% (−${T.red.p05} to −${T.red.p95})`, mono],
            ['Cost', `+${T.extra} min travel`, mono],
            ['Confidence', `${Math.round(T.p * 100)}% chance it's lower`],
          ]} />
        </section>
      )}

      {st.dayDone && sub === 'changes' && (
        <section aria-label="Changes" className="sec">
          <span className="eyebrow">What changes</span>
          <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 28 }}>
            {DAY.changes.map((c) => (
              <li key={c.title} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto', gap: 14, alignItems: 'start' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', paddingTop: 3 }}><Icon name={c.icon} size={16} /></span>
                <span className="stack g6"><span style={{ fontSize: 'var(--fs-lead)', letterSpacing: '-.01em' }}>{c.title}</span><span style={{ fontSize: 'var(--fs-ui)', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{c.detail}</span></span>
                <span className="mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--success)', paddingTop: 3 }}>{c.delta}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {st.dayDone && sub === 'timeline' && (
        <section aria-label="Exposure timeline" className="sec">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span className="eyebrow">Exposure timeline</span>
            <div role="radiogroup" aria-label="Timeline view" className="seg-group">
              {([['opt', 'Optimized'], ['orig', 'Original']] as const).map(([k, l]) => (
                <button key={k} role="radio" aria-checked={st.dayView === k} className="subtab sm" onClick={() => set({ dayView: k })}>{l}</button>
              ))}
            </div>
          </div>
          <div role="img" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, borderBottom: '1px solid var(--border-default)', marginTop: 8 }}
            aria-label={`Hourly dose 07:00–23:00 stacked by microenvironment. Original day ${T.orig.median} µg (${T.orig.p05}–${T.orig.p95}); optimized ${T.opt.median} µg (${T.opt.p05}–${T.opt.p95}).${DAY.changes.length ? ' Main change: ' + DAY.changes[0].title + '.' : ''}`}>
            {/* bars fill 92% of the chart; the comparison tick (original day) only exists in the optimized view */}
            {cur.map((b, i) => (
              <div key={b.h} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 1, height: '100%', position: 'relative' }}>
                {b.parts.map((p) => <span key={p.me} style={{ height: ((p.v / mxb) * 92).toFixed(2) + '%', background: p.c, borderRadius: 1, flex: 'none' }} />)}
                {st.dayView === 'opt' && bo[i].tot > b.tot && (
                  <span style={{ position: 'absolute', left: -1, right: -1, bottom: `calc(${((bo[i].tot / mxb) * 92).toFixed(2)}% + ${Math.max(0, bo[i].parts.length - 1)}px)`, borderTop: '1.5px dashed var(--text-secondary)' }} />
                )}
              </div>
            ))}
          </div>
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}><span>07:00</span><span>11:00</span><span>15:00</span><span>19:00</span><span>23:00</span></div>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr)', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>Original</span><Strip segs={DAY.original} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr)', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-primary)', fontWeight: 500 }}>Optimized</span><Strip segs={DAY.optimized} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '12px 20px', marginTop: 8 }}>
            {ME.map((m) => <span key={m.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}><span className="sw" style={{ background: `var(--me-${m.k})` }} />{m.label}</span>)}
          </div>
          {st.dayView === 'opt' && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>Dashed line: the original day's dose in hours where the plan lowers it.</span>}
        </section>
      )}
      <Disclaimer />
    </div>
  );
}
