import { AQI, POLL, cat, inBbox } from '../../data/sora';
import { activeField, cityOf, useSora } from '../../state/store';
import { dayTicks, useSeries } from '../MapChrome';
import { fmtCoords, pointText } from '../MapView';
import { eventWhen, fieldMean, fieldTime, sampleField } from '../../lib/field';
import { istHHMM } from '../../lib/time';
import { Icon } from '../Icon';
import { Disclaimer, Dl, PanelHeader, SubTabs } from './shared';

const SEV = { warning: 'var(--warning)', info: 'var(--info)', success: 'var(--success)' } as const;
const ICON: Record<string, string> = { fire: 'flame', inversion: 'cloud-fog', dust: 'wind', festival: 'sparkles', rain: 'cloud-rain', traffic: 'car', industrial: 'triangle-alert' };

export function LivePanel() {
  const { st, set } = useSora();
  const F = activeField(st);
  const { ser, mx, N, path, band } = useSeries();
  if (!F) return null;
  const P = POLL.find((p) => p.k === F.pollutant)!;
  const tl = fieldTime(F, st.t);
  const dp = F.pollutant === 'co' ? 1 : 0;
  const cur = ser[Math.min(st.t, ser.length - 1)];
  const now = { val: cur.median.toFixed(dp), lo: cur.p05.toFixed(dp), hi: cur.p95.toFixed(dp) };
  const peakT = ser.reduce((b, s, i) => (i < 24 && s.median > ser[b].median ? i : b), 0);
  const sub = st.sub.live;
  const m = F.meta, degraded = st.demo === 'degraded', ratio = m.n_reporting / Math.max(1, m.n_stations);
  const health: [string, string, string][] = [
    ['Stations', degraded ? `0 of ${m.n_stations} reporting` : `${m.n_reporting} of ${m.n_stations} reporting`, degraded || ratio < 0.5 ? 'var(--danger)' : ratio < 0.9 ? 'var(--warning)' : 'var(--success)'],
    ['Background forecast', m.background, 'var(--success)'],
    ['Last analysis', istHHMM(m.analysis_time) + ' IST', 'var(--success)'],
    ['Data status', m.degradation, degraded ? 'var(--warning)' : 'var(--success)'],
  ];

  return (
    <div className="stack g32">
      <PanelHeader eyebrow={`01 · Live map · ${tl.day} · ${tl.time} IST`} title="The city's air, hour by hour.">
        <p className="lede">Expected to peak around {fieldTime(F, peakT).time} in the next 24 hours.</p>
      </PanelHeader>
      <SubTabs items={[['overview', 'Overview'], ['poll', 'Pollutants'], ['events', 'Events'], ['data', 'Data']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, live: k } }))} />

      {sub === 'overview' && (
        <>
          <section aria-label="City average" className="sec">
            <span className="eyebrow">City average · {P.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="big-num">{now.val}</span>
              <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>{P.unit}</span>
              <span className="mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-tertiary)' }}>({now.lo}–{now.hi})</span>
            </div>
            <figure style={{ margin: '8px 0 0', position: 'relative' }}
              aria-label={`City average ${P.label} over 72 hours, peaking each evening between 19:00 and 22:00. At ${tl.short}: ${now.val} ${P.unit}, range ${now.lo}–${now.hi}.`}>
              <svg viewBox="0 0 360 120" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 140, display: 'block' }}>
                <path d={band(360, 120)} fill="var(--brand-soft)" />
                <path d={path(360, 120, (s) => s.median)} fill="none" stroke="var(--brand)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                <rect x={((st.t / N) * 360 - 4).toFixed(1)} y={(120 - (cur.median / mx) * 120).toFixed(1)} width={8} height={((cur.median / mx) * 120).toFixed(1)} fill="var(--brand)" opacity={0.22} />
              </svg>
              <span style={{ position: 'absolute', left: ((st.t / N) * 100).toFixed(2) + '%', top: ((1 - cur.median / mx) * 100).toFixed(2) + '%', width: 10, height: 10, borderRadius: '50%', background: 'var(--bg-canvas)', border: '2px solid var(--text-primary)', transform: 'translate(-50%,-50%)' }} />
            </figure>
            <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>{dayTicks(F).map((d) => <span key={d}>{d}</span>)}</div>
          </section>
          <SelectedPoint />
        </>
      )}

      {sub === 'poll' && (
        <section aria-label="Pollutants" className="sec">
          <span className="eyebrow">Pollutants · city average</span>
          <div className="stack">
            {POLL.map((p) => {
              const f = st.fields[p.k], on = st.poll === p.k;
              const ok = f && f !== 'unavailable', mv = ok ? fieldMean(f, st.t).median : 0, c = AQI[cat(mv, p.k)];
              return (
                <button key={p.k} className="row-btn" aria-pressed={on} disabled={!ok} onClick={() => set({ poll: p.k })}
                  style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto', gap: 16, alignItems: 'center', minHeight: 52, padding: 0, borderBottom: '1px solid var(--border-subtle)', color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  <span style={{ fontSize: 'var(--fs-body)' }}>{p.label}</span>
                  <span className="mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>{ok ? (p.k === 'co' ? mv.toFixed(1) : Math.round(mv)) + ' ' + p.unit : f === 'unavailable' ? 'Not forecast yet' : 'Loading…'}</span>
                  {ok ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}><span className="sw" style={{ background: c.color }} />{c.name}</span> : <span />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {sub === 'events' && (
        <section aria-label="Events" className="sec">
          <span className="eyebrow">Events affecting the forecast</span>
          <ul className="stack g24" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {st.events.map((e) => (
              <li key={e.kind + e.start} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 14 }}>
                <span style={{ color: SEV[e.severity], display: 'flex', paddingTop: 3 }}><Icon name={ICON[e.kind] || 'info'} size={16} /></span>
                <div className="stack g6">
                  <span style={{ fontSize: 'var(--fs-h4)', letterSpacing: '-.01em' }}>{e.title}</span>
                  <span style={{ fontSize: 'var(--fs-ui)', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{e.body}</span>
                  <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>{eventWhen(e.start, e.end, F.times[0])} · {Math.round(e.probability * 100)}% likely</span>
                </div>
              </li>
            ))}
          </ul>
          {st.events.length === 0 && <p className="lede">No unusual events expected in the forecast window.</p>}
        </section>
      )}

      {sub === 'data' && (
        <section aria-label="Data health" className="sec">
          <span className="eyebrow">Data</span>
          <dl className="dl" style={{ gap: '14px 24px' }}>
            {health.map(([l, v, dot]) => (
              <div key={l} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-secondary)' }}>{l}</dt>
                <dd className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Disclaimer />
    </div>
  );
}

function SelectedPoint() {
  const { st, set } = useSora();
  if (!st.pt)
    return (
      <p className="lede ruled" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="mouse-pointer-click" size={16} />Click anywhere on the map for a point estimate.
      </p>
    );
  const city = cityOf(st.city), F = activeField(st);
  if (!F) return null;
  const inside = city.built && inBbox(st.pt[0], st.pt[1], city.bbox);
  const P = POLL.find((p) => p.k === F.pollutant)!;
  const s = sampleField(F, st.t, st.pt[0], st.pt[1]), c = AQI[s.cat], v = pointText(st.t, s, F.pollutant === 'co');
  const [bs, bw, bn, be] = city.bbox;
  return (
    <section aria-label="Selected point" className="sec">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="eyebrow">Selected point</span>
        <button className="btn-ghost-sm" style={{ marginLeft: 'auto' }} onClick={() => set({ pt: null })}>Clear</button>
      </div>
      {inside ? (
        <Dl fontSize={15} rows={[
          ['Estimate', <><span className="mono">~{v.val} {P.unit}</span> <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({v.lo}–{v.hi})</span></>],
          ['Category', <><span style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />{c.name}</>, { display: 'flex', alignItems: 'center', gap: 10 }],
          ['Confidence', v.conf, { color: 'var(--text-secondary)' }],
          ['Location', fmtCoords(st.pt), { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }],
        ]} />
      ) : (
        <p className="lede"><span style={{ color: 'var(--text-primary)' }}>Outside the covered area.</span> Sora's {city.name} model covers {bs}–{bn}° N, {bw}–{be}° E. Pick a point inside the hex field.</p>
      )}
    </section>
  );
}
