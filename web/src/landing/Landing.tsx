import { useEffect, useMemo, useRef, useState } from 'react';
import { AQI, CITIES, DAY, ME, MODES, PATHS, ROUTE, UNC, cityMean, hhmm, plan, routeColor, sample, segs, sgn, type LatLng, type ModeKey, type PlanOk } from '../data/sora';
import { Icon } from '../components/Icon';
import './landing.css';

export const APP_URL = '/app';

/* ---------- static copy ---------- */
const FAQ: [string, string][] = [
  ['Is this medical advice?', "No. Sora estimates exposure to help you plan everyday choices. It can't tell you what is safe for your health — talk to a doctor if you have a condition affected by air pollution."],
  ['How accurate is it?', 'Every number comes with a 90% range. Ranges are wider where monitoring is sparse and further into the forecast. Validation against street-level and personal measurements is published with the methods.'],
  ['Why does Sora sometimes say options are the same?', "When the difference between two plans is smaller than the uncertainty, Sora can't honestly say one is better. It tells you that instead of picking a winner at random."],
  ['What data does it use?', 'CPCB monitoring stations, CAMS forecasts from Copernicus, ERA5 weather, satellite fire detections, and OpenStreetMap roads and buildings.'],
  ['Does it track me?', "Not unless you turn it on. Location stays on your device by default, no raw GPS history goes to the cloud, and you can delete your history in one tap. Designed to comply with India's DPDP Act 2023."],
  ['Which cities?', 'Delhi is live. Kolkata, Mumbai and Chennai are in preview and open fully as their models are validated.'],
];
const LAYERS: [string, string][] = [['Forecast', "The city's air, 0–72 h ahead."], ['Follow', 'Your route, vehicle and rooms.'], ['Recommend', 'A lower dose, and how sure.']];
const OPS = [
  { t: 'Forecast', h: 'A physics-constrained forecast of the whole city, every hour.', p: 'A neural operator reconstructs the pollution field from stations, satellite and weather, then forecasts 72 hours ahead. A street-level layer adds what happens at the roadside.', facts: [['Horizon', '0–72 h, hourly'], ['Resolution', 'City grid + street layer'], ['Tested', 'On a city the model never saw']] },
  { t: 'Follow', h: 'Your day, stretch by stretch, room by room.', p: 'Sora follows your trajectory through roads, vehicles and buildings. Each has its own air: an open auto, a sealed metro coach, a naturally ventilated gym.', facts: [['Modes', 'Walk to metro, 7 in all'], ['Indoors', '3 building types'], ['Breathing', 'Varies by activity']] },
  { t: 'Recommend', h: 'Options with a benefit, a cost and a confidence.', p: "Uncertainty is propagated from the field into your dose, so every suggestion says how likely it is to really beat your own plan. Below 70%, Sora says the options aren't reliably different.", facts: [['Benefit', '% lower dose, with range'], ['Cost', 'Extra minutes'], ['Confidence', 'p(better than your plan)']] },
];
const SEAMS = [
  { n: '01', t: 'Plan with context.', d: 'Your route, departure time, vehicle and destination building are one plan. Sora estimates them together, not one map at a time.' },
  { n: '02', t: 'See what you actually breathe.', d: 'Not the station nearest your home — the air along your road, inside your vehicle and in the rooms where you spend your day.' },
  { n: '03', t: 'Change one thing. Keep the same estimate.', d: 'Leave earlier, switch to the metro, choose the other gym. Each change updates the same estimate, with its range and confidence.' },
];
const CODE: Record<string, string> = { delhi: 'del', kolkata: 'ccu', mumbai: 'bom', chennai: 'maa' };
const MONO = { fontFamily: 'var(--font-mono)' } as const;

/* ---------- exploded-layer diagram geometry (computed once) ---------- */
function hexes<T extends object>(R: number, r: number, fn: (x: number, y: number) => T | null) {
  const out: (T & { pts: string })[] = [], dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = 0, y = -R; y <= R; y += dy, row++)
    for (let x = -R + (row % 2 ? dx / 2 : 0); x <= R; x += dx) {
      if (Math.hypot(x, y) > R - r * 0.6) continue;
      const p: string[] = [];
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); p.push((x + r * 0.86 * Math.cos(a)).toFixed(1) + ',' + (y + r * 0.86 * Math.sin(a)).toFixed(1)); }
      const o = fn(x, y);
      if (o) out.push({ pts: p.join(' '), ...o });
    }
  return out;
}

const ISO = (() => {
  const BB = [28.44, 76.96, 28.8, 77.4], R = 170;
  const toLL = (x: number, y: number): LatLng => [BB[2] - ((y + R) / (2 * R)) * (BB[2] - BB[0]), BB[1] + ((x + R) / (2 * R)) * (BB[3] - BB[1])];
  const toXY = ([la, lo]: LatLng) => [((lo - BB[1]) / (BB[3] - BB[1])) * 2 * R - R, ((BB[2] - la) / (BB[2] - BB[0])) * 2 * R - R];
  const pl = (p: LatLng[]) => p.map((q) => toXY(q).map((n) => n.toFixed(1)).join(',')).join(' ');
  const near = (x: number, y: number) => PATHS.B.some((p, i) => {
    if (!i) return false;
    const a = toXY(PATHS.B[i - 1]), b = toXY(p);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
    return Math.hypot(x - a[0] - t * (b[0] - a[0]), y - a[1] - t * (b[1] - a[1])) < 11;
  });
  const s0 = toXY(PATHS.plan[0]), e0 = toXY(PATHS.plan[PATHS.plan.length - 1]);
  return {
    field: hexes(R, 11, (x, y) => { const [la, lo] = toLL(x, y), s = sample(5, la, lo); return { fill: AQI[s.cat].color, op: (0.5 + 0.35 * Math.abs(Math.sin(x * 3.1 + y * 1.7))).toFixed(2) }; }),
    ghost: hexes(R, 11, () => ({})),
    dose: hexes(R, 11, (x, y) => { if (!near(x, y)) return null; const [la, lo] = toLL(x, y), s = sample(3.1, la, lo); return { fill: UNC[Math.max(2, Math.min(7, Math.round(s.median / 30)))] }; }),
    plan: pl(PATHS.plan), rec: pl(PATHS.B), sx: s0[0].toFixed(1), sy: s0[1].toFixed(1), ex: (e0[0] - 7).toFixed(1), ey: (e0[1] - 7).toFixed(1),
  };
})();

const FC = (() => {
  const ser = Array.from({ length: 73 }, (_, t) => cityMean(t)), mx = Math.max(...ser.map((s) => s.p95)) * 1.05;
  const X = (i: number) => (i / 72) * 480, Y = (n: number) => 170 - (n / mx) * 160;
  return {
    line: 'M' + ser.map((s, i) => X(i).toFixed(1) + ' ' + Y(s.median).toFixed(1)).join(' L'),
    band: 'M' + ser.map((s, i) => X(i).toFixed(1) + ' ' + Y(s.p95).toFixed(1)).join(' L') + ' L' + ser.slice().reverse().map((s, j) => X(72 - j).toFixed(1) + ' ' + Y(s.p05).toFixed(1)).join(' L') + ' Z',
    days: [10, 34, 58].map((t) => X(t).toFixed(1)),
  };
})();

const TR = (() => {
  const tot: Record<string, number> = {};
  DAY.original.forEach((s) => (tot[s.me] = (tot[s.me] || 0) + s.dose));
  const sum = Object.values(tot).reduce((a, b) => a + b, 0);
  return { total: sum.toLocaleString('en-IN'), me: ME.filter((m) => tot[m.k]).map((m) => ({ k: m.k, label: m.label, pct: Math.round((tot[m.k] / sum) * 100) + '%' })) };
})();

const REC = (() => {
  const r0 = plan({ mode: 'car_ac', planned_departure: '18:15', dest_building: 'ac_sealed' }) as PlanOk;
  return [r0.baseline, ...r0.options].map((o) => {
    const isPlan = o.id === 'plan', p = o.p_better ?? 0, rel = !isPlan && p >= 0.7;
    return {
      id: o.id, letter: isPlan ? '—' : o.id, label: o.label, dose: o.dose,
      pTxt: isPlan ? 'baseline' : Math.round(p * 100) + '% chance', extraTxt: (o.extra_min >= 0 ? '+' : '−') + Math.abs(o.extra_min) + ' min', segs: segs(p, rel),
    };
  });
})();

/* ---------- page ---------- */
export default function Landing() {
  const [w, setW] = useState(window.innerWidth || 1280);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [layer, setLayer] = useState(2);
  const [op, setOp] = useState(0);
  const [faq, setFaq] = useState(0);
  const [city, setCity] = useState('delhi');
  const [mode, setMode] = useState<ModeKey>('car_ac');
  const [dep, setDep] = useState(1095);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "Sora — The air map isn't your exposure";
    const onR = () => setW(window.innerWidth);
    const onS = () => setScrolled(window.scrollY > 8);
    window.addEventListener('resize', onR);
    window.addEventListener('scroll', onS, { passive: true });
    return () => { window.removeEventListener('resize', onR); window.removeEventListener('scroll', onS); };
  }, []);

  const wide = w >= 900, stack = w < 1040;
  const heroCols = stack ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.05fr)';
  const twoCols = stack ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)';
  const leave = hhmm(dep);
  const c = CITIES.find((x) => x.key === city)!;

  const out = useMemo(() => {
    if (!c.built) return null;
    const res = plan({ mode, planned_departure: leave, dest_building: 'ac_sealed' }) as PlanOk;
    const best = res.reliable ? res.options[1] : res.options.reduce((a, b) => ((b.p_better ?? 0) > (a.p_better ?? 0) ? b : a));
    const p = best.p_better ?? 0, rel = p >= 0.7;
    return {
      head: rel ? `Recommended · B Balanced, leave ${best.departure}` : 'Options not reliably different', sub: `your plan ${res.baseline.dose.median} µg`,
      red: sgn(-best.reduction_pct.median) + '%', range: `(${sgn(-best.reduction_pct.p05)} to ${sgn(-best.reduction_pct.p95)})`,
      extra: (best.extra_min >= 0 ? '+' : '−') + Math.abs(best.extra_min) + ' min', segs: segs(p, rel),
      conf: `${Math.round(p * 100)}% chance it's lower than leaving at ${leave}` + (rel ? '' : ' — not reliable'), why: res.explanation[0],
    };
  }, [c.built, mode, leave]);

  const copy = () => {
    try { void navigator.clipboard.writeText(codeRef.current?.innerText || ''); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const lc = (i: number) => (layer === i ? 'var(--text-primary)' : 'var(--text-tertiary)');
  const O = OPS[op];

  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>

      <header className={'lp-header' + (scrolled || menu ? ' solid' : '')}>
        <div className="lp-wrap" style={{ height: 64, display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="#main" className="lp-brand"><span style={{ color: 'var(--brand)', display: 'flex' }}><Icon name="hexmark" size={20} /></span><span className="word" style={{ fontSize: 18 }}>sora</span></a>
          {wide && (
            <nav aria-label="Main" className="lp-nav" style={{ display: 'flex', gap: 28 }}>
              <a href="#model">The model</a><a href="#operations">How it works</a><a href="#questions">Questions</a>
            </nav>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {wide && <span className="lp-nav"><a href="https://github.com/ShrijibMaiti/sora" style={{ padding: '8px 10px' }}>GitHub</a></span>}
            <a href={APP_URL} className="lp-btn-ink">Launch Sora</a>
            {!wide && (
              <button onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu" style={{ width: 44, height: 44, border: 0, background: 'transparent', display: 'grid', placeItems: 'center' }}>
                <Icon name={menu ? 'x' : 'menu'} size={20} />
              </button>
            )}
          </div>
        </div>
        {!wide && menu && (
          <nav aria-label="Mobile" className="lp-wrap lp-mnav" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8, paddingBottom: 16, display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)', maxWidth: 'none' }}>
            <a href="#model" onClick={() => setMenu(false)}>The model</a>
            <a href="#operations" onClick={() => setMenu(false)}>How it works</a>
            <a href="#questions" onClick={() => setMenu(false)}>Questions</a>
            <a href="https://github.com/ShrijibMaiti/sora" style={{ color: 'var(--text-secondary)', borderBottom: 0 }}>GitHub</a>
          </nav>
        )}
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section aria-labelledby="hero-h" className="lp-wrap" style={{ paddingTop: 'clamp(56px,9vw,120px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: heroCols, gap: 'clamp(40px,5vw,80px)', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 }}>
              <h1 id="hero-h" style={{ margin: 0, fontSize: 'clamp(48px,7.6vw,108px)', fontWeight: 400, lineHeight: 0.94, letterSpacing: '-.045em', display: 'flex', flexDirection: 'column' }}>
                <span>The air map</span><span>isn't your</span><span style={{ color: 'var(--brand)' }}>exposure.</span>
              </h1>
              <p style={{ margin: 0, fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.5, color: 'var(--text-secondary)', maxWidth: 520 }}>
                Sora forecasts your city's air for the next 72 hours.<br />Then it plans when, where and how you travel so you breathe less of it — with honest confidence.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <a href={APP_URL} className="lp-btn-brand">Launch Sora<Icon name="arrow-right" size={16} /></a>
                <a href="#operations" className="lp-btn-line">See how it works</a>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-tertiary)' }}>Estimates, not medical advice.</p>
            </div>

            <figure style={{ margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
              aria-label="Exploded diagram of three stacked layers. Bottom: Delhi PM2.5 forecast at 19:00 as hexagons coloured by AQI category. Middle: your planned trip from Saket to Connaught Place. Top: the hexes your recommended route passes through, and route B with 28% lower estimated dose for 7 extra minutes.">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', ...MONO, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <code style={{ ...MONO, color: 'var(--text-secondary)' }}>delhi / saket → connaught-place</code>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />One connected estimate</span>
              </div>
              <div style={{ position: 'relative', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
                <svg viewBox="0 0 640 560" aria-hidden="true" style={{ width: '100%', height: 'auto', display: 'block' }}>
                  <g opacity={layer === 0 ? 1 : 0.4} style={{ transition: 'opacity var(--dur-slow) var(--ease-standard)' }}>
                    <g transform="translate(330 430) scale(1 .52) rotate(-30)">
                      <circle r="182" fill="none" stroke="var(--border-strong)" strokeDasharray="2 5" />
                      {ISO.field.map((h, i) => <polygon key={i} points={h.pts} fill={h.fill} fillOpacity={h.op} />)}
                    </g>
                  </g>
                  <g opacity={layer === 1 ? 1 : 0.4} style={{ transition: 'opacity var(--dur-slow) var(--ease-standard)' }}>
                    <g transform="translate(330 270) scale(1 .52) rotate(-30)">
                      <circle r="182" fill="var(--surface-base)" fillOpacity=".55" stroke="var(--border-strong)" />
                      {ISO.ghost.map((h, i) => <polygon key={i} points={h.pts} fill="none" stroke="var(--border-default)" strokeWidth="1" />)}
                      <polyline points={ISO.plan} fill="none" stroke="var(--route-halo)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={ISO.plan} fill="none" stroke="var(--route-plan)" strokeWidth="3" strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={ISO.sx} cy={ISO.sy} r="8" fill="var(--route-halo)" stroke="var(--text-primary)" strokeWidth="3" />
                      <rect x={ISO.ex} y={ISO.ey} width="14" height="14" rx="2" fill="var(--text-primary)" />
                    </g>
                  </g>
                  <g opacity={layer === 2 ? 1 : 0.45} style={{ transition: 'opacity var(--dur-slow) var(--ease-standard)' }}>
                    <g transform="translate(330 110) scale(1 .52) rotate(-30)">
                      <circle r="182" fill="var(--surface-base)" fillOpacity=".55" stroke="var(--brand-line)" />
                      {ISO.dose.map((h, i) => <polygon key={i} points={h.pts} fill={h.fill} />)}
                      <polyline points={ISO.rec} fill="none" stroke="var(--route-halo)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={ISO.rec} fill="none" stroke="var(--route-b)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  </g>
                  <line x1="148" y1="110" x2="148" y2="430" stroke="var(--border-strong)" strokeDasharray="2 5" />
                  <line x1="512" y1="110" x2="512" y2="430" stroke="var(--border-strong)" strokeDasharray="2 5" />
                  <g fontFamily="Geist Mono" fontSize="12" letterSpacing=".08em">
                    <text x="10" y="114" fill={lc(2)}>RECOMMEND</text><line x1="96" y1="110" x2="142" y2="110" stroke={lc(2)} />
                    <text x="10" y="274" fill={lc(1)}>FOLLOW</text><line x1="68" y1="270" x2="142" y2="270" stroke={lc(1)} />
                    <text x="10" y="434" fill={lc(0)}>FORECAST</text><line x1="84" y1="430" x2="142" y2="430" stroke={lc(0)} />
                    <text x="630" y="96" textAnchor="end" fill="var(--text-secondary)">B · −28% · +7 min</text>
                    <text x="630" y="256" textAnchor="end" fill="var(--text-secondary)">car (AC) · 18:15</text>
                    <text x="630" y="416" textAnchor="end" fill="var(--text-secondary)">PM2.5 · Sat 19:00</text>
                    <text x="320" y="548" textAnchor="middle" fill="var(--text-tertiary)">FIELD · TRAJECTORY · DOSE</text>
                  </g>
                </svg>
              </div>
              <div role="tablist" aria-label="Inspect a layer" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {LAYERS.map(([t, d], i) => (
                  <button key={t} role="tab" className="lp-layer" aria-selected={layer === i} onClick={() => setLayer(i)}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{t}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35 }}>{d}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}><span>Inspect a layer above</span><span>Illustrative model · Saturday 19:00 forecast</span></div>
            </figure>
          </div>
          <p style={{ margin: 'clamp(56px,7vw,96px) 0 0', paddingTop: 24, borderTop: '1px solid var(--border-default)', fontSize: 'clamp(18px,1.8vw,22px)', color: 'var(--text-secondary)' }}>
            Less map to read. <span style={{ color: 'var(--text-primary)' }}>More of your day to plan.</span>
          </p>
        </section>

        {/* ---------- your day is the unit ---------- */}
        <section id="model" aria-labelledby="model-h" className="lp-wrap lp-sec" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(40px,5vw,64px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: twoCols, gap: 'clamp(24px,4vw,64px)', alignItems: 'end' }}>
            <h2 id="model-h" className="lp-h2">Your day is the unit.</h2>
            <p className="lp-lede" style={{ maxWidth: 540 }}>Not a colour on a city map to interpret. A single plan for where you go, when you leave and how you travel — and what that means for the air you breathe.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: twoCols, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'var(--surface-base)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: stack ? 0 : '1px solid var(--border-default)', borderBottom: stack ? '1px solid var(--border-default)' : 0, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border-default)' }}>
                <span style={{ ...MONO, fontSize: 13 }}>plan.sora</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Interactive example · illustrative syntax</span>
                <button onClick={copy} className="lp-hov" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'transparent', fontSize: 12 }}>
                  <Icon name={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ padding: '8px 20px 0', fontSize: 13, color: 'var(--text-tertiary)' }}>A plan, not a pollution map.</div>
              <pre style={{ margin: 0, padding: '16px 20px 28px', ...MONO, fontSize: 'clamp(13px,1.2vw,15px)', lineHeight: 1.75, overflowX: 'auto', color: 'var(--text-secondary)' }}><code ref={codeRef}>
                <span style={{ color: 'var(--text-tertiary)' }}>plan</span> <span style={{ color: 'var(--text-primary)' }}>"evening-commute"</span> {'{'}{'\n'}
                {'  from    = '}<span style={{ color: 'var(--text-primary)' }}>"saket"</span>{'\n'}
                {'  to      = '}<span style={{ color: 'var(--text-primary)' }}>"connaught-place"</span>{'\n'}
                {'  city    = '}<span style={{ color: 'var(--brand)' }}>"{CODE[city]}"</span>{'\n'}
                {'  mode    = '}<span style={{ color: 'var(--brand)' }}>"{mode}"</span>{'\n'}
                {'  leave   = '}<span style={{ color: 'var(--brand)' }}>{leave}</span>{'\n'}
                {'  window  = '}<span style={{ color: 'var(--brand)' }}>± 90 min</span>{'\n\n'}
                {'  '}<span style={{ color: 'var(--text-tertiary)' }}>report</span> {'{'}{'\n'}
                {'    dose       = '}<span style={{ color: 'var(--text-primary)' }}>"median + p05..p95"</span>{'\n'}
                {'    confidence = '}<span style={{ color: 'var(--text-primary)' }}>"p(better than mine)"</span>{'\n'}
                {'  }'}{'\n'}{'}'}
              </code></pre>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>One plan. Four options.</span><span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>Preview</span>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
                <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, padding: 0 }}>Select a city</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                    {CITIES.map((x) => (
                      <button key={x.key} className="lp-chip" aria-pressed={city === x.key} onClick={() => setCity(x.key)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', minHeight: 56, borderRadius: 'var(--radius-md)', textAlign: 'left' }}>
                        <code style={{ ...MONO, fontSize: 13, color: city === x.key ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{CODE[x.key]}</code>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{x.name} · {x.status}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                  <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, padding: 0 }}>Mode</legend>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {MODES.filter((m) => ['walk', 'cycle', 'auto', 'car_ac', 'metro'].includes(m.k)).map((m) => (
                      <button key={m.k} className="lp-chip" aria-pressed={mode === m.k} onClick={() => setMode(m.k)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 12px', borderRadius: 'var(--radius-pill)', fontSize: 13 }}>
                        <Icon name={m.icon} size={15} />{m.label.replace(' (AC)', ' · AC')}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Leave at</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
                    <button className="lp-hov" onClick={() => setDep(Math.max(960, dep - 15))} aria-label="Leave 15 minutes earlier" style={{ width: 44, height: 40, border: 0, background: 'transparent', display: 'grid', placeItems: 'center' }}><Icon name="minus" size={15} /></button>
                    <span aria-live="polite" style={{ minWidth: 84, textAlign: 'center', ...MONO, fontSize: 14 }}>{leave} IST</span>
                    <button className="lp-hov" onClick={() => setDep(Math.min(1260, dep + 15))} aria-label="Leave 15 minutes later" style={{ width: 44, height: 40, border: 0, background: 'transparent', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={15} /></button>
                  </div>
                </div>

                <div aria-live="polite" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-default)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{out ? out.head : `${c.name} · Preview`}</span>
                    <span style={{ ...MONO, fontSize: 12, color: 'var(--text-tertiary)' }}>{out ? out.sub : 'no advice yet'}</span>
                  </div>
                  {out ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'clamp(40px,4.4vw,56px)', fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em' }}>{out.red}</span>
                        <span style={{ ...MONO, fontSize: 13, color: 'var(--text-tertiary)' }}>{out.range}</span>
                        <span style={{ marginLeft: 'auto', ...MONO, fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="clock" size={13} />{out.extra}</span>
                      </div>
                      <div aria-hidden="true" style={{ position: 'relative', display: 'flex', gap: 2, height: 10 }}>
                        {out.segs.map((s, i) => <span key={i} style={{ flex: 1, borderRadius: 1, background: s }} />)}
                        <span style={{ position: 'absolute', left: '70%', top: -3, bottom: -3, borderLeft: '1px dashed var(--text-secondary)' }} />
                      </div>
                      <span style={{ fontSize: 14 }}>{out.conf}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{out.why}</span>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>{c.note} The model is still being validated here, so Sora shows the forecast but no advice yet.</p>
                  )}
                </div>
              </div>
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, minWidth: 200 }}>Change the plan. Inspect the result.</span>
                <a href={APP_URL + '#tab=trip'} className="lp-btn-ink" style={{ fontSize: 13 }}>Open in Sora<Icon name="arrow-up-right" size={14} /></a>
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 720 }}>This example runs in your browser on Sora's illustrative Delhi forecast. Syntax and numbers show the model, not a live plan. No account. No location shared.</p>
        </section>

        {/* ---------- fewer guesses ---------- */}
        <section aria-labelledby="seams-h" className="lp-wrap lp-sec" style={{ display: 'grid', gridTemplateColumns: twoCols, gap: 'clamp(40px,6vw,96px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignSelf: 'start', position: stack ? 'static' : 'sticky', top: 96 }}>
            <h2 id="seams-h" className="lp-h2">Fewer guesses. Clearer choices.</h2>
            <p className="lp-lede" style={{ maxWidth: 460 }}>Exposure gets lost at the boundaries — between the map, your route, your vehicle and the room you end up in. Sora keeps them in one estimate.</p>
            <a href="#model" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, minHeight: 44 }}>Inspect the plan model<Icon name="arrow-right" size={15} /></a>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {SEAMS.map((s) => (
              <li key={s.n} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: 16, padding: '32px 0', borderTop: '1px solid var(--border-default)' }}>
                <span style={{ ...MONO, fontSize: 13, color: 'var(--brand)', paddingTop: 6 }}>{s.n}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 'clamp(22px,2.2vw,28px)', fontWeight: 400, letterSpacing: '-.02em' }}>{s.t}</h3>
                  <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)', textWrap: 'pretty' }}>{s.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- three steps ---------- */}
        <section id="operations" aria-labelledby="ops-h" className="lp-wrap lp-sec" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
            <h2 id="ops-h" className="lp-h2">Three steps. One estimate.</h2>
            <p className="lp-lede">Your plan should be organised around what you breathe. Not around the maps you had to read to guess it.</p>
          </div>
          <div role="tablist" aria-label="Steps" className="noscroll" style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', gap: 'clamp(16px,3vw,40px)', overflowX: 'auto' }}>
            {OPS.map((o, i) => (
              <button key={o.t} role="tab" className="lp-op" aria-selected={op === i} onClick={() => setOp(i)}><span className="n">0{i + 1}</span>{o.t}</button>
            ))}
          </div>
          <div role="tabpanel" style={{ display: 'grid', gridTemplateColumns: twoCols, gap: 'clamp(32px,5vw,80px)', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h3 style={{ margin: 0, fontSize: 'clamp(24px,2.6vw,34px)', fontWeight: 400, letterSpacing: '-.025em', lineHeight: 1.15, textWrap: 'balance' }}>{O.h}</h3>
              <p style={{ margin: 0, fontSize: 17, color: 'var(--text-secondary)', textWrap: 'pretty' }}>{O.p}</p>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 24px', paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
                {O.facts.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt style={{ ...MONO, fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em', paddingTop: 3 }}>{k}</dt>
                    <dd style={{ margin: 0, fontSize: 15 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div style={{ background: 'var(--surface-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', padding: 20, minWidth: 0 }}>
              {op === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', ...MONO }}><span>CITY MEAN PM2.5 · 0–72 H</span><span>µg/m³</span></div>
                  <svg viewBox="0 0 480 180" role="img" aria-label="City mean PM2.5 over 72 hours with 90% band; peaks each evening around 20:00." style={{ width: '100%', height: 'auto' }}>
                    <path d={FC.band} fill="var(--brand-soft)" />
                    <path d={FC.line} fill="none" stroke="var(--brand)" strokeWidth="1.8" style={{ filter: 'drop-shadow(0 0 6px var(--brand-line))' }} />
                    {FC.days.map((x) => <line key={x} x1={x} x2={x} y1="0" y2="170" stroke="var(--border-strong)" strokeDasharray="2 4" />)}
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: 11, color: 'var(--text-tertiary)' }}><span>Sat 14:00</span><span>Sun</span><span>Mon</span><span>Tue 14:00</span></div>
                </div>
              )}
              {op === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', ...MONO }}><span>YOUR DAY · 07:00–23:00</span><span>{TR.total} µg</span></div>
                  <div style={{ display: 'flex', height: 36, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                    {DAY.original.map((s, i) => <span key={i} title={`${hhmm(s.a)}–${hhmm(s.b)} · ${s.dose} µg`} style={{ flex: s.b - s.a, background: `var(--me-${s.me})` }} />)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: 11, color: 'var(--text-tertiary)' }}><span>07:00</span><span>11:00</span><span>15:00</span><span>19:00</span><span>23:00</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '8px 16px', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    {TR.me.map((m) => (
                      <span key={m.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: `var(--me-${m.k})` }} />
                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{m.label}</span><span style={{ ...MONO, fontSize: 12 }}>{m.pct}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {op === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {REC.map((o) => {
                    const R = ROUTE[o.id];
                    return (
                      <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <svg width="28" height="10" aria-hidden="true"><line x1="2" y1="5" x2="26" y2="5" stroke={routeColor(o.id)} strokeWidth={R.w} strokeDasharray={R.dash || undefined} strokeLinecap="round" /></svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 14 }}>{o.letter} · {o.label}</span>
                          <span style={{ display: 'flex', gap: 1, height: 5, maxWidth: 200 }}>{o.segs.map((s, i) => <span key={i} style={{ flex: 1, background: s }} />)}</span>
                        </div>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', ...MONO, fontSize: 12 }}>
                          <span>{o.dose.median} µg <span style={{ color: 'var(--text-tertiary)' }}>({o.dose.p05}–{o.dose.p95})</span></span>
                          <span style={{ color: 'var(--text-tertiary)' }}>{o.pTxt} · {o.extraTxt}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>Estimates, not measurements. Lower exposure doesn't mean safe.</p>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="questions" aria-labelledby="q-h" className="lp-wrap lp-sec" style={{ display: 'grid', gridTemplateColumns: twoCols, gap: 'clamp(40px,6vw,96px)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 id="q-h" className="lp-h2">Good questions. Direct answers.</h2>
            <p className="lp-lede">What Sora does — and what it doesn't.</p>
          </div>
          <div className="lp-faq" style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-default)' }}>
            {FAQ.map(([q, a], i) => (
              <div key={q} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <h3 style={{ margin: 0 }}>
                  <button onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i} aria-controls={'q-' + i}>{q}<span className="pm"><Icon name="plus" size={20} /></span></button>
                </h3>
                {faq === i && <p id={'q-' + i} style={{ margin: 0, padding: '0 48px 24px 0', fontSize: 16, color: 'var(--text-secondary)', textWrap: 'pretty' }}>{a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section aria-labelledby="cta-h" className="lp-wrap lp-sec">
          <div style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: 'clamp(56px,8vw,112px) 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
            <h2 id="cta-h" style={{ margin: 0, fontSize: 'clamp(44px,6.4vw,88px)', fontWeight: 400, lineHeight: 0.98, letterSpacing: '-.045em' }}>Plan a cleaner day.</h2>
            <p className="lp-lede">Start with your commute. See how sure Sora is.</p>
            <a href={APP_URL} className="lp-btn-brand" style={{ marginTop: 8 }}>Launch Sora<Icon name="arrow-right" size={16} /></a>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-foot" style={{ paddingTop: 40, paddingBottom: 48, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <a href="#main" className="lp-brand"><span style={{ color: 'var(--brand)', display: 'flex' }}><Icon name="hexmark" size={18} /></span><span className="word" style={{ fontSize: 16 }}>sora</span></a>
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Air, considered as a dose.</span>
          <nav aria-label="Footer" style={{ marginLeft: 'auto', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
            <a href="#model">The model</a><a href="#operations">How it works</a><a href="/styleguide">Design system</a><a href="https://github.com/ShrijibMaiti/sora">GitHub</a>
          </nav>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: 20, borderTop: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <span style={{ maxWidth: 760 }}>Data: CPCB · CAMS / Copernicus · ERA5 · © OpenStreetMap contributors. Contains modified Copernicus Atmosphere Monitoring Service information 2026. Estimates, not measurements or medical advice. Lower exposure doesn't mean safe.</span>
          <span>© 2026 Sora</span>
        </div>
      </footer>
    </div>
  );
}
