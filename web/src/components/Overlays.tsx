import { useMemo } from 'react';
import { UNC } from '../data/sora';
import { cityOf, useSora } from '../state/store';
import { Icon } from './Icon';
import { ModePicker } from './panels/TripPanel';

/** Gapped hex grid in SVG space (skeleton + onboarding art). */
function svgHex<T extends object>(W: number, H: number, r: number, fn: (x: number, y: number, W: number, H: number) => T | null) {
  const out: (T & { pts: string })[] = [], dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = 0, y = 0; y < H + r; y += dy, row++)
    for (let x = row % 2 ? dx / 2 : 0; x < W + dx; x += dx) {
      const p: string[] = [];
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); p.push((x + r * 0.86 * Math.cos(a)).toFixed(1) + ',' + (y + r * 0.86 * Math.sin(a)).toFixed(1)); }
      const o = fn(x, y, W, H);
      if (o) out.push({ pts: p.join(' '), ...o });
    }
  return out;
}

const SKEL = svgHex(400, 300, 14, (x, y, W, H) => (Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) < 0.85 ? { d: (((x + y) % 900) / 600).toFixed(2) + 's' } : null));

export function BootOverlay() {
  const { st } = useSora();
  if (!st.booting) return null;
  return (
    <div aria-busy="true" style={{ position: 'absolute', inset: 0, zIndex: 850, background: 'var(--bg-canvas)', display: 'grid', placeItems: 'center' }}>
      <svg viewBox="0 0 400 300" aria-hidden="true" style={{ width: 'min(70%,520px)', height: 'auto' }}>
        {SKEL.map((h, i) => <polygon key={i} points={h.pts} fill="var(--hex-empty)" className="pulse" style={{ animationDelay: h.d }} />)}
      </svg>
      <span style={{ position: 'absolute', bottom: '40%', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--brand)', animation: 'sora-spin 800ms linear infinite' }} />
        Loading the 72-hour forecast for {cityOf(st.city).name}…
      </span>
    </div>
  );
}

export function FullState() {
  const { st, set, applyDemo } = useSora();
  const city = cityOf(st.city);
  const s = st.demo === 'offline' || st.offline
    ? { icon: 'cloud-off', ibg: 'var(--danger-soft)', ifg: 'var(--danger)', title: "Can't reach Sora", body: "We couldn't load the forecast. Rather than show you stale advice, the map is paused. Check your connection — we'll keep retrying.", pLabel: 'Retry now', primary: () => applyDemo('loading'), sLabel: st.demo === 'offline' ? 'Use last forecast (13:00)' : '', secondary: () => applyDemo('degraded'), foot: `Couldn't load /api/field?city=${st.city}` }
    : !city.built
      ? { icon: 'construction', ibg: 'var(--surface-raised)', ifg: 'var(--text-primary)', title: `${city.name} isn't built yet`, body: `${city.note} The model for ${city.name} is still being validated, so Sora won't give advice here yet.`, pLabel: 'Back to Delhi', primary: () => set({ city: 'delhi', demo: 'none' }), sLabel: "Notify me when it's live", secondary: () => {}, foot: 'Status: Preview · forecasts visible to the research team only' }
      : null;
  if (!s) return null;
  return (
    <div className="scrim" style={{ zIndex: 860 }}>
      <div role="alertdialog" aria-label={s.title} className="dialog" style={{ width: 'min(400px,100%)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: s.ibg, color: s.ifg, display: 'grid', placeItems: 'center' }}><Icon name={s.icon} size={20} /></span>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{s.title}</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', textWrap: 'pretty' }}>{s.body}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ padding: '0 16px', gap: 8 }} onClick={s.primary}>{s.pLabel}</button>
          {s.sLabel && <button className="btn-secondary" onClick={s.secondary}>{s.sLabel}</button>}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.foot}</span>
      </div>
    </div>
  );
}

const OB = [
  { icon: 'hexmark', title: "The map isn't your exposure", body: 'Two people in the same city can breathe very different amounts. Sora follows your day — when, where and how you move — and estimates your own dose.' },
  { icon: 'route', title: 'How do you usually get around?', body: 'Pick your usual mode. You can change it for any trip.', isModes: true },
  { icon: 'map-pin', title: 'Use your location to start trips?', body: 'Sora can fill in your start point. This is optional — you can always type a place.', isLoc: true },
];

export function Onboarding() {
  const { st, set, finishOnboarding } = useSora();
  const hex = useMemo(() => svgHex(400, 150, 13, (x, y) => ({
    fill: UNC[Math.min(7, Math.max(0, Math.round(((Math.sin(x / 40) + Math.cos(y / 30) + 2) / 4) * 7)))], op: 0.35 + 0.4 * Math.abs(Math.sin(x * y)),
  })), []);
  if (st.onb < 0) return null;
  const o = OB[st.onb];
  return (
    <div className="scrim" style={{ position: 'fixed', zIndex: 2000 }}>
      <div role="dialog" aria-modal="true" aria-label="Welcome to Sora" className="dialog" style={{ width: 'min(460px,100%)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 150, background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-default)', display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' }}>
          <svg viewBox="0 0 400 150" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
            {hex.map((h, i) => <polygon key={i} points={h.pts} fill={h.fill} fillOpacity={h.op} />)}
          </svg>
          <span style={{ position: 'absolute', width: 56, height: 56, borderRadius: 'var(--radius-lg)', background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 6px var(--surface-sunken)' }}>
            <Icon name={o.icon} size={26} />
          </span>
        </div>
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6 }} aria-label={`Step ${st.onb + 1} of 3`}>
            {OB.map((_, i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= st.onb ? 'var(--brand)' : 'var(--border-strong)' }} />)}
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-.01em' }}>{o.title}</h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', textWrap: 'pretty' }}>{o.body}</p>
          {o.isModes && <ModePicker compact />}
          {o.isLoc && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="smartphone" size={15} />Your location stays on this device.</li>
              <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="cloud-off" size={15} />No raw GPS history is sent to the cloud.</li>
              <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="toggle-right" size={15} />You can turn it off any time in Preferences.</li>
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className="btn-text" onClick={() => (st.onb === 0 || st.onb === 2 ? finishOnboarding() : set({ onb: st.onb - 1 }))}>{st.onb === 0 ? 'Skip' : st.onb === 2 ? 'Not now' : 'Back'}</button>
            <button className="btn-primary" style={{ padding: '0 18px' }} onClick={() => (st.onb === 2 ? finishOnboarding() : set({ onb: st.onb + 1 }))}>{st.onb === 2 ? 'Allow location' : 'Continue'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
