import { useState } from 'react';
import { DAY, ME, TRIPS, WEEK, segs, toMin } from '../data/sora';
import { useSora } from '../state/store';
import type { Layout } from '../lib/layout';
import { istDay, istDayStart } from '../lib/time';
import { Icon } from './Icon';
import { Meter } from './panels/shared';

const fmt = (n: number) => n.toLocaleString('en-IN');
const DAY_MS = 86400e3;

export function Insights({ L }: { L: Layout }) {
  const { st, set, remind } = useSora();
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (st.tab !== 'ins') return null;
  /* dates relative to today (IST); the history itself is sample data until on-device tracking exists */
  const today = istDayStart(new Date().toISOString()), dayIso = (d: number, hhmm = '00:00') => new Date(today + d * DAY_MS + toMin(hhmm) * 60e3).toISOString();
  const week = WEEK.map((d, i) => ({ ...d, d: istDay(dayIso(i - 6)).slice(0, 3) }));
  const dayAfter = istDay(dayIso(2)).slice(0, 3);
  const wmx = Math.max(...week.map((d) => d.hi)) * 1.08, avg = Math.round(week.reduce((a, d) => a + d.m, 0) / 7), Y = (x: number) => 176 - (x / wmx) * 160;
  const avgLo = Math.round(week.reduce((a, d) => a + d.lo, 0) / 7), avgHi = Math.round(week.reduce((a, d) => a + d.hi, 0) / 7);
  /* narrower viewBox on phones so chart text stays ~11px instead of shrinking with the svg */
  const VW = L.mob ? 400 : 700, step = (VW - 60) / 7, bw = Math.min(44, step * 0.5);
  const tripMax = Math.max(...TRIPS.map((t) => t.dose * 1.18));
  const tot: Partial<Record<string, number>> = {};
  DAY.original.forEach((s) => (tot[s.me] = (tot[s.me] || 0) + s.dose));
  const sum = Object.values(tot).reduce((a, b) => a! + b!, 0)!;
  const me = ME.filter((m) => tot[m.k]).map((m) => ({ k: m.k, label: m.label, c: `var(--me-${m.k})`, f: tot[m.k]!, pct: Math.round((tot[m.k]! / sum) * 100) + '%' }));
  const pro = [
    {
      icon: 'sunrise', ctx: 'Tomorrow · your usual 08:20 trip', title: 'Leave for college at 08:05', body: 'About 14% lower dose (−6 to −21). The morning build-up near Lajpat Nagar starts around 08:30.', segs: segs(0.88, true), cta: 'Remind me at 07:50',
      act: () => remind({ at: dayIso(1, '07:50'), title: 'Leave for college at 08:05', body: 'About 14% lower estimated dose than your usual 08:20 start.' }),
    },
    { icon: 'dumbbell', ctx: 'Tomorrow · gym 17:00', title: 'Try Gym B in Green Park', body: 'Filtered AC; about 9% lower day dose (−3 to −16). Same travel time.', segs: segs(0.81, true), cta: 'Plan my day', act: () => set({ tab: 'day', panelOpen: true }) },
    {
      icon: 'flame', ctx: `${dayAfter} · evening`, title: 'Smoke may arrive after 18:00', body: "Upwind fires and light NW winds. Whether it reaches south Delhi is uncertain — we'll update by tomorrow night.", segs: segs(0.55, false), cta: 'Remind me at 16:00',
      act: () => remind({ at: dayIso(2, '16:00'), title: 'Smoke outlook for this evening', body: 'Check the latest forecast in Sora before you head out.' }),
    },
  ].filter((p) => !dismissed.includes(p.title));
  const card = { padding: 32, display: 'flex', flexDirection: 'column', gap: 24 } as const;

  return (
    <section aria-label="Insights" className="noscroll" style={{ position: 'absolute', inset: L.insInset, borderRadius: L.insRadius, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-overlay)', zIndex: 1100, background: 'var(--bg-canvas)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: L.insPad, display: 'flex', flexDirection: 'column', gap: 56 }}>
        {/* answer-first, like the panels: the week's result is the heading */}
        <header className="stack g12" style={{ maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-h1)', fontWeight: 400, letterSpacing: 'var(--tr-h1)', lineHeight: 1.1, textWrap: 'balance' }}>This week: about {fmt(avg)} µg a day, 12% above last week</h1>
          <p className="ph-sub" style={{ color: 'var(--text-secondary)' }}>
            <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({fmt(avgLo)}–{fmt(avgHi)})</span> estimated PM2.5 inhaled, 07:00–23:00, {istDay(dayIso(-6))} – {istDay(dayIso(0))}. Sample history: Sora doesn't track your day yet.
          </p>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 16 }}>
          <section aria-label="Weekly trend" className="card" style={{ ...card, gridColumn: L.insSpan }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div className="stack" style={{ gap: 4 }}><span className="card-title">Daily dose</span><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Median with 90% range · dashed line is the week's average</span></div>
            </div>
            <svg viewBox={`0 0 ${VW} 200`} role="img" style={{ width: '100%', height: 'auto' }}
              aria-label={`Daily dose, last 7 days: ${week.map((d) => `${d.d} ${d.m} µg (${d.lo}–${d.hi})`).join(', ')}. Average ${avg} µg.`}>
              <line x1="40" x2={VW - 10} y1={Y(avg).toFixed(1)} y2={Y(avg).toFixed(1)} stroke="var(--text-tertiary)" strokeDasharray="3 4" />
              {week.map((d, i) => {
                const x = 50 + i * step + (step - bw) / 2, cx = x + bw / 2, yhi = Y(d.hi), ylo = Y(d.lo);
                return (
                  <g key={d.d}>
                    <rect x={x} y={Y(d.m)} width={bw} height={176 - Y(d.m)} rx="4" fill={i === 6 ? 'var(--text-secondary)' : 'var(--surface-overlay)'} />
                    <line x1={cx} x2={cx} y1={yhi} y2={ylo} stroke="var(--text-primary)" strokeWidth="1.5" />
                    <line x1={cx - 6} x2={cx + 6} y1={yhi} y2={yhi} stroke="var(--text-primary)" strokeWidth="1.5" />
                    <line x1={cx - 6} x2={cx + 6} y1={ylo} y2={ylo} stroke="var(--text-primary)" strokeWidth="1.5" />
                    <text x={cx} y="194" textAnchor="middle" fontSize={L.mob ? 13 : 12} fill="var(--text-tertiary)">{d.d}</text>
                    <text x={cx} y={yhi - 6} textAnchor="middle" fontSize={L.mob ? 13 : 11} fill="var(--text-secondary)" style={{ fontFamily: 'var(--font-mono)' }}>{fmt(d.m)}</text>
                  </g>
                );
              })}
            </svg>
          </section>
          <section aria-label="By trip" className="card" style={card}>
            <span className="card-title">Today by trip</span>
            {TRIPS.map((t) => {
              const lo = Math.round(t.dose * 0.85), hi = Math.round(t.dose * 1.18), pct = (n: number) => `${((n / tripMax) * 100).toFixed(1)}%`;
              return (
                <div key={t.from} className="stack g6">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)' }}>
                    <Icon name={t.mode} size={14} /><span style={{ flex: 1 }}>{t.from} → {t.to}</span>
                    <span className="mono" style={{ fontSize: 'var(--fs-label)' }}>{t.dose} µg <span style={{ color: 'var(--text-tertiary)' }}>({lo}–{hi})</span></span>
                  </div>
                  {/* interval bar: band = 90% range, solid = median, scaled to the largest trip */}
                  <div aria-hidden="true" style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface-raised)' }}>
                    <span style={{ position: 'absolute', left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, top: 0, bottom: 0, borderRadius: 3, background: 'var(--surface-active)' }} />
                    <span style={{ position: 'absolute', left: 0, width: pct(t.dose), top: 1, bottom: 1, borderRadius: 3, background: 'var(--me-vehicle)' }} />
                  </div>
                </div>
              );
            })}
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Trips are about {Math.round((TRIPS.reduce((a, t) => a + t.dose, 0) / sum) * 100)}% of today's dose.</span>
          </section>
          <section aria-label="By microenvironment" className="card" style={card}>
            <span className="card-title">Today by microenvironment</span>
            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 }}>{me.map((m) => <span key={m.k} style={{ flex: m.f, background: m.c }} />)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              {me.map((m) => <span key={m.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)' }}><span className="sw" style={{ background: m.c }} /><span style={{ flex: 1 }}>{m.label}</span><span className="mono" style={{ color: 'var(--text-secondary)' }}>{m.pct}</span></span>)}
            </div>
          </section>
          <section aria-label="Tomorrow" className="stack g12" style={{ gridColumn: L.insSpan }}>
            <span className="card-title">For tomorrow's routine</span>
            {pro.length === 0 && <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>Nothing else to suggest for tomorrow.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12 }}>
              {pro.map((p, i) => (
                <article key={p.title} className="card stack g12" style={{ padding: 'var(--space-6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}><Icon name={p.icon} size={14} />{p.ctx}</div>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 500 }}>{p.title}</span>
                  <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>{p.body}</span>
                  <Meter colors={p.segs} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* one primary per view: only the top suggestion gets the blue button */}
                    <button className={i === 0 ? 'btn-primary' : 'btn-outline'} style={{ height: 44, padding: '0 16px', fontSize: 'var(--fs-small)' }} onClick={p.act}>{p.cta}</button>
                    <button className="btn-text" style={{ height: 44, padding: '0 12px', fontSize: 'var(--fs-small)' }} onClick={() => setDismissed((d) => [...d, p.title])}>Dismiss</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <p style={{ margin: '0 0 24px', fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>Estimates, not measurements. Lower exposure doesn't mean safe.</p>
      </div>
    </section>
  );
}
