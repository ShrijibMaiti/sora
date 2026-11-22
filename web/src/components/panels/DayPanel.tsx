import { useMemo } from 'react';
import { DAY, ME, dayBars, hhmm, type DaySeg } from '../../data/sora';
import { useSora } from '../../state/store';
import { Icon } from '../Icon';
import { Disclaimer, Dl, PanelHeader, SubTabs } from './shared';

const fmt = (n: number) => n.toLocaleString('en-IN');

function Strip({ segs }: { segs: DaySeg[] }) {
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
      {segs.map((s, i) => <span key={i} title={`${hhmm(s.a)}–${hhmm(s.b)} · ${s.label || s.me} · ${s.dose} µg`} style={{ flex: s.b - s.a, background: `var(--me-${s.me})` }} />)}
    </div>
  );
}

export function DayPanel() {
  const { st, set } = useSora();
  const sub = st.sub.day;
  const T = DAY.total;
  const { bo, bn, mxb } = useMemo(() => {
    const bo = dayBars(DAY.original, 7, 23), bn = dayBars(DAY.optimized, 7, 23);
    return { bo, bn, mxb: Math.max(...bo.map((b) => b.tot), ...bn.map((b) => b.tot)) };
  }, []);
  const cur = st.dayView === 'opt' ? bn : bo;
  const optimize = () => { set({ dayBusy: true }); setTimeout(() => set((s) => ({ dayBusy: false, dayDone: true, sub: { ...s.sub, day: 'result' } })), 700); };
  const mono = { fontFamily: 'var(--font-mono)' };

  return (
    <div className="stack g32">
      <PanelHeader eyebrow="03 · Plan my day · Sat 21 Nov" title="Five stops. One day of air.">
        <p className="lede">Sora looks at the whole day together — when you leave, which gym, how you get to dinner — not one trip at a time.</p>
      </PanelHeader>
      <SubTabs items={[['schedule', 'Schedule'], ['result', 'Result'], ['changes', 'Changes'], ['timeline', 'Timeline']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, day: k } }))} />

      {sub === 'schedule' && (
        <section aria-label="Schedule" className="sec">
          <span className="eyebrow">Schedule</span>
          <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {DAY.stops.map((s, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '96px 20px minmax(0,1fr)', gap: 16, alignItems: 'start', padding: '18px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 3 }}>{s.window}</span>
                <span style={{ display: 'flex', paddingTop: 2, color: 'var(--text-secondary)' }}><Icon name={s.icon} size={16} /></span>
                <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 16, letterSpacing: '-.01em' }}>{s.name} <span style={{ color: 'var(--text-secondary)' }}>· {i === 2 && st.dayDone && st.dayView === 'opt' ? 'Gym B · Green Park' : s.place}</span></span>
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{s.bld}{s.dur ? ' · ' + s.dur : ''}</span>
                </span>
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn-outline"><Icon name="plus" size={14} />Add a stop</button>
            <button className="btn-primary" onClick={optimize}>
              {st.dayBusy && <span className="spin" />}{st.dayBusy ? 'Optimizing…' : st.dayDone ? 'Re-optimize my day' : 'Optimize my day'}
            </button>
          </div>
        </section>
      )}

      {st.dayDone && sub === 'result' && (
        <section aria-label="Result" className="sec">
          <span className="eyebrow">Result · 07:00–23:00</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="stack g8">
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Original day</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="tnum" style={{ fontSize: 44, fontWeight: 300, lineHeight: 1, letterSpacing: '-.03em', color: 'var(--text-secondary)' }}>{fmt(T.orig.median)}</span><span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>µg</span></span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>({fmt(T.orig.p05)}–{fmt(T.orig.p95)})</span>
            </div>
            <div className="stack g8" style={{ paddingLeft: 24, borderLeft: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: 13, color: 'var(--brand)' }}>Optimized day</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="tnum" style={{ fontSize: 44, fontWeight: 300, lineHeight: 1, letterSpacing: '-.03em' }}>{fmt(T.opt.median)}</span><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>µg</span></span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>({fmt(T.opt.p05)}–{fmt(T.opt.p95)})</span>
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
                <span style={{ color: 'var(--brand)', display: 'flex', paddingTop: 3 }}><Icon name={c.icon} size={16} /></span>
                <span className="stack g6"><span style={{ fontSize: 17, letterSpacing: '-.01em' }}>{c.title}</span><span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{c.detail}</span></span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--success)', paddingTop: 3 }}>{c.delta}</span>
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
            aria-label={`Hourly dose 07:00–23:00 stacked by microenvironment. Original day ${T.orig.median} µg (${T.orig.p05}–${T.orig.p95}); optimized ${T.opt.median} µg (${T.opt.p05}–${T.opt.p95}), mostly lower during the gym session and the trip to Khan Market.`}>
            {cur.map((b, i) => (
              <div key={b.h} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 1, height: '100%', position: 'relative' }}>
                {b.parts.map((p) => <span key={p.me} style={{ height: ((p.v / mxb) * 106).toFixed(1) + 'px', background: p.c, borderRadius: 1, flex: 'none' }} />)}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: (st.dayView === 'opt' ? (bo[i].tot / mxb) * 106 : -10).toFixed(1) + 'px', borderTop: '1px dashed var(--text-tertiary)' }} />
              </div>
            ))}
          </div>
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}><span>07:00</span><span>11:00</span><span>15:00</span><span>19:00</span><span>23:00</span></div>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr)', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Original</span><Strip segs={DAY.original} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0,1fr)', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--brand)' }}>Optimized</span><Strip segs={DAY.optimized} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '12px 20px', marginTop: 8 }}>
            {ME.map((m) => <span key={m.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}><span className="sw" style={{ background: `var(--me-${m.k})` }} />{m.label}</span>)}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Dashed line: the original day's hourly dose, for comparison.</span>
        </section>
      )}
      <Disclaimer />
    </div>
  );
}
