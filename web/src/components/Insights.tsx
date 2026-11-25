import { useState } from 'react';
import { ME, MODES, recOf, segs } from '../data/sora';
import { readDays, useSora } from '../state/store';
import type { Layout } from '../lib/layout';
import { eventWhen } from '../lib/field';
import { istDay, istHHMM } from '../lib/time';
import { Icon } from './Icon';
import { placeName } from './panels/TripPanel';
import { Meter } from './panels/shared';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const dayLabel = (date: string) => istDay(date + 'T12:00:00+05:30');
const HOUR_MS = 3600e3;

/* Insights are computed on this device from the days you planned in Sora (spec §27, §40: there is no /api/insights and
   nothing here leaves the device), plus suggestions from the live plan, day and alerts. Nothing is sample data. */
export function Insights({ L }: { L: Layout }) {
  const { st, set, remind } = useSora();
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (st.tab !== 'ins') return null;

  const days = readDays().filter((r) => r.city === st.city).slice(-7);
  const latest = days[days.length - 1];
  const n = days.length;
  const avg = n ? days.reduce((a, d) => a + d.orig.median, 0) / n : 0;
  const avgLo = n ? days.reduce((a, d) => a + d.orig.p05, 0) / n : 0, avgHi = n ? days.reduce((a, d) => a + d.orig.p95, 0) / n : 0;
  const optAvg = n ? days.reduce((a, d) => a + d.opt.median, 0) / n : 0;
  const wmx = Math.max(1, ...days.map((d) => d.orig.p95)) * 1.08, Y = (x: number) => 176 - (x / wmx) * 160;
  const VW = L.mob ? 400 : 700, slots = Math.max(n, 3), step = (VW - 60) / slots, bw = Math.min(44, step * 0.5);

  const tot = latest?.byMe ?? {}, sum = Object.values(tot).reduce((a, b) => a + (b ?? 0), 0);
  const me = ME.filter((m) => tot[m.k]).map((m) => ({ k: m.k, label: m.label, c: `var(--me-${m.k})`, f: tot[m.k]!, pct: Math.round((tot[m.k]! / sum) * 100) + '%' }));
  const legs = latest?.legs ?? [], legMax = Math.max(1, ...legs.map((t) => t.dose)), legSum = legs.reduce((a, t) => a + t.dose, 0);
  const modeIcon = (m: string) => MODES.find((x) => x.k === m)?.icon ?? 'route';

  /* suggestions from live results: the trip recommendation, the day plan's biggest change, forecast warnings */
  type Pro = { icon: string; ctx: string; title: string; body: string; p: number; rel: boolean; cta: string; act: () => void };
  const pro: Pro[] = [];
  const res = st.res && !st.res.error ? st.res : null, recId = res ? recOf(res) : null, rec = res?.options.find((o) => o.id === recId);
  if (res && rec && res.reliable && rec.departure_iso) {
    const at = new Date(Date.parse(rec.departure_iso) - 10 * 60e3).toISOString();
    pro.push({
      icon: 'route', ctx: `${placeName(st.trip.origin)} → ${placeName(st.trip.dest)} · planned ${st.trip.dep}`,
      title: `Leave at ${rec.departure} by the ${rec.label.toLowerCase()} route`,
      body: `About ${rec.reduction_pct.median}% lower dose (${rec.reduction_pct.p05} to ${rec.reduction_pct.p95}%), ${rec.extra_min >= 0 ? '+' : '−'}${Math.abs(rec.extra_min)} min.`,
      p: rec.p_better ?? 0, rel: true, cta: `Remind me at ${istHHMM(at)}`,
      act: () => remind({ at, title: `Leave at ${rec.departure}`, body: `${placeName(st.trip.origin)} → ${placeName(st.trip.dest)}: about ${rec.reduction_pct.median}% lower estimated dose.` }),
    });
  }
  const change = st.day?.changes[0];
  if (st.day && change && st.day.total.p >= 0.7) {
    pro.push({
      icon: change.icon, ctx: 'Your planned day', title: change.title, body: `${change.detail} ${change.delta} over the day.`,
      p: st.day.total.p, rel: true, cta: 'Plan my day', act: () => set({ tab: 'day', panelOpen: true }),
    });
  }
  const F = st.fields.pm25 && st.fields.pm25 !== 'unavailable' ? st.fields.pm25 : null;
  st.events.filter((e) => e.severity === 'warning').slice(0, 2).forEach((e) => {
    const at = new Date(Math.max(Date.now() + 60e3, Date.parse(e.start) - 2 * HOUR_MS)).toISOString();
    pro.push({
      icon: e.kind === 'fire' ? 'flame' : e.kind === 'rain' ? 'cloud-rain' : 'cloud-fog', ctx: F ? eventWhen(e.start, e.end, F.times[0]) : '',
      title: e.title, body: e.body, p: e.probability, rel: e.probability >= 0.7, cta: `Remind me at ${istHHMM(at)}`,
      act: () => remind({ at, title: e.title, body: 'Check the latest forecast in Sora before you head out.' }),
    });
  });
  const shown = pro.filter((p) => !dismissed.includes(p.title));
  const card = { padding: 32, display: 'flex', flexDirection: 'column', gap: 24 } as const;
  const range = n ? (n === 1 ? dayLabel(days[0].date) : `${dayLabel(days[0].date)} – ${dayLabel(latest.date)}`) : '';

  return (
    <section aria-label="Insights" className="noscroll" tabIndex={0} style={{ position: 'absolute', inset: L.insInset, borderRadius: L.insRadius, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-overlay)', zIndex: 1100, background: 'var(--bg-canvas)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: L.insPad, display: 'flex', flexDirection: 'column', gap: 56 }}>
        {/* answer-first, like the panels: the history's result is the heading */}
        <header className="stack g12" style={{ maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-h1)', fontWeight: 400, letterSpacing: 'var(--tr-h1)', lineHeight: 1.1, textWrap: 'balance' }}>
            {n ? `Your planned days: about ${fmt(avg)} µg a day` : 'No history on this device yet'}
          </h1>
          <p className="ph-sub" style={{ color: 'var(--text-secondary)' }}>
            {n
              ? <><span className="mono" style={{ color: 'var(--text-tertiary)' }}>({fmt(avgLo)}–{fmt(avgHi)})</span> estimated PM2.5 inhaled, 07:00–23:00, {range}{n > 1 ? `, ${n} days` : ''}. Following Sora's plans would make it about {fmt(optAvg)} µg. Kept on this device only.</>
              : <>Each day you plan in Sora is kept here, on this device only, so you can see your exposure over time. Sora doesn't track where you go.</>}
          </p>
          {!n && <button className="btn-primary" style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px' }} onClick={() => set({ tab: 'day', panelOpen: true })}>Plan my day</button>}
        </header>
        {n > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 16 }}>
            <section aria-label="Daily dose" className="card" style={{ ...card, gridColumn: L.insSpan }}>
              <div className="stack" style={{ gap: 4 }}><span className="card-title">Daily dose, as planned</span><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Median with 90% range · dashed line is the average</span></div>
              <svg viewBox={`0 0 ${VW} 200`} role="img" style={{ width: '100%', height: 'auto' }}
                aria-label={`Daily dose of planned days: ${days.map((d) => `${dayLabel(d.date)} ${fmt(d.orig.median)} µg (${fmt(d.orig.p05)}–${fmt(d.orig.p95)})`).join(', ')}. Average ${fmt(avg)} µg.`}>
                <line x1="40" x2={VW - 10} y1={Y(avg).toFixed(1)} y2={Y(avg).toFixed(1)} stroke="var(--text-tertiary)" strokeDasharray="3 4" />
                {days.map((d, i) => {
                  const x = 50 + i * step + (step - bw) / 2, cx = x + bw / 2, yhi = Y(d.orig.p95), ylo = Y(d.orig.p05);
                  return (
                    <g key={d.date}>
                      <rect x={x} y={Y(d.orig.median)} width={bw} height={176 - Y(d.orig.median)} rx="4" fill={i === n - 1 ? 'var(--text-secondary)' : 'var(--surface-overlay)'} />
                      <line x1={cx} x2={cx} y1={yhi} y2={ylo} stroke="var(--text-primary)" strokeWidth="1.5" />
                      <line x1={cx - 6} x2={cx + 6} y1={yhi} y2={yhi} stroke="var(--text-primary)" strokeWidth="1.5" />
                      <line x1={cx - 6} x2={cx + 6} y1={ylo} y2={ylo} stroke="var(--text-primary)" strokeWidth="1.5" />
                      <text x={cx} y="194" textAnchor="middle" fontSize={L.mob ? 13 : 12} fill="var(--text-tertiary)">{dayLabel(d.date).slice(0, 3)}</text>
                      <text x={cx} y={yhi - 6} textAnchor="middle" fontSize={L.mob ? 13 : 11} fill="var(--text-secondary)" style={{ fontFamily: 'var(--font-mono)' }}>{fmt(d.orig.median)}</text>
                    </g>
                  );
                })}
              </svg>
            </section>
            {legs.length > 0 && (
              <section aria-label="By trip" className="card" style={card}>
                <span className="card-title">{dayLabel(latest.date)} by trip</span>
                {legs.map((t, i) => (
                  <div key={i} className="stack g6">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)' }}>
                      <Icon name={modeIcon(t.mode)} size={14} /><span style={{ flex: 1 }}>{t.from} → {t.to}</span>
                      <span className="mono" style={{ fontSize: 'var(--fs-label)' }}>{fmt(t.dose)} µg</span>
                    </div>
                    <div aria-hidden="true" style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface-raised)' }}>
                      <span style={{ position: 'absolute', left: 0, width: `${((t.dose / legMax) * 100).toFixed(1)}%`, top: 1, bottom: 1, borderRadius: 3, background: 'var(--me-vehicle)' }} />
                    </div>
                  </div>
                ))}
                <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Trips are about {Math.round((legSum / Math.max(1, sum)) * 100)}% of that day's dose.</span>
              </section>
            )}
            {me.length > 0 && (
              <section aria-label="By microenvironment" className="card" style={card}>
                <span className="card-title">{dayLabel(latest.date)} by microenvironment</span>
                <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 }}>{me.map((m) => <span key={m.k} style={{ flex: m.f, background: m.c }} />)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {me.map((m) => <span key={m.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)' }}><span className="sw" style={{ background: m.c }} /><span style={{ flex: 1 }}>{m.label}</span><span className="mono" style={{ color: 'var(--text-secondary)' }}>{m.pct}</span></span>)}
                </div>
              </section>
            )}
          </div>
        )}
        <section aria-label="Suggestions" className="stack g12">
          <span className="card-title">Suggestions</span>
          {shown.length === 0 && <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>Nothing to suggest right now: no option beats your plans with confidence, and no alerts are out.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12 }}>
            {shown.map((p, i) => (
              <article key={p.title} className="card stack g12" style={{ padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}><Icon name={p.icon} size={14} />{p.ctx}</div>
                <span style={{ fontSize: 'var(--fs-body)', fontWeight: 500 }}>{p.title}</span>
                <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>{p.body}</span>
                <Meter colors={segs(p.p, p.rel)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* one primary per view: only the top suggestion gets the blue button */}
                  <button className={i === 0 ? 'btn-primary' : 'btn-outline'} style={{ height: 44, padding: '0 16px', fontSize: 'var(--fs-small)' }} onClick={p.act}>{p.cta}</button>
                  <button className="btn-text" style={{ height: 44, padding: '0 12px', fontSize: 'var(--fs-small)' }} onClick={() => setDismissed((d) => [...d, p.title])}>Dismiss</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <p style={{ margin: '0 0 24px', fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>Estimates, not measurements. Lower exposure doesn't mean safe.</p>
      </div>
    </section>
  );
}
