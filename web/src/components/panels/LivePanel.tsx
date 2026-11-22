import { AQI, EVENTS, POLL, cat, cityMean, inBbox, sample, timeLabel } from '../../data/sora';
import { cityOf, useSora } from '../../state/store';
import { useSeries } from '../MapChrome';
import { fmtCoords, pointText } from '../MapView';
import { Icon } from '../Icon';
import { Disclaimer, Dl, PanelHeader, SubTabs } from './shared';

const SEV = { warning: 'var(--warning)', info: 'var(--info)', success: 'var(--success)' } as const;

export function LivePanel() {
  const { st, set } = useSora();
  const { ser, mx, path, band } = useSeries();
  const P = POLL.find((p) => p.k === st.poll)!;
  const tl = timeLabel(st.t);
  const dp = st.poll === 'co' ? 1 : 0;
  const cur = ser[st.t];
  const now = { val: cur.median.toFixed(dp), lo: cur.p05.toFixed(dp), hi: cur.p95.toFixed(dp) };
  const peakT = ser.reduce((b, s, i) => (i < 24 && s.median > ser[b].median ? i : b), 0);
  const sub = st.sub.live;
  const degraded = st.demo === 'degraded';
  const health: [string, string, string][] = degraded
    ? [['Stations', '0 of 15 since 11:00', 'var(--danger)'], ['CAMS forecast', '00 UTC run', 'var(--success)'], ['Last analysis', '14:00 IST', 'var(--success)'], ['Coverage', 'Sparse', 'var(--warning)']]
    : [['Stations', '14 of 15 reporting', 'var(--success)'], ['CAMS forecast', '00 UTC run', 'var(--success)'], ['Last analysis', '14:00 IST', 'var(--success)'], ['Coverage', 'Moderate', 'var(--warning)']];

  return (
    <div className="stack g32">
      <PanelHeader eyebrow={`01 · Live map · ${tl.day} · ${tl.time} IST`} title="The city's air, hour by hour.">
        <p className="lede">Expected to peak around {timeLabel(peakT).time} tonight as the evening build-up settles.</p>
      </PanelHeader>
      <SubTabs items={[['overview', 'Overview'], ['poll', 'Pollutants'], ['events', 'Events'], ['data', 'Data']]} value={sub} onPick={(k) => set((s) => ({ sub: { ...s.sub, live: k } }))} />

      {sub === 'overview' && (
        <>
          <section aria-label="City average" className="sec">
            <span className="eyebrow">City average · {P.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="big-num">{now.val}</span>
              <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{P.unit}</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>({now.lo}–{now.hi})</span>
            </div>
            <figure style={{ margin: '8px 0 0', position: 'relative' }}
              aria-label={`City average ${P.label} over 72 hours, peaking each evening between 19:00 and 22:00. At ${tl.short}: ${now.val} ${P.unit}, range ${now.lo}–${now.hi}.`}>
              <svg viewBox="0 0 360 120" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 140, display: 'block' }}>
                <path d={band(360, 120)} fill="var(--brand-soft)" />
                <path d={path(360, 120, (s) => s.median)} fill="none" stroke="var(--brand)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                <rect x={((st.t / 72) * 360 - 4).toFixed(1)} y={(120 - (cur.median / mx) * 120).toFixed(1)} width={8} height={((cur.median / mx) * 120).toFixed(1)} fill="var(--brand)" opacity={0.22} />
              </svg>
              <span style={{ position: 'absolute', left: ((st.t / 72) * 100).toFixed(2) + '%', top: ((1 - cur.median / mx) * 100).toFixed(2) + '%', width: 10, height: 10, borderRadius: '50%', background: 'var(--bg-canvas)', border: '2px solid var(--text-primary)', transform: 'translate(-50%,-50%)' }} />
            </figure>
            <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}><span>Sat 14:00</span><span>Sun</span><span>Mon</span><span>Tue</span></div>
          </section>
          <SelectedPoint />
        </>
      )}

      {sub === 'poll' && (
        <section aria-label="Pollutants" className="sec">
          <span className="eyebrow">Pollutants · city average</span>
          <div className="stack">
            {POLL.map((p) => {
              const m = cityMean(st.t, p.k).median, c = AQI[cat(m, p.k)], on = st.poll === p.k;
              return (
                <button key={p.k} className="row-btn" aria-pressed={on} onClick={() => set({ poll: p.k })}
                  style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto', gap: 16, alignItems: 'center', minHeight: 52, padding: 0, borderBottom: '1px solid var(--border-subtle)', color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  <span style={{ fontSize: 15 }}>{p.label}</span>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.k === 'co' ? m.toFixed(1) : Math.round(m)} {p.unit}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}><span className="sw" style={{ background: c.color }} />{c.name}</span>
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
            {EVENTS.filter((e) => e.k !== 'festival').slice(0, 3).map((e) => (
              <li key={e.k} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 14 }}>
                <span style={{ color: SEV[e.sev], display: 'flex', paddingTop: 3 }}><Icon name={e.icon} size={16} /></span>
                <div className="stack g6">
                  <span style={{ fontSize: 16, letterSpacing: '-.01em' }}>{e.title}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{e.body}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.when}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sub === 'data' && (
        <section aria-label="Data health" className="sec">
          <span className="eyebrow">Data</span>
          <dl className="dl" style={{ gap: '14px 24px' }}>
            {health.map(([l, v, dot]) => (
              <div key={l} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-secondary)' }}>{l}</dt>
                <dd className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />{v}</dd>
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
  const inside = cityOf(st.city).built && inBbox(st.pt[0], st.pt[1]);
  const P = POLL.find((p) => p.k === st.poll)!;
  const s = sample(st.t, st.pt[0], st.pt[1], st.poll), c = AQI[s.cat], v = pointText(st.t, s, st.poll === 'co');
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
          ['Location', fmtCoords(st.pt), { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }],
        ]} />
      ) : (
        <p className="lede"><span style={{ color: 'var(--text-primary)' }}>Outside the covered area.</span> Sora's Delhi model covers 28.40–28.88° N, 76.84–77.35° E. Pick a point inside the hex field.</p>
      )}
    </section>
  );
}
