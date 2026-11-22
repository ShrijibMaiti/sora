import { useEffect, useState, type CSSProperties } from 'react';
import {
  AQI, BUILDINGS, DAY, DEGRADE, EVENTS, ME, MODES, POLL, ROUTE, UNC, WHATIF,
  cat, dayBars, pareto, plan, routeColor, segs, sgn, type PlanOk, type RouteId, type TripOption,
} from '../data/sora';
import { Icon } from '../components/Icon';

/* React port of "Sora Design System.dc.html" (Claude Design export). Inline styles are kept verbatim as CSS strings. */
const cache = new Map<string, CSSProperties>();
const s = (css: string): CSSProperties => {
  let o = cache.get(css);
  if (!o) {
    o = Object.fromEntries(css.split(';').filter((d) => d.includes(':')).map((d) => {
      const i = d.indexOf(':'), k = d.slice(0, i).trim();
      return [k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), d.slice(i + 1).trim()];
    }));
    cache.set(css, o);
  }
  return o;
};

const CARD = 'background:var(--surface-base);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;';
const T14 = 'font-size:14px;font-weight:500';
const H2 = 'margin:0;font-size:var(--fs-h2);font-weight:400;letter-spacing:-.01em';
const NAV_A = 'font-size:13px;color:var(--text-secondary);padding:8px 10px;border-radius:var(--radius-md)';
const NOTE = 'margin:0;font-size:12px;color:var(--text-tertiary)';
const LBL = 'font-size:12px;color:var(--text-secondary)';
const FIELD = 'display:flex;flex-direction:column;gap:6px';
const INPUT_BOX = 'display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:var(--radius-md);background:var(--surface-sunken);';
const HEX_CLIP = 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';
const FOCUS = 'outline:2px solid var(--focus-ring);outline-offset:2px;';
const Spin = ({ ring, top, size = 14 }: { ring: string; top: string; size?: number }) => (
  <span style={s(`width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${ring};border-top-color:${top};animation:sora-spin 800ms linear infinite`)} />
);

const PRINCIPLES = [
  { n: '01', t: 'Graphite layers, no shadows', d: 'Depth comes from four near-black steps and 1 px hairlines. Shadows only on things that float.' },
  { n: '02', t: 'One electric blue', d: 'Blue marks the brand, the primary action, the selected state and the recommended option. Nothing else.' },
  { n: '03', t: 'The hexagon is the unit of data', d: 'Fields are binned into gapped hexes; missing or sparse cells fall back to a dim grey hex.' },
  { n: '04', t: 'Measure, then annotate', d: 'Dashed crosshairs and a dark floating readout with a close button — the map behaves like an instrument.' },
  { n: '05', t: 'Light numerals, small labels', d: 'Big light-weight figures (32 %) against 11–13 px labels. Dense but calm; nothing shouts.' },
  { n: '06', t: 'Segments and thin lines', d: 'Probability is a row of 20 bars; time series are a 1.5 px line with a pill tooltip.' },
  { n: '07', t: 'Quiet chrome', d: 'Small radii (8/12), status dots, tiny count badges, chevron menus. The data carries the colour.' },
];
const NEUTRALS = [
  ['--bg-canvas', '#121316', '#E8EAEE', 'Page canvas'], ['--surface-base', '#1A1B1E', '#F5F6F8', 'Panels, cards'], ['--surface-raised', '#212226', '#FFFFFF', 'Controls, nested rows'],
  ['--surface-overlay', '#2A2B30', '#FFFFFF', 'Popovers, menus, sheet'], ['--surface-sunken', '#161719', '#ECEEF2', 'Inputs, tracks'], ['--border-default', '#2E3035', '#DCDFE5', 'Panel hairlines'],
  ['--border-strong', '#3D4047', '#C3C8D0', 'Hover borders, dividers'], ['--text-primary', '#EEF0F3', '#14161A', 'Headings, values'], ['--text-secondary', '#A9ADB6', '#474C55', 'Body, labels'],
  ['--text-tertiary', '#878B95', '#5F646E', 'Meta, axes (≥4.5:1)'], ['--text-disabled', '#5D616A', '#9A9FA8', 'Disabled only'], ['--hex-empty', '#2A2C31', '#DFE2E8', 'No-data hex'],
];
const BRAND = [['--brand', '#3B7BFF', '#2563EB'], ['--brand-hover', '#5A90FF', '#1D55D6'], ['--brand-soft', '16%', '10%'], ['--focus-ring', '#8FB3FF', '#2563EB'], ['--info', '#6A9BFF', '#2563EB'], ['--success', '#3CCF7A', '#0F7A43'], ['--warning', '#F2B347', '#9A5B00'], ['--danger', '#FF6B6B', '#C62828']];
const TYPE = [
  { n: 'display', fs: 'var(--fs-display)', fw: 300, lh: 1.02, ls: '-0.035em', sample: 'The map isn’t you.', spec: 'clamp 40–76 / 300 / 1.02' },
  { n: 'h1', fs: 'var(--fs-h1)', fw: 400, lh: 1.1, ls: '-0.02em', sample: 'Plan a cleaner day', spec: 'clamp 30–44 / 400 / 1.1' },
  { n: 'h2', fs: 'var(--fs-h2)', fw: 400, lh: 1.2, ls: '-0.01em', sample: 'How it works', spec: 'clamp 24–32 / 400 / 1.2' },
  { n: 'h3', fs: '20px', fw: 500, lh: 1.3, ls: '0', sample: 'Noise levels → Dose', spec: '20 / 500 / 1.3' },
  { n: 'h4', fs: '16px', fw: 500, lh: 1.35, ls: '0', sample: 'Option B · Balanced', spec: '16 / 500 / 1.35' },
  { n: 'body', fs: '15px', fw: 400, lh: 1.55, ls: '0', sample: 'Leaving at 17:20 avoids the build-up.', spec: '15 / 400 / 1.55' },
  { n: 'small', fs: '13px', fw: 400, lh: 1.45, ls: '0', sample: 'Forecast updated 14:00 IST', spec: '13 / 400 / 1.45' },
  { n: 'label', fs: '12px', fw: 500, lh: 1.3, ls: '0', sample: 'Departure window', spec: '12 / 500 / 1.3' },
  { n: 'numeric', fs: '32px', fw: 300, lh: 1, ls: '-0.01em', sample: '148 µg (121–180) · 18:15', spec: 'tabular-nums; mono 12 for ranges' },
];
const SPACE = ['4', '8', '12', '16', '20', '24', '32', '40', '48', '64', '96'];
const RADIUS = [['xs', '4px'], ['sm', '6px'], ['md', '8px'], ['lg', '12px'], ['xl', '16px'], ['pill', '999px']];
const MOTION = [['--dur-instant', '80ms', 'Press feedback'], ['--dur-fast', '140ms', 'Hover, toggle, focus'], ['--dur-base', '220ms', 'Popover, accordion, tabs'], ['--dur-slow', '360ms', 'Sheet, modal enter'], ['--dur-field', '900ms', 'Hourly field cross-fade'], ['--ease-standard', '.2,0,0,1', 'Default; exits use --ease-exit']];
const ICONS = [['footprints', 'Walk'], ['bike', 'Cycle'], ['two-wheeler', 'Two-wheeler'], ['auto', 'Auto-rickshaw'], ['car', 'Car'], ['bus', 'Bus'], ['train-front', 'Metro'], ['train-track', 'Train'], ['house', 'Home'], ['graduation-cap', 'College'], ['dumbbell', 'Gym'], ['utensils', 'Restaurant'], ['building-2', 'Building'], ['wind', 'Wind'], ['cloud-rain', 'Rain'], ['flame', 'Fire'], ['tornado', 'Dust'], ['sparkles', 'Festival'], ['radio-tower', 'Station'], ['satellite', 'Satellite'], ['circle-dashed', 'Uncertainty'], ['gauge', 'Confidence'], ['clock', 'Clock'], ['arrow-left-right', 'Swap'], ['info', 'Info'], ['triangle-alert', 'Warning'], ['cloud-fog', 'Inversion'], ['map-pin', 'Place'], ['layers', 'Layers'], ['search', 'Search']];
const ALERTS = [
  { icon: 'info', t: 'Info', d: 'Forecast updates every hour at :00.', bg: 'var(--info-soft)', fg: 'var(--info)' },
  { icon: 'check', t: 'Success', d: 'Your routine is saved on this device.', bg: 'var(--success-soft)', fg: 'var(--success)' },
  { icon: 'triangle-alert', t: 'Not reliably different today', d: 'The options are within each other’s uncertainty. Pick the one that suits you.', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  { icon: 'cloud-off', t: 'Can’t reach Sora', d: 'Showing the forecast from 13:00. Retrying in 30 s.', bg: 'var(--danger-soft)', fg: 'var(--danger)' },
];
const TABS = [['trip', 'Plan a trip'], ['day', 'Plan my day'], ['what', 'What if'], ['ins', 'Insights']];
const COVERAGE: [string, number][] = [['Sparse', 1], ['Moderate', 2], ['Dense', 3]];
const AQI_RANGES = ['0–30', '31–60', '61–90', '91–120', '121–250', '250+'], AQI_IDX = [24, 78, 142, 236, 348, 432], AQI_PATS = ['·', '··', '/', '//', '×', '××'];
const ROUTE_ROWS: [RouteId, string][] = [['plan', 'Your plan'], ['A', 'A · Lowest exposure'], ['B', 'B · Balanced (selected)'], ['C', 'C · Fastest']];
const POLL_VALS: Record<string, number> = { pm25: 142, pm10: 254, no2: 86, o3: 38, so2: 14, co: 2.1 };
const SEV = { warning: ['var(--warning-soft)', 'var(--warning)'], info: ['var(--info-soft)', 'var(--info)'], success: ['var(--success-soft)', 'var(--success)'] };
const BLD_ICONS = ['wind', 'building-2', 'air-vent'];
const RES = plan({ mode: 'car_ac', planned_departure: '18:15', dest_building: 'naturally_ventilated' }) as PlanOk;
const HOURS = dayBars(DAY.original, 7, 23), HOURS_MAX = Math.max(...HOURS.map((h) => h.tot));

const BUTTON_ROWS: [string, string, string[], string, string, [string, string]][] = [
  ['Primary', 'height:40px;padding:0 16px;border-radius:var(--radius-md);border:0;color:var(--text-on-accent);font-weight:500;font-size:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;',
    ['background:var(--brand);cursor:pointer', 'background:var(--brand-hover)', 'background:var(--brand);' + FOCUS, 'background:var(--brand-press)', 'background:var(--surface-overlay);color:var(--text-disabled)', 'background:var(--brand)'],
    'Launch Sora', 'Planning…', ['rgba(255,255,255,.35)', '#fff']],
  ['Secondary', 'height:40px;padding:0 16px;border-radius:var(--radius-md);font-weight:500;font-size:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;',
    ['border:1px solid var(--border-default);background:var(--surface-raised);cursor:pointer', 'border:1px solid var(--border-strong);background:var(--surface-overlay)', 'border:1px solid var(--border-default);background:var(--surface-raised);' + FOCUS,
      'border:1px solid var(--border-strong);background:var(--surface-active)', 'border:1px solid var(--border-subtle);background:transparent;color:var(--text-disabled)', 'border:1px solid var(--border-default);background:var(--surface-raised)'],
    'See how it works', 'Loading', ['var(--border-strong)', 'var(--text-primary)']],
  ['Ghost', 'height:40px;padding:0 12px;border-radius:var(--radius-md);border:0;font-size:14px;display:inline-flex;align-items:center;gap:8px;',
    ['background:transparent;color:var(--text-secondary);cursor:pointer', 'background:var(--surface-hover);color:var(--text-primary)', 'background:transparent;color:var(--text-primary);' + FOCUS,
      'background:var(--surface-active);color:var(--text-primary)', 'background:transparent;color:var(--text-disabled)', 'background:transparent;color:var(--text-secondary)'],
    'Reset', 'Reset', ['var(--border-strong)', 'var(--text-secondary)']],
];
const ICON_BTN = 'width:40px;height:40px;border-radius:var(--radius-md);display:grid;place-items:center;';

function optVM(o: TripOption, sel: RouteId, rec: RouteId) {
  const r = o.reduction_pct;
  // spec §31.7: reliable only if P(better) >= 0.7 and the 90% reduction range excludes zero
  const isPlan = o.id === 'plan', p = o.p_better ?? 0, reliable = !isPlan && p >= 0.7 && r.p05 > 0, R = ROUTE[o.id], on = o.id === sel;
  return {
    isPlan, reliable, selected: on, recommended: o.id === rec, color: routeColor(o.id), sw: R.w, dash: R.dash, letter: isPlan ? 'You' : o.id,
    doseTxt: o.dose.median, rangeTxt: `${o.dose.p05}–${o.dose.p95}`,
    redTxt: isPlan ? 'Baseline' : sgn(-r.median) + '%', redRange: isPlan ? '' : `(${sgn(-r.p05)} to ${sgn(-r.p95)})`,
    extraTxt: sgn(o.extra_min) + ' min', segs: segs(isPlan ? 0 : p, reliable),
    relTxt: isPlan ? 'Your own plan' : reliable ? 'Reliably lower' : 'Not reliably lower', pTxt: isPlan ? '' : Math.round(p * 100) + '%',
    border: on ? 'var(--brand)' : 'var(--border-default)', bg: on ? 'var(--brand-soft)' : 'var(--surface-raised)',
    redBg: !isPlan && reliable ? 'var(--success-soft)' : 'var(--surface-raised)', redFg: !isPlan && reliable ? 'var(--success)' : 'var(--text-secondary)',
    aria: `${o.label}: dose ${o.dose.median} µg (${o.dose.p05}–${o.dose.p95}), ${sgn(o.extra_min)} min`,
  };
}

export default function Styleguide() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [acc, setAcc] = useState(true), [tog, setTog] = useState(true);
  const [sel, setSel] = useState<RouteId>('B'), [poll, setPoll] = useState('pm25'), [tab, setTab] = useState('trip'), [mode, setMode] = useState('car_ac'), [wi, setWi] = useState(1);

  useEffect(() => { document.title = 'Sora — Design system'; }, []);
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('sora.theme', t); } catch { /* private mode */ }
    setTheme(t);
  };

  const P = pareto(RES, 320, 180);
  const paretoAria = [RES.baseline, ...RES.options].map((o) => `${o.label}: dose ${o.dose.median} µg, range ${o.dose.p05}–${o.dose.p95}, ${o.travel_min} min`).join('; ');
  const w = WHATIF[wi];

  return (
    <div className="sg" style={s('max-width:1320px;margin:0 auto;padding:24px clamp(16px,3vw,40px) 96px;display:flex;flex-direction:column;gap:40px')}>
      <style>{`html.route-styleguide body{font-size:15px;line-height:1.5}.sg a{color:var(--brand);text-decoration:none}.sg a:hover{color:var(--brand-hover);text-decoration:underline}
.sg :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}.sg ::selection{background:var(--brand-soft)}
@keyframes sora-spin{to{transform:rotate(360deg)}}@keyframes sora-pulse{0%,100%{opacity:.55}50%{opacity:1}}`}</style>

      <header style={s('display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--border-default)')}>
        <div style={s('display:flex;align-items:center;gap:12px')}>
          <div style={s('width:36px;height:36px;border-radius:var(--radius-md);background:var(--brand);color:#fff;display:grid;place-items:center')}><Icon name="hexmark" size={20} /></div>
          <div style={s('display:flex;flex-direction:column')}>
            <span style={s('font-size:18px;font-weight:500')}>Sora design system</span>
            <span style={s('font-size:12px;color:var(--text-tertiary)')}>Tokens, primitives and domain components · v0.1 · /styleguide</span>
          </div>
        </div>
        <nav style={s('display:flex;gap:4px;margin-left:auto;flex-wrap:wrap')} aria-label="Sections">
          <a href="#principles" style={s(NAV_A)}>Principles</a>
          <a href="#foundations" style={s(NAV_A)}>Foundations</a>
          <a href="#primitives" style={s(NAV_A)}>Primitives</a>
          <a href="#domain" style={s(NAV_A)}>Domain</a>
          <a href="#map" style={s(NAV_A)}>Map</a>
          <a href="/" style={s(NAV_A)}>Landing ↗</a>
          <a href="/app" style={s(NAV_A)}>App ↗</a>
        </nav>
        <button onClick={toggleTheme} aria-label="Toggle colour theme" style={s('display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:var(--radius-md);background:var(--surface-raised);border:1px solid var(--border-default);cursor:pointer;font-size:13px')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />{theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </header>

      <section id="principles" style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px;align-items:start')}>
        <div style={s('display:flex;flex-direction:column;gap:12px')}>
          <span style={s('font-size:12px;color:var(--text-tertiary)')}>01 · Reading of the reference</span>
          <h1 style={s('margin:0;font-size:var(--fs-h1);font-weight:400;letter-spacing:-.02em;line-height:1.1;text-wrap:balance')}>An instrument, not a poster.</h1>
          <p style={s('margin:0;color:var(--text-secondary);text-wrap:pretty')}>Everything here is taken from the Urban Sound dashboard reference: quiet graphite layers, one electric blue, data binned into hexagons, and precise overlays that read like a measuring tool.</p>
        </div>
        <ol style={s('margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1px;background:var(--border-default);border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden')}>
          {PRINCIPLES.map((p) => (
            <li key={p.n} style={s('background:var(--surface-base);padding:16px;display:flex;flex-direction:column;gap:6px')}>
              <span style={s('font-family:var(--font-mono);font-size:11px;color:var(--brand)')}>{p.n}</span>
              <span style={s('font-size:14px;font-weight:500')}>{p.t}</span>
              <span style={s('font-size:13px;color:var(--text-secondary);text-wrap:pretty')}>{p.d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="foundations" style={s('display:flex;flex-direction:column;gap:20px')}>
        <div style={s('display:flex;align-items:baseline;gap:12px;flex-wrap:wrap')}><h2 style={s(H2)}>Foundations</h2><span style={s('font-size:13px;color:var(--text-tertiary)')}>Swatches render the live theme — toggle above to check light values.</span></div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px;min-width:0')}>
            <div style={s('display:flex;justify-content:space-between;align-items:center')}><span style={s(T14)}>Surfaces, text &amp; borders</span><span style={s('font-size:11px;font-family:var(--font-mono);color:var(--text-tertiary)')}>dark · light</span></div>
            {NEUTRALS.map(([n, d, l, use]) => (
              <div key={n} style={s('display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center')}>
                <span style={s(`width:32px;height:32px;border-radius:var(--radius-sm);background:var(${n});border:1px solid var(--border-strong)`)} />
                <div style={s('display:flex;flex-direction:column;min-width:0')}><span style={s('font-family:var(--font-mono);font-size:12px')}>{n}</span><span style={s('font-size:12px;color:var(--text-tertiary)')}>{use}</span></div>
                <span style={s('font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);white-space:nowrap')}>{d} · {l}</span>
              </div>
            ))}
          </div>
          <div style={s('display:flex;flex-direction:column;gap:16px;min-width:0')}>
            <div style={s(CARD + 'gap:14px')}>
              <span style={s(T14)}>Brand &amp; semantic</span>
              <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px')}>
                {BRAND.map(([n, d, l]) => (
                  <div key={n} style={s('display:flex;flex-direction:column;gap:6px')}>
                    <span style={s(`height:44px;border-radius:var(--radius-md);background:var(${n});border:1px solid var(--border-default)`)} />
                    <span style={s('font-family:var(--font-mono);font-size:11px')}>{n}</span>
                    <span style={s('font-size:11px;color:var(--text-tertiary)')}>{d} · {l}</span>
                  </div>
                ))}
              </div>
              <p style={s(NOTE)}>Do: one blue per view, for the primary action, the selected state and the recommended option. Don't: tint panels with blue or use blue for warnings.</p>
            </div>
            <div style={s(CARD + 'gap:14px')}>
              <div style={s('display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap')}><span style={s(T14)}>AQI scale · CPCB National AQI</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>Fixed functional colours · always labelled</span></div>
              <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px')}>
                {AQI.map((a, i) => (
                  <div key={a.k} style={s('display:flex;flex-direction:column;gap:6px')}>
                    <div style={s(`height:44px;border-radius:var(--radius-md);background:${a.color};color:${a.ink};display:flex;align-items:flex-end;justify-content:space-between;padding:6px 8px;font-size:12px;font-weight:500`)}><span>{a.name}</span><span style={s('font-family:var(--font-mono)')}>{AQI_PATS[i]}</span></div>
                    <span style={s('font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)')}>{a.color} · PM2.5 {AQI_RANGES[i]}</span>
                  </div>
                ))}
              </div>
              <p style={s(NOTE)}>Ink on swatches: #0B0C0E on all but Severe (white), all ≥ 4.5:1. On the map the field sits at --field-opacity; the category label is in the legend, the popover and every badge.</p>
            </div>
          </div>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Uncertainty · sequential</span>
            <div style={s('display:flex;gap:3px')}>{UNC.map((c) => <span key={c} style={s(`flex:1;height:36px;background:${c};${HEX_CLIP}`)} />)}</div>
            <div style={s('display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)')}><span>±8% narrow</span><span>±45% wide</span></div>
            <p style={s(NOTE)}>The reference's blue hex ramp. Only for the uncertainty overlay — never for concentration, so it can't be mistaken for AQI.</p>
          </div>
          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Routes · colour + dash + weight</span>
            {ROUTE_ROWS.map(([id, label]) => {
              const R = ROUTE[id];
              return (
                <div key={id} style={s('display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:12px;align-items:center;padding:6px 8px;border-radius:var(--radius-md);background:var(--hex-empty)')}>
                  <svg width="96" height="14" viewBox="0 0 96 14" aria-hidden="true"><line x1="4" y1="7" x2="92" y2="7" stroke="var(--route-halo)" strokeWidth={R.w + 4} strokeLinecap="round" /><line x1="4" y1="7" x2="92" y2="7" stroke={routeColor(id)} strokeWidth={R.w} strokeDasharray={R.dash || undefined} strokeLinecap="round" /></svg>
                  <span style={s('font-size:13px')}>{label}</span>
                  <span style={s('font-size:11px;font-family:var(--font-mono);color:var(--text-tertiary)')}>{R.token}</span>
                </div>
              );
            })}
            <p style={s(NOTE)}>Every route has a 2 px halo so it reads on any AQI colour beneath.</p>
          </div>
          <div style={s(CARD + 'gap:10px')}>
            <span style={s(T14)}>Microenvironments</span>
            <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:8px 12px')}>
              {ME.map((m) => <div key={m.k} style={s('display:flex;align-items:center;gap:8px;font-size:13px')}><span style={s(`width:14px;height:14px;border-radius:3px;background:var(--me-${m.k})`)} /><Icon name={m.icon} size={14} />{m.label}</div>)}
            </div>
            <p style={s(NOTE)}>Hues avoid the AQI green–red axis so a timeline never reads as a pollution level.</p>
          </div>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px;min-width:0')}>
            <div style={s('display:flex;justify-content:space-between')}><span style={s(T14)}>Typography · Geist / Geist Mono</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>size / weight / line-height</span></div>
            {TYPE.map((t) => (
              <div key={t.n} style={s('display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:12px;align-items:baseline;border-top:1px solid var(--border-subtle);padding-top:10px')}>
                <span style={s(`font-size:${t.fs};font-weight:${t.fw};line-height:${t.lh};letter-spacing:${t.ls};font-family:var(--font-sans);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{t.sample}</span>
                <span style={s('display:flex;flex-direction:column;font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)')}><span style={s('color:var(--text-secondary)')}>{t.n}</span>{t.spec}</span>
              </div>
            ))}
          </div>
          <div style={s('display:flex;flex-direction:column;gap:16px;min-width:0')}>
            <div style={s(CARD + 'gap:12px')}>
              <span style={s(T14)}>Spacing · 4 px base</span>
              <div style={s('display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap')}>
                {SPACE.map((n) => { const v = Math.min(+n, 48) + 'px'; return <div key={n} style={s('display:flex;flex-direction:column;align-items:center;gap:6px')}><span style={s(`width:${v};height:${v};background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:2px`)} /><span style={s('font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)')}>{n}</span></div>; })}
              </div>
              <p style={s(NOTE)}>Grid: 4 cols / 16 gutter (&lt;768) · 8 cols / 20 (768–1023) · 12 cols / 24 (≥1024). Max content 1200; app panel 380–520.</p>
            </div>
            <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
              <div style={s(CARD + 'gap:12px')}>
                <span style={s(T14)}>Radius</span>
                <div style={s('display:flex;gap:10px;flex-wrap:wrap')}>
                  {RADIUS.map(([n, v]) => <div key={n} style={s('display:flex;flex-direction:column;align-items:center;gap:4px')}><span style={s(`width:40px;height:40px;border:1px solid var(--border-strong);background:var(--surface-raised);border-radius:${v}`)} /><span style={s('font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)')}>{n}</span></div>)}
                </div>
              </div>
              <div style={s(CARD + 'gap:8px')}>
                <span style={s(T14)}>Depth</span>
                <span style={s('font-size:12px;color:var(--text-secondary)')}>Layers, not shadows: canvas → base → raised → overlay, each +1 step lighter with a hairline. Only floating overlays (popover, menu, sheet) get --shadow-overlay.</span>
              </div>
            </div>
            <div style={s(CARD + 'gap:10px')}>
              <span style={s(T14)}>Motion</span>
              {MOTION.map(([n, v, use]) => <div key={n} style={s('display:grid;grid-template-columns:130px 70px minmax(0,1fr);gap:10px;font-size:12px;align-items:baseline')}><span style={s('font-family:var(--font-mono)')}>{n}</span><span style={s('font-family:var(--font-mono);color:var(--text-tertiary)')}>{v}</span><span style={s('color:var(--text-secondary)')}>{use}</span></div>)}
              <p style={s(NOTE)}>Reduced motion: every duration token resolves to 0 ms; the field animation steps hourly with no cross-fade.</p>
            </div>
          </div>
        </div>

        <div style={s(CARD + 'gap:14px')}>
          <div style={s('display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap')}><span style={s(T14)}>Iconography</span><span style={s('font-size:12px;color:var(--text-tertiary)')}>24 px grid · 1.6 stroke · round caps · sizes 14 / 16 / 20 · always paired with a text label or aria-label</span></div>
          <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:1px;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden')}>
            {ICONS.map(([n, l]) => <div key={n} style={s('background:var(--surface-base);padding:14px 8px;display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text-primary)')}><Icon name={n} size={20} /><span style={s('font-size:11px;color:var(--text-tertiary)')}>{l}</span></div>)}
          </div>
        </div>
      </section>

      <section id="primitives" style={s('display:flex;flex-direction:column;gap:20px')}>
        <h2 style={s(H2)}>Primitives</h2>

        <div style={s(CARD + 'gap:14px;overflow-x:auto')}>
          <span style={s(T14)}>Buttons</span>
          <div style={s('display:grid;grid-template-columns:90px repeat(6,minmax(120px,1fr));gap:12px 16px;align-items:center;min-width:900px')}>
            <span />
            {['default', 'hover', 'focus-visible', 'active', 'disabled', 'loading'].map((h) => <span key={h} style={s('font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary)')}>{h}</span>)}
            {BUTTON_ROWS.map(([name, base, states, label, loading, [ring, top]]) => [
              <span key={name} style={s(LBL)}>{name}</span>,
              ...states.map((st, i) => (
                <button key={name + i} disabled={i === 4} aria-busy={i === 5 || undefined} style={s(base + st)}>
                  {i === 5 && <Spin ring={ring} top={top} />}{i === 5 ? loading : label}
                </button>
              )),
            ])}
            <span style={s(LBL)}>Icon</span>
            <div style={s('display:flex;gap:8px')}>
              <button aria-label="Notifications" style={s(ICON_BTN + 'border:1px solid var(--border-default);background:var(--surface-raised);cursor:pointer')}><Icon name="bell" size={16} /></button>
              <button aria-label="Search" style={s(ICON_BTN + 'border:0;background:transparent;color:var(--text-secondary)')}><Icon name="search" size={16} /></button>
            </div>
            <button aria-label="Notifications" style={s(ICON_BTN + 'border:1px solid var(--border-strong);background:var(--surface-overlay)')}><Icon name="bell" size={16} /></button>
            <button aria-label="Notifications" style={s(ICON_BTN + 'border:1px solid var(--border-default);background:var(--surface-raised);' + FOCUS)}><Icon name="bell" size={16} /></button>
            <button aria-label="Notifications" style={s(ICON_BTN + 'border:1px solid var(--border-strong);background:var(--surface-active)')}><Icon name="bell" size={16} /></button>
            <button disabled aria-label="Notifications" style={s(ICON_BTN + 'border:1px solid var(--border-subtle);background:transparent;color:var(--text-disabled)')}><Icon name="bell" size={16} /></button>
            <button aria-label="Loading" style={s(ICON_BTN + 'border:1px solid var(--border-default);background:var(--surface-raised)')}><Spin ring="var(--border-strong)" top="var(--text-primary)" /></button>
          </div>
          <p style={s(NOTE)}>Sizes: sm 32 · md 40 · lg 48. On touch, any button under 44 px gets an invisible 44 px hit area. Links: brand colour, underline on hover, visited unchanged.</p>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Text &amp; number inputs</span>
            <label style={s(FIELD)}><span style={s(LBL)}>Start · default</span><div style={s(INPUT_BOX + 'border:1px solid var(--border-default)')}><Icon name="map-pin" size={16} /><input placeholder="Search a place or click the map" style={s('flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:14px')} /></div></label>
            <label style={s(FIELD)}><span style={s(LBL)}>Start · focus</span><div style={s(INPUT_BOX + 'border:1px solid var(--brand);box-shadow:0 0 0 3px var(--brand-soft)')}><Icon name="map-pin" size={16} /><span style={s('font-size:14px')}>Saket</span></div></label>
            <label style={s(FIELD)}><span style={s(LBL)}>Destination · error</span><div style={s(INPUT_BOX + 'border:1px solid var(--danger)')}><Icon name="map-pin" size={16} /><span style={s('font-size:14px')}>Noida Sector 62</span></div><span style={s('font-size:12px;color:var(--danger);display:flex;gap:6px;align-items:center')}><Icon name="triangle-alert" size={14} />Outside the covered area for Delhi.</span></label>
            <label style={s(FIELD)}><span style={s('font-size:12px;color:var(--text-disabled)')}>Latest arrival · disabled</span><div style={s('display:flex;align-items:center;height:40px;padding:0 12px;border-radius:var(--radius-md);background:transparent;border:1px dashed var(--border-default);color:var(--text-disabled);font-size:14px')}>Optional</div></label>
            <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:12px')}>
              <label style={s(FIELD)}><span style={s(LBL)}>Max extra time</span><div style={s('display:flex;align-items:center;height:40px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border-default);overflow:hidden')}><input type="number" defaultValue={15} aria-label="Max extra minutes" style={s('flex:1;min-width:0;border:0;background:transparent;outline:none;padding:0 12px;font-family:var(--font-mono);font-size:14px')} /><span style={s('padding:0 12px;font-size:12px;color:var(--text-tertiary);border-left:1px solid var(--border-default);height:100%;display:grid;place-items:center')}>min</span></div></label>
              <label style={s(FIELD)}><span style={s(LBL)}>Departure · IST</span><div style={s(INPUT_BOX + 'border:1px solid var(--border-default)')}><Icon name="clock" size={16} /><input type="time" defaultValue="18:15" aria-label="Planned departure, IST" style={s('flex:1;min-width:0;border:0;background:transparent;outline:none;font-family:var(--font-mono);font-size:14px')} /><span style={s('font-size:11px;color:var(--text-tertiary)')}>IST</span></div></label>
            </div>
          </div>

          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Select &amp; combobox</span>
            <label style={s(FIELD)}><span style={s(LBL)}>Building at destination</span><div style={s('position:relative;display:flex;align-items:center')}><select style={s('appearance:none;-webkit-appearance:none;width:100%;height:40px;padding:0 36px 0 12px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border-default);font-size:14px;cursor:pointer')}>{BUILDINGS.map((b) => <option key={b.k}>{b.label}</option>)}</select><span style={s('position:absolute;right:12px;pointer-events:none;color:var(--text-tertiary);display:flex')}><Icon name="chevron-down" size={16} /></span></div></label>
            <div style={s(FIELD)}>
              <span style={s(LBL)}>Place search · open</span>
              <div style={s(INPUT_BOX + 'border:1px solid var(--brand);box-shadow:0 0 0 3px var(--brand-soft)')}><Icon name="search" size={16} /><span style={s('font-size:14px')}>Kha</span><span style={s('width:1px;height:16px;background:var(--text-primary);animation:sora-pulse 1s steps(1) infinite')} /></div>
              <div role="listbox" style={s('background:var(--surface-overlay);border:1px solid var(--border-default);border-radius:var(--radius-md);box-shadow:var(--shadow-overlay);padding:4px;display:flex;flex-direction:column')}>
                <div style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--surface-active)')}><Icon name="map-pin" size={16} /><div style={s('display:flex;flex-direction:column')}><span style={s('font-size:13px')}><b style={s('font-weight:600')}>Kha</b>n Market</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>Rabindra Nagar, New Delhi</span></div></div>
                <div style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm)')}><Icon name="map-pin" size={16} /><div style={s('display:flex;flex-direction:column')}><span style={s('font-size:13px')}><b style={s('font-weight:600')}>Kha</b>jan Basti</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>Mayur Vihar Phase 1</span></div></div>
                <div style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;color:var(--text-tertiary);font-size:12px;border-top:1px solid var(--border-subtle);margin-top:4px')}><Icon name="mouse-pointer-click" size={14} />Or click a point on the map</div>
              </div>
              <span style={s('font-size:12px;color:var(--text-tertiary)')}>Empty: "No places match 'xyz' in Delhi." · Loading: 3 skeleton rows · Error: inline alert with Retry.</span>
            </div>
          </div>

          <div style={s(CARD + 'gap:16px')}>
            <span style={s(T14)}>Segmented, tabs, toggle, checkbox, radio, range</span>
            <div role="radiogroup" aria-label="Pollutant" style={s('display:inline-flex;padding:3px;gap:2px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border-default);align-self:flex-start;flex-wrap:wrap')}>
              {POLL.map((p) => { const on = poll === p.k; return <button key={p.k} role="radio" aria-checked={on} onClick={() => setPoll(p.k)} style={s(`height:30px;padding:0 10px;border-radius:var(--radius-sm);border:0;background:${on ? 'var(--surface-overlay)' : 'transparent'};color:${on ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:12px;font-weight:500;cursor:pointer`)}>{p.label}</button>; })}
            </div>
            <div role="tablist" style={s('display:flex;gap:20px;border-bottom:1px solid var(--border-default)')}>
              {TABS.map(([k, l]) => { const on = tab === k; return <button key={k} role="tab" aria-selected={on} onClick={() => setTab(k)} style={s(`height:40px;padding:0;border:0;background:transparent;color:${on ? 'var(--text-primary)' : 'var(--text-tertiary)'};font-size:13px;font-weight:500;cursor:pointer;box-shadow:inset 0 -2px 0 ${on ? 'var(--brand)' : 'transparent'}`)}>{l}</button>; })}
            </div>
            <div style={s('display:flex;gap:24px;flex-wrap:wrap;align-items:center')}>
              <button role="switch" aria-checked={tog} onClick={() => setTog(!tog)} style={s('display:inline-flex;align-items:center;gap:10px;border:0;background:transparent;cursor:pointer;padding:0;font-size:13px;min-height:44px')}>
                <span style={s(`width:36px;height:20px;border-radius:999px;background:${tog ? 'var(--brand)' : 'var(--surface-overlay)'};position:relative;transition:background var(--dur-fast) var(--ease-standard)`)}><span style={s(`position:absolute;top:2px;left:${tog ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:#fff;transition:left var(--dur-fast) var(--ease-standard)`)} /></span>Uncertainty overlay
              </button>
              <span style={s('display:inline-flex;align-items:center;gap:10px;font-size:13px;color:var(--text-disabled)')}><span style={s('width:36px;height:20px;border-radius:999px;background:var(--surface-overlay);position:relative')}><span style={s('position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--text-disabled)')} /></span>Disabled</span>
            </div>
            <div style={s('display:flex;gap:20px;flex-wrap:wrap')}>
              <label style={s('display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer')}><input type="checkbox" defaultChecked style={s('width:16px;height:16px;accent-color:var(--brand);margin:0')} />Stations</label>
              <label style={s('display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer')}><input type="checkbox" style={s('width:16px;height:16px;accent-color:var(--brand);margin:0')} />Wind</label>
              <label style={s('display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-disabled)')}><input type="checkbox" disabled style={s('width:16px;height:16px;margin:0')} />Satellite (L5)</label>
              <label style={s('display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer')}><input type="radio" name="sgr" defaultChecked style={s('width:16px;height:16px;accent-color:var(--brand);margin:0')} />AC, sealed</label>
              <label style={s('display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer')}><input type="radio" name="sgr" style={s('width:16px;height:16px;accent-color:var(--brand);margin:0')} />AC with filter</label>
            </div>
            <label style={s(FIELD)}><span style={s('display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)')}><span>Extra minutes I'll accept</span><span style={s('font-family:var(--font-mono);color:var(--text-primary)')}>15 min</span></span><input type="range" min={0} max={45} defaultValue={15} style={s('width:100%;accent-color:var(--brand)')} /></label>
          </div>

          <div style={s(CARD + 'gap:16px')}>
            <span style={s(T14)}>Chips, badges, tooltip, avatar, breadcrumbs</span>
            <div style={s('display:flex;gap:8px;flex-wrap:wrap')}>
              <span style={s('display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--radius-pill);background:var(--surface-raised);border:1px solid var(--border-default);font-size:12px;color:var(--text-secondary)')}><span style={s('width:6px;height:6px;border-radius:50%;background:var(--success)')} />14 stations reporting</span>
              <span style={s('display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--radius-pill);background:var(--brand-soft);border:1px solid var(--brand-line);font-size:12px;color:var(--text-primary)')}>Metro<Icon name="x" size={12} /></span>
              <span style={s('display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--radius-pill);background:var(--warning-soft);color:var(--warning);font-size:12px')}><Icon name="flame" size={14} />Smoke from upwind fires</span>
              <span style={s('display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:var(--radius-sm);background:var(--brand);color:#fff;font-size:11px;font-family:var(--font-mono)')}>3</span>
              <span style={s('display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:var(--radius-xs);background:var(--surface-overlay);color:var(--text-secondary);font-size:11px;font-weight:500')}>Preview</span>
              <span style={s('display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:var(--radius-xs);background:var(--success-soft);color:var(--success);font-size:11px;font-weight:500')}>Live</span>
            </div>
            <div style={s('display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap')}>
              <div style={s('display:flex;flex-direction:column;align-items:center;gap:6px')}>
                <div role="tooltip" style={s('background:var(--surface-overlay);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 10px;font-size:12px;box-shadow:var(--shadow-overlay)')}>Chance it really is lower than your plan</div>
                <Icon name="info" size={16} />
              </div>
              <div style={s('display:flex;align-items:center;gap:10px')}><span style={s('width:36px;height:36px;border-radius:50%;background:var(--surface-overlay);border:1px solid var(--border-strong);display:grid;place-items:center;font-size:13px;font-weight:500')}>AK</span><div style={s('display:flex;flex-direction:column')}><span style={s('font-size:13px')}>Aanya Kapoor</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>Cycles to college</span></div></div>
            </div>
            <nav aria-label="Breadcrumb" style={s('display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-tertiary)')}><a href="#domain" style={s('color:var(--text-secondary)')}>Delhi</a><Icon name="chevron-right" size={12} /><a href="#domain" style={s('color:var(--text-secondary)')}>Plan a trip</a><Icon name="chevron-right" size={12} /><span style={s('color:var(--text-primary)')} aria-current="page">Option B</span></nav>
            <div style={s('display:flex;flex-direction:column;gap:10px')}>
              <div style={s('display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)')}><span>Building forecast for Delhi</span><span style={s('font-family:var(--font-mono)')}>64%</span></div>
              <div role="progressbar" aria-valuenow={64} aria-valuemin={0} aria-valuemax={100} style={s('height:4px;border-radius:999px;background:var(--surface-overlay);overflow:hidden')}><span style={s('display:block;width:64%;height:100%;background:var(--brand)')} /></div>
              <div style={s('display:flex;gap:10px;align-items:center')}><Spin ring="var(--border-strong)" top="var(--brand)" size={16} /><span style={s('font-size:12px;color:var(--text-tertiary)')}>Spinner — only for actions under 2 s; use skeletons for content.</span></div>
              <div style={s('display:flex;flex-direction:column;gap:6px')}>{['height:12px;width:60%;border-radius:4px', 'height:12px;width:85%;border-radius:4px', 'height:32px;width:40%;border-radius:6px'].map((b) => <span key={b} style={s(b + ';background:var(--surface-overlay);animation:sora-pulse 1.6s ease-in-out infinite')} />)}</div>
            </div>
          </div>

          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Alerts, banner, toast</span>
            {ALERTS.map((a) => (
              <div key={a.t} role="status" style={s(`display:flex;gap:10px;padding:12px;border-radius:var(--radius-md);background:${a.bg};border:1px solid var(--border-subtle);align-items:flex-start`)}><span style={s(`color:${a.fg};display:flex;padding-top:2px`)}><Icon name={a.icon} size={16} /></span><div style={s('display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:13px;font-weight:500')}>{a.t}</span><span style={s('font-size:12px;color:var(--text-secondary)')}>{a.d}</span></div></div>
            ))}
            <div style={s('display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--warning-soft);border-top:1px solid var(--warning);border-bottom:1px solid var(--warning);font-size:12px;color:var(--text-primary)')}><Icon name="satellite" size={14} /><span style={s('flex:1')}>Banner · CAMS only — treat advice as indicative.</span><a href="#domain" style={s('font-size:12px')}>Why?</a></div>
            <div role="status" style={s('align-self:flex-end;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);background:var(--surface-overlay);border:1px solid var(--border-strong);box-shadow:var(--shadow-overlay);font-size:13px')}><span style={s('color:var(--success);display:flex')}><Icon name="check" size={16} /></span>Trip saved to your routine<button style={s('border:0;background:transparent;color:var(--brand);font-size:13px;cursor:pointer;padding:0 4px')}>Undo</button></div>
          </div>

          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Menu, list rows, table, accordion, stepper</span>
            <div role="menu" style={s('background:var(--surface-overlay);border:1px solid var(--border-default);border-radius:var(--radius-md);box-shadow:var(--shadow-overlay);padding:4px;display:flex;flex-direction:column;max-width:240px')}>
              <div role="menuitem" style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);font-size:13px;background:var(--surface-active)')}><Icon name="sliders-horizontal" size={16} />Preferences</div>
              <div role="menuitem" style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);font-size:13px')}><Icon name="palette" size={16} />Styleguide</div>
              <div role="menuitem" aria-disabled="true" style={s('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);font-size:13px;color:var(--text-disabled)')}><Icon name="download" size={16} />Export history</div>
            </div>
            <div style={s('display:flex;flex-direction:column;border:1px solid var(--border-default);border-radius:var(--radius-md);overflow:hidden')}>
              <div style={s('display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:13px;border-bottom:1px solid var(--border-subtle)')}><Icon name="radio-tower" size={16} /><span style={s('flex:1')}>Stations</span><span style={s('display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:12px')}><span style={s('width:6px;height:6px;border-radius:50%;background:var(--success)')} />14 of 15 reporting</span></div>
              <div style={s('display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:13px;border-bottom:1px solid var(--border-subtle)')}><Icon name="refresh-cw" size={16} /><span style={s('flex:1')}>Last analysis</span><span style={s('color:var(--text-secondary);font-size:12px;font-family:var(--font-mono)')}>14:00 IST</span></div>
              <div style={s('display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:13px')}><Icon name="satellite" size={16} /><span style={s('flex:1')}>CAMS forecast</span><span style={s('color:var(--text-secondary);font-size:12px;font-family:var(--font-mono)')}>00 UTC run</span></div>
            </div>
            <table style={s('width:100%;border-collapse:collapse;font-size:12px')}>
              <thead><tr style={s('color:var(--text-tertiary);text-align:left')}><th style={s('font-weight:500;padding:6px 8px;border-bottom:1px solid var(--border-default)')}>Trip</th><th style={s('font-weight:500;padding:6px 8px;border-bottom:1px solid var(--border-default);text-align:right')}>Dose</th><th style={s('font-weight:500;padding:6px 8px;border-bottom:1px solid var(--border-default);text-align:right')}>Range</th></tr></thead>
              <tbody>
                <tr><td style={s('padding:8px;border-bottom:1px solid var(--border-subtle)')}>Home → College</td><td style={s('padding:8px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono)')}>92 µg</td><td style={s('padding:8px;border-bottom:1px solid var(--border-subtle);text-align:right;font-family:var(--font-mono);color:var(--text-secondary)')}>76–112</td></tr>
                <tr><td style={s('padding:8px')}>Gym → Restaurant</td><td style={s('padding:8px;text-align:right;font-family:var(--font-mono)')}>84 µg</td><td style={s('padding:8px;text-align:right;font-family:var(--font-mono);color:var(--text-secondary)')}>69–103</td></tr>
              </tbody>
            </table>
            <div style={s('border:1px solid var(--border-default);border-radius:var(--radius-md)')}>
              <button aria-expanded={acc} onClick={() => setAcc(!acc)} style={s('width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:0 12px;border:0;background:transparent;cursor:pointer;font-size:13px;font-weight:500;text-align:left')}>Is this medical advice?<span style={s(`display:flex;transform:rotate(${acc ? '180deg' : '0deg'});transition:transform var(--dur-base) var(--ease-standard)`)}><Icon name="chevron-down" size={16} /></span></button>
              {acc && <p style={s('margin:0;padding:0 12px 12px;font-size:13px;color:var(--text-secondary)')}>No. Sora gives estimates to help you plan. Talk to a doctor about your health.</p>}
            </div>
            <ol aria-label="Onboarding progress" style={s('list-style:none;margin:0;padding:0;display:flex;gap:8px;align-items:center')}>
              <li style={s('display:flex;align-items:center;gap:6px;font-size:12px')}><span style={s('width:20px;height:20px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center')}><Icon name="check" size={12} /></span>City</li>
              <li style={s('flex:1;height:1px;background:var(--brand-line)')} />
              <li aria-current="step" style={s('display:flex;align-items:center;gap:6px;font-size:12px')}><span style={s('width:20px;height:20px;border-radius:50%;border:1px solid var(--brand);color:var(--brand);display:grid;place-items:center;font-family:var(--font-mono);font-size:11px')}>2</span>Routine</li>
              <li style={s('flex:1;height:1px;background:var(--border-default)')} />
              <li style={s('display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-tertiary)')}><span style={s('width:20px;height:20px;border-radius:50%;border:1px solid var(--border-strong);display:grid;place-items:center;font-family:var(--font-mono);font-size:11px')}>3</span>Location</li>
            </ol>
          </div>

          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Modal &amp; bottom sheet</span>
            <div style={s('position:relative;height:300px;border-radius:var(--radius-md);overflow:hidden;background:var(--hex-empty)')}>
              <div style={s('position:absolute;inset:0;background:var(--scrim)')} />
              <div role="dialog" aria-label="Location permission" style={s('position:absolute;left:50%;top:24px;transform:translateX(-50%);width:min(88%,300px);background:var(--surface-raised);border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-overlay);padding:16px;display:flex;flex-direction:column;gap:10px')}>
                <div style={s('display:flex;justify-content:space-between;align-items:center')}><span style={s('font-size:14px;font-weight:500')}>Use your location?</span><Icon name="x" size={16} /></div>
                <span style={s('font-size:12px;color:var(--text-secondary)')}>It stays on this device. Sora only uses it to start your trip.</span>
                <div style={s('display:flex;gap:8px;justify-content:flex-end')}><button style={s('height:32px;padding:0 10px;border-radius:var(--radius-md);border:0;background:transparent;color:var(--text-secondary);font-size:13px')}>Not now</button><button style={s('height:32px;padding:0 12px;border-radius:var(--radius-md);border:0;background:var(--brand);color:#fff;font-size:13px;font-weight:500')}>Allow</button></div>
              </div>
              <div style={s('position:absolute;left:0;right:0;bottom:0;height:90px;background:var(--surface-base);border-top:1px solid var(--border-default);border-radius:16px 16px 0 0;padding:8px 16px;display:flex;flex-direction:column;align-items:center;gap:8px')}><span style={s('width:36px;height:4px;border-radius:2px;background:var(--border-strong)')} /><span style={s('font-size:12px;color:var(--text-tertiary)')}>Mobile sheet · snaps at 96 px / 50% / 88%</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="domain" style={s('display:flex;flex-direction:column;gap:20px')}>
        <h2 style={s(H2)}>Domain components</h2>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>AQI badge · pollutant chip</span>
            <div style={s('display:flex;flex-direction:column;gap:8px')}>
              {AQI.map((a, i) => <span key={a.k} style={s('display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 10px 0 4px;border-radius:var(--radius-sm);background:var(--surface-raised);border:1px solid var(--border-default);align-self:flex-start')}><span style={s(`min-width:36px;height:20px;padding:0 6px;border-radius:4px;background:${a.color};color:${a.ink};font-family:var(--font-mono);font-size:12px;font-weight:500;display:grid;place-items:center`)}>{AQI_IDX[i]}</span><span style={s('font-size:12px')}>{a.name}</span></span>)}
            </div>
            <div style={s('display:flex;gap:6px;flex-wrap:wrap')}>
              {POLL.map((p) => <span key={p.k} style={s('display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--radius-pill);background:var(--surface-raised);border:1px solid var(--border-default);font-size:12px')}><span style={s(`width:8px;height:8px;border-radius:2px;background:${AQI[cat(POLL_VALS[p.k], p.k)].color}`)} /><span style={s('font-weight:500')}>{p.label}</span><span style={s('font-family:var(--font-mono);color:var(--text-secondary)')}>{POLL_VALS[p.k]} {p.unit}</span></span>)}
            </div>
          </div>

          <div style={s(CARD + 'gap:16px')}>
            <span style={s(T14)}>Interval bar · confidence meter · pills</span>
            <div style={s('display:flex;flex-direction:column;gap:8px')} aria-label="Estimated dose 148 micrograms, 90% range 121 to 180">
              <div style={s('display:flex;align-items:baseline;gap:6px')}><span style={s('font-size:28px;font-weight:300;font-variant-numeric:tabular-nums')}>148</span><span style={s('font-size:13px;color:var(--text-secondary)')}>µg</span><span style={s('font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)')}>(121–180)</span></div>
              <div style={s('position:relative;height:10px')}><span style={s('position:absolute;left:0;right:0;top:4px;height:2px;background:var(--border-default)')} /><span style={s('position:absolute;left:38%;width:30%;top:2px;height:6px;border-radius:3px;background:var(--brand-soft);border:1px solid var(--brand-line)')} /><span style={s('position:absolute;left:51%;top:0;width:2px;height:10px;background:var(--text-primary)')} /></div>
              <div style={s('display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)')}><span>p05 121</span><span>median 148</span><span>p95 180</span></div>
            </div>
            {([[0.93, 'Reliable'], [0.58, 'Not reliable']] as const).map(([p, state]) => {
              const rel = p >= 0.7, pTxt = Math.round(p * 100) + '%';
              return (
                <div key={state} style={s('display:flex;flex-direction:column;gap:6px')} aria-label={`${pTxt} chance it is lower; ${state}`}>
                  <div style={s('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}><span style={s('display:flex;align-items:baseline;gap:6px')}><span style={s('font-size:20px;font-weight:300;font-variant-numeric:tabular-nums')}>{pTxt}</span><span style={s('font-size:12px;color:var(--text-secondary)')}>chance it's lower</span></span><span style={s(`display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${rel ? 'var(--success)' : 'var(--text-tertiary)'}`)}><Icon name={rel ? 'check' : 'minus'} size={12} />{state}</span></div>
                  <div style={s('position:relative;display:flex;gap:2px;height:14px')}>{segs(p, rel).map((c, i) => <span key={i} style={s(`flex:1;border-radius:1px;background:${c}`)} />)}<span style={s('position:absolute;left:70%;top:-3px;bottom:-3px;border-left:1px dashed var(--text-secondary)')} /></div>
                  <div style={s('display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)')}><span>0%</span><span style={s('margin-left:40%')}>70% threshold</span><span>100%</span></div>
                </div>
              );
            })}
            <div style={s('display:flex;gap:8px;flex-wrap:wrap')}>
              <span style={s('display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--radius-pill);background:var(--success-soft);color:var(--success);font-size:12px;font-family:var(--font-mono)')}><Icon name="arrow-down-right" size={12} />−28%<span style={s('color:var(--text-secondary)')}>(−15 to −37)</span></span>
              <span style={s('display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--radius-pill);background:var(--surface-raised);border:1px solid var(--border-default);color:var(--text-secondary);font-size:12px;font-family:var(--font-mono)')}>−6%<span>(+7 to −18)</span></span>
              <span style={s('display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--radius-pill);background:var(--surface-raised);border:1px solid var(--border-default);font-size:12px;font-family:var(--font-mono)')}><Icon name="clock" size={12} />+7 min</span>
              <span style={s('display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:var(--radius-pill);background:var(--surface-raised);border:1px solid var(--border-default);font-size:12px;font-family:var(--font-mono)')}><Icon name="clock" size={12} />−4 min</span>
            </div>
          </div>

          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Data status · coverage</span>
            {DEGRADE.map((d) => <div key={d.l} style={s('display:flex;align-items:center;gap:10px')}><span style={s('display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:var(--radius-sm);background:var(--surface-raised);border:1px solid var(--border-default);font-size:11px')}><span style={s(`width:6px;height:6px;border-radius:50%;background:${d.c}`)} /><span style={s('font-family:var(--font-mono);color:var(--text-tertiary)')}>{d.l}</span>{d.src}</span><span style={s('font-size:11px;color:var(--text-tertiary)')}>{d.conf}</span></div>)}
            <div style={s('display:flex;gap:16px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border-subtle)')}>
              {COVERAGE.map(([l, n]) => <span key={l} style={s('display:inline-flex;align-items:center;gap:8px;font-size:12px')}><span style={s('display:flex;align-items:flex-end;gap:2px;height:14px')}>{[6, 10, 14].map((h, i) => <span key={h} style={s(`width:3px;height:${h}px;border-radius:1px;background:${i < n ? 'var(--text-primary)' : 'var(--border-strong)'}`)} />)}</span>{l} monitoring</span>)}
            </div>
          </div>
        </div>

        <div style={s(CARD + 'gap:14px')}>
          <div style={s('display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px')}><span style={s(T14)}>Option cards · Your plan / A / B / C</span><span style={s('font-size:12px;color:var(--text-tertiary)')}>Click to select · B is recommended · C shows the not-reliable state</span></div>
          <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px')}>
            {[RES.baseline, ...RES.options].map((o) => {
              const m = optVM(o, sel, RES.recommended);
              return (
                <button key={o.id} onClick={() => setSel(o.id)} aria-pressed={m.selected} aria-label={m.aria} style={s(`text-align:left;display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:var(--radius-lg);border:1px solid ${m.border};background:${m.bg};cursor:pointer;transition:border-color var(--dur-fast) var(--ease-standard),background var(--dur-fast) var(--ease-standard)`)}>
                  <div style={s('display:flex;align-items:center;gap:8px;width:100%')}>
                    <svg width="28" height="10" aria-hidden="true"><line x1="2" y1="5" x2="26" y2="5" stroke="var(--route-halo)" strokeWidth={m.sw + 3} strokeLinecap="round" /><line x1="2" y1="5" x2="26" y2="5" stroke={m.color} strokeWidth={m.sw} strokeDasharray={m.dash || undefined} strokeLinecap="round" /></svg>
                    <span style={s('font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)')}>{m.letter}</span>
                    <span style={s('font-size:13px;font-weight:500')}>{o.label}</span>
                    {m.recommended && <span style={s('margin-left:auto;height:20px;padding:0 6px;border-radius:var(--radius-xs);background:var(--brand);color:#fff;font-size:10px;font-weight:500;display:inline-flex;align-items:center')}>Recommended</span>}
                  </div>
                  <div style={s('display:flex;align-items:baseline;gap:6px')}><span style={s('font-size:30px;font-weight:300;line-height:1;font-variant-numeric:tabular-nums')}>{m.doseTxt}</span><span style={s('font-size:12px;color:var(--text-secondary)')}>µg</span><span style={s('font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)')}>({m.rangeTxt})</span></div>
                  <div style={s('display:flex;gap:6px;flex-wrap:wrap')}>
                    <span style={s(`display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:var(--radius-pill);background:${m.redBg};color:${m.redFg};font-size:11px;font-family:var(--font-mono)`)}>{m.redTxt} <span style={s('color:var(--text-secondary)')}>{m.redRange}</span></span>
                    <span style={s('display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:var(--radius-pill);border:1px solid var(--border-default);font-size:11px;font-family:var(--font-mono)')}><Icon name="clock" size={11} />{m.extraTxt}</span>
                    <span style={s('display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:var(--radius-pill);border:1px solid var(--border-default);font-size:11px;font-family:var(--font-mono)')}>dep {o.departure}</span>
                  </div>
                  <div style={s('display:flex;flex-direction:column;gap:5px;width:100%')}>
                    <div style={s('display:flex;gap:2px;height:8px')}>{m.segs.map((c, i) => <span key={i} style={s(`flex:1;border-radius:1px;background:${c}`)} />)}</div>
                    <span style={s('display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary)')}><span>{m.relTxt}</span><span style={s('font-family:var(--font-mono);color:var(--text-secondary)')}>{m.pTxt}</span></span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:10px')}>
            <span style={s(T14)}>Pareto mini-chart</span>
            <svg viewBox="0 0 320 180" style={s('width:100%;height:auto')} role="img" aria-label={paretoAria}>
              <line x1="28" y1="152" x2="314" y2="152" stroke="var(--border-default)" /><line x1="28" y1="10" x2="28" y2="152" stroke="var(--border-default)" />
              <polyline points={P.frontier} fill="none" stroke="var(--text-tertiary)" strokeDasharray="3 4" />
              {P.pts.map((p) => (
                <g key={p.id}><line x1={p.x} x2={p.x} y1={p.y05} y2={p.y95} stroke={p.c} strokeWidth={2} opacity={0.5} /><circle cx={p.x} cy={p.y} r={5} fill={p.hollow ? 'var(--surface-base)' : p.c} stroke={p.c} strokeWidth={2} /><text x={p.x + 8} y={p.y - 6} fontSize={11} fill="var(--text-secondary)" fontFamily="Geist Mono">{p.letter}</text></g>
              ))}
              <text x="314" y="170" textAnchor="end" fontSize={10} fill="var(--text-tertiary)">Travel time (min) →</text>
              <text x="4" y="10" fontSize={10} fill="var(--text-tertiary)">µg</text>
            </svg>
            <span style={s('font-size:12px;color:var(--text-tertiary)')}>Bars are the 90% dose range. Down-left is better; dashed line is the trade-off frontier.</span>
          </div>
          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Explanation block</span>
            <div style={s('display:grid;grid-template-columns:88px minmax(0,1fr);gap:10px 12px;font-size:13px')}>
              {([['lightbulb', 'Why', 'Leaving at 16:50 avoids the evening build-up near Ring Road.', ''], ['arrow-down-right', 'Benefit', '−28% (−15 to −37)', 'font-family:var(--font-mono)'], ['clock', 'Cost', '+7 min, leave 55 min earlier', 'font-family:var(--font-mono)'], ['gauge', 'Confidence', "93% chance it's lower than your plan", ''], ['circle-dashed', 'Caveats', 'Sparse monitoring south of Saket.', 'color:var(--text-secondary)']] as const).map(([i, k, v, st]) => [
                <span key={k} style={s('color:var(--text-tertiary);display:flex;gap:6px;align-items:center')}><Icon name={i} size={14} />{k}</span>,
                <span key={k + 'v'} style={s(st)}>{v}</span>,
              ])}
            </div>
            <p style={s('margin:0;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:11px;color:var(--text-tertiary)')}>Estimates, not measurements. Lower exposure doesn't mean safe.</p>
          </div>
          <div style={s(CARD + 'gap:10px')}>
            <span style={s(T14)}>Event cards</span>
            {EVENTS.map((e) => (
              <div key={e.k} style={s('display:flex;gap:10px;padding:10px;border-radius:var(--radius-md);background:var(--surface-raised);border:1px solid var(--border-subtle)')}><span style={s(`width:32px;height:32px;border-radius:var(--radius-md);background:${SEV[e.sev][0]};color:${SEV[e.sev][1]};display:grid;place-items:center;flex:none`)}><Icon name={e.icon} size={16} /></span><div style={s('display:flex;flex-direction:column;gap:2px;min-width:0')}><span style={s('font-size:13px;font-weight:500')}>{e.title}</span><span style={s('font-size:12px;color:var(--text-secondary)')}>{e.body}</span><span style={s('font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)')}>{e.when}</span></div></div>
            ))}
          </div>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px')}>
          <div style={s(CARD + 'gap:14px')}>
            <span style={s(T14)}>Mode, building &amp; departure-window pickers</span>
            <div role="radiogroup" aria-label="Mode" style={s('display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px')}>
              {MODES.map((m) => { const on = mode === m.k; return <button key={m.k} role="radio" aria-checked={on} aria-label={m.label} onClick={() => setMode(m.k)} style={s(`display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:52px;border-radius:var(--radius-md);border:1px solid ${on ? 'var(--brand)' : 'var(--border-default)'};background:${on ? 'var(--brand-soft)' : 'var(--surface-raised)'};color:${on ? 'var(--text-primary)' : 'var(--text-secondary)'};cursor:pointer;font-size:10px;padding:4px 2px`)}><Icon name={m.icon} size={18} />{m.label.replace(' (AC)', '').replace('Two-wheeler', '2-wheel')}</button>; })}
            </div>
            <div style={s('display:flex;gap:6px;flex-wrap:wrap')}>
              {BUILDINGS.map((b, i) => <span key={b.k} style={s(`display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:var(--radius-md);border:1px solid ${i === 2 ? 'var(--brand)' : 'var(--border-default)'};background:${i === 2 ? 'var(--brand-soft)' : 'var(--surface-raised)'};font-size:12px`)}><Icon name={BLD_ICONS[i]} size={14} />{b.label}</span>)}
            </div>
            <div style={s('display:flex;flex-direction:column;gap:6px')}>
              <span style={s(LBL)}>Departure window · 16:45 – 19:15 IST</span>
              <div style={s('position:relative;height:36px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border-default)')}><span style={s('position:absolute;left:20%;right:30%;top:4px;bottom:4px;border-radius:var(--radius-sm);background:var(--brand-soft);border:1px solid var(--brand-line)')} /><span style={s('position:absolute;left:52%;top:0;bottom:0;border-left:2px solid var(--text-primary)')} /><span style={s('position:absolute;left:52%;top:-18px;transform:translateX(-50%);font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)')}>18:15</span></div>
              <div style={s('display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)')}>{['16:00', '17:00', '18:00', '19:00', '20:00'].map((t) => <span key={t}>{t}</span>)}</div>
            </div>
          </div>
          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Exposure timeline · stacked by microenvironment</span>
            <div role="img" aria-label="Hourly dose from 07:00 to 23:00, highest at 17:00 during the gym session" style={s('display:flex;align-items:flex-end;gap:3px;height:120px;border-bottom:1px solid var(--border-default)')}>
              {HOURS.map((h) => <div key={h.h} style={s('flex:1;display:flex;flex-direction:column-reverse;gap:1px;height:100%;justify-content:flex-start')}>{h.parts.map((p) => <span key={p.me} style={s(`height:${((p.v / HOURS_MAX) * 116).toFixed(1)}px;background:${p.c};border-radius:1px`)} />)}</div>)}
            </div>
            <div style={s('display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)')}>{['07:00', '11:00', '15:00', '19:00', '23:00'].map((t) => <span key={t}>{t}</span>)}</div>
            <div style={s('display:flex;height:10px;border-radius:3px;overflow:hidden;gap:1px')}>{DAY.original.map((g, i) => <span key={i} style={s(`flex:${g.b - g.a};background:var(--me-${g.me})`)} />)}</div>
          </div>
          <div style={s(CARD + 'gap:12px')}>
            <span style={s(T14)}>Proactive card · What-if · disclaimer</span>
            <div style={s('display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:var(--radius-lg);background:var(--surface-raised);border:1px solid var(--border-default)')}>
              <div style={s('display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary)')}><Icon name="sunrise" size={14} />Tomorrow · your usual 08:20 trip</div>
              <span style={s('font-size:14px;font-weight:500')}>Leave for college at 08:05</span>
              <span style={s('font-size:12px;color:var(--text-secondary)')}>About 14% lower dose (−6 to −21) · 88% chance it's lower · the morning build-up starts near 08:30.</span>
              <div style={s('display:flex;gap:8px')}><button style={s('height:32px;padding:0 12px;border-radius:var(--radius-md);border:0;background:var(--brand);color:#fff;font-size:12px;font-weight:500;cursor:pointer')}>Remind me at 07:50</button><button style={s('height:32px;padding:0 10px;border-radius:var(--radius-md);border:0;background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer')}>Dismiss</button></div>
            </div>
            <div style={s('display:flex;gap:6px;flex-wrap:wrap')}>
              {WHATIF.map((q, i) => { const on = wi === i; return <button key={q.q} onClick={() => setWi(i)} aria-pressed={on} style={s(`display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border-radius:var(--radius-pill);border:1px solid ${on ? 'var(--brand)' : 'var(--border-default)'};background:${on ? 'var(--brand-soft)' : 'var(--surface-raised)'};font-size:12px;cursor:pointer`)}><Icon name={q.icon} size={13} />{q.q}</button>; })}
            </div>
            <div style={s('display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:var(--radius-md);background:var(--surface-sunken);border:1px solid var(--border-subtle)')}>
              <div style={s('display:flex;justify-content:space-between;gap:8px;align-items:baseline')}><span style={s('font-size:13px;font-weight:500')}>{w.verdict}</span><span style={s('font-family:var(--font-mono);font-size:12px')}>{sgn(w.d.median)}% <span style={s('color:var(--text-tertiary)')}>({sgn(w.d.p05)} to {sgn(w.d.p95)})</span></span></div>
              <span style={s('font-size:12px;color:var(--text-secondary)')}>{w.reason}</span>
              <span style={s('font-size:11px;color:var(--text-tertiary)')}>{Math.round(w.p * 100)}% chance it helps</span>
            </div>
            <p style={s('margin:0;font-size:11px;color:var(--text-tertiary);display:flex;gap:6px;align-items:center')}><Icon name="info" size={12} />Estimates, not measurements. Lower exposure doesn't mean safe.</p>
          </div>
        </div>
      </section>

      <section id="map" style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px')}>
        <div style={s('display:flex;flex-direction:column;gap:12px')}>
          <h2 style={s(H2)}>Map styling</h2>
          <ul style={s('margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-secondary)')}>
            {[['Basemap:', 'CARTO dark_nolabels / light_nolabels, labels layer on top at 70%. Tiles dimmed so the field leads.'],
              ['Field:', 'hex bins (≈1.7 km) with 14% gaps, fill at --field-opacity. Hexes fade to --hex-empty where coverage < 10%.'],
              ['Uncertainty mode:', 'same hexes recoloured on the blue ramp by (p95−p05)/median; AQI legend swaps to the ramp legend.'],
              ['Routes:', '2 px halo + colour; selected route raised and +1 px; unselected at 55% opacity; Your plan always dashed.'],
              ['Markers:', 'start = ring, end = filled square, stations = small diamond, fires = flame chip, wind = thin arrows every 3rd hex.'],
              ['Readout:', 'click shows dashed crosshairs plus a dark popover with value, range, category and confidence — the reference\'s "Midtown" card.'],
            ].map(([k, v]) => <li key={k}><b style={s('color:var(--text-primary);font-weight:500')}>{k}</b> {v}</li>)}
          </ul>
        </div>
        <div style={s('background:var(--surface-base);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:16px;display:flex;gap:16px;flex-wrap:wrap')}>
          <div style={s('display:flex;flex-direction:column;gap:4px;padding:10px;border-radius:var(--radius-md);background:var(--surface-overlay);border:1px solid var(--border-default);min-width:180px')}>
            <span style={s('font-size:11px;color:var(--text-tertiary);margin-bottom:4px')}>PM2.5 · µg/m³ · AQI category</span>
            {AQI.map((a, i) => <span key={a.k} style={s('display:flex;align-items:center;gap:8px;font-size:12px')}><span style={s(`width:12px;height:12px;background:${a.color};${HEX_CLIP}`)} /><span style={s('flex:1')}>{a.name}</span><span style={s('font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary)')}>{AQI_RANGES[i]}</span></span>)}
          </div>
          <div style={s('flex:1;min-width:200px;display:flex;flex-direction:column;gap:10px')}>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:12px')}><span style={s('width:14px;height:14px;border-radius:50%;border:3px solid var(--text-primary);background:var(--route-halo)')} />Start</div>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:12px')}><span style={s('width:12px;height:12px;background:var(--text-primary);border:2px solid var(--route-halo);border-radius:2px')} />Destination</div>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:12px')}><span style={s('width:10px;height:10px;transform:rotate(45deg);background:var(--surface-raised);border:1.5px solid var(--text-primary)')} />Monitoring station</div>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:12px;color:var(--warning)')}><Icon name="flame" size={14} /><span style={s('color:var(--text-primary)')}>Active fire (satellite)</span></div>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:12px')}><Icon name="move-up-right" size={14} />Wind direction, length ∝ speed</div>
          </div>
        </div>
      </section>
    </div>
  );
}
