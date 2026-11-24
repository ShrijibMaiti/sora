import { useEffect } from 'react';
import { sgn, segs } from '../../data/sora';
import { useSora } from '../../state/store';
import { Icon } from '../Icon';
import { Disclaimer, Meter, PanelHeader } from './shared';
import { modeLabel, placeName } from './TripPanel';

export function WhatIfPanel() {
  const { st, set, askWhatIf } = useSora();
  const t = st.trip;
  useEffect(() => { askWhatIf(); }, [t, st.fields.pm25, askWhatIf]); // answers follow the current trip
  return (
    <div className="stack g32">
      <PanelHeader title={`What if, for ${placeName(t.origin)} → ${placeName(t.dest)}`}>
        <p className="lede" style={{ fontSize: 'var(--fs-small)' }}>
          {modeLabel(t.mode)}, leaving {t.dep} IST.{' '}
          <button onClick={() => set({ tab: 'trip' })} style={{ border: 0, background: 'transparent', color: 'var(--text-primary)', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 'inherit', padding: 0, minHeight: 24 }}>Change trip</button>
        </p>
      </PanelHeader>
      <section aria-label="Questions" className="sec">
        <span className="eyebrow">Pick a question</span>
        <div role="group" aria-label="Questions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {st.whatif.map((w, i) => {
            const on = st.wi.includes(i);
            return (
              <button key={w.q} className="wi-chip" aria-pressed={on} onClick={() => set((s) => ({ wi: on ? s.wi.filter((x) => x !== i) : [i, ...s.wi] }))}>
                <Icon name={w.icon} size={15} />{w.q}
              </button>
            );
          })}
        </div>
      </section>
      {st.wi.filter((i) => i < st.whatif.length).map((i) => {
        const { q, a } = st.whatif[i];
        if (!a || a === 'error')
          return <p key={i} className="lede ruled" aria-busy={!a}>{q}: {a ? "couldn't get an answer — try again later." : 'working it out…'}</p>;
        /* "Likely helps" already requires P ≥ 0.7 and a range clear of zero (server, spec §31.7) */
        const w = { q, d: a.delta_pct, p: a.p_better, verdict: a.verdict, reason: a.reason }, rel = a.verdict === 'Likely helps', worse = w.d.median > 0;
        const pct = Math.round(w.p * 100) + '%';
        return (
          <article key={i} className="sec" aria-label={`${w.q}: ${w.verdict}, dose change ${sgn(w.d.median)}% (${w.d.p05} to ${w.d.p95}), ${pct} chance it helps`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="eyebrow">{w.q}</span>
              <span style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--fs-label)', fontWeight: 500,
                background: rel ? 'var(--success-soft)' : worse ? 'var(--danger-soft)' : 'var(--surface-overlay)', color: rel ? 'var(--success)' : worse ? 'var(--danger)' : 'var(--text-secondary)',
              }}>{w.verdict}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="big-num">{sgn(w.d.median)}%</span>
              <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>dose</span>
              <span className="mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-tertiary)' }}>({sgn(w.d.p05)} to {sgn(w.d.p95)})</span>
            </div>
            <div className="stack" style={{ gap: 10, maxWidth: 360 }}>
              <div style={{ position: 'relative', display: 'flex' }}>
                <Meter colors={segs(w.p, rel)} height={8} />
                <span style={{ position: 'absolute', left: '70%', top: -4, bottom: -4, borderLeft: '1px dashed var(--text-secondary)' }} />
              </div>
              <span style={{ fontSize: 'var(--fs-ui)', color: 'var(--text-secondary)' }}>{pct} chance it helps</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--fs-h4)', lineHeight: 1.6, textWrap: 'pretty' }}>{w.reason}</p>
          </article>
        );
      })}
      {st.wi.length === 0 && <p className="lede ruled">Pick a question to see how much it would change your dose.</p>}
      <Disclaimer />
    </div>
  );
}
