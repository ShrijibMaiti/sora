import { useMemo } from 'react';
import { AQI, BP, DEGRADE, PLACES, POLL, UNC, aqiIndex, cat } from '../data/sora';
import { activeField, cityOf, useSora } from '../state/store';
import { fieldMean, fieldSeries, fieldTime, lastHour, relDay } from '../lib/field';
import { istHHMM } from '../lib/time';
import type { Layout } from '../lib/layout';
import { Icon } from './Icon';

/* ---------- search, city, chips, banner ---------- */
export function FloatTop({ L }: { L: Layout }) {
  const { st, set, applyDemo, flyTo, searchElRef, openSearch } = useSora();
  const city = cityOf(st.city);
  const q = st.searchQ.trim().toLowerCase();
  const results = q ? PLACES.filter((p) => (p.name + ' ' + p.sub).toLowerCase().includes(q)) : PLACES.slice(0, 5);
  const F = activeField(st), meta = F?.meta;
  const P = POLL.find((p) => p.k === (F?.pollutant ?? st.poll))!;
  const degr = st.demo === 'degraded' ? DEGRADE[5] : st.offline || !meta ? DEGRADE[7] : DEGRADE.find((d) => d.l === meta.degradation) || DEGRADE[7];
  const cm = F ? fieldMean(F, st.t) : null, ca = cm ? AQI[cat(cm.median, P.k)] : null;
  const updated = meta ? istHHMM(meta.analysis_time) + ' IST' : '—';
  const forecast = L.mob ? updated : st.offline ? `Last forecast ${updated} · reconnecting` : meta ? `Forecast updated ${updated} · next update ${istHHMM(meta.next_update)}` : 'Loading forecast…';
  const degraded = st.demo === 'degraded';
  const sparse = degraded || (meta ? meta.n_reporting / Math.max(1, meta.n_stations) < 0.5 : true);
  const alertEvent = st.events.find((e) => e.severity === 'warning');
  const banner = degraded
    ? { icon: 'satellite', text: "CAMS only — treat advice as indicative. Ground stations haven't reported since 11:00.", c: 'var(--warning)', action: 'Dismiss' }
    : st.demo === 'offline' ? { icon: 'cloud-off', text: "Can't reach Sora's servers. Retrying every 30 s.", c: 'var(--danger)', action: 'Retry now' } : null;

  return (
    <div className="float-top" style={{ left: L.floatLeft, right: L.floatRight }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: L.searchW, maxWidth: '100%' }}>
          <div className="searchbar popover">
            <input ref={searchElRef} value={st.searchQ} placeholder={`Search places in ${city.name}`} aria-label="Search for a place"
              onChange={(e) => set({ searchQ: e.target.value, searchOpen: true })} onFocus={openSearch}
              onBlur={() => setTimeout(() => set({ searchOpen: false }), 160)} onKeyDown={(e) => e.key === 'Escape' && set({ searchOpen: false })} />
            <span style={{ color: 'var(--text-secondary)', display: 'flex', padding: '0 8px' }}><Icon name="search" size={18} /></span>
            <span style={{ width: 1, height: 24, background: 'var(--border-default)' }} />
            <button className="route-btn" aria-label="Plan a trip" title="Plan a trip" onClick={() => set({ tab: 'trip', panelOpen: true, editTrip: true, searchOpen: false })}><Icon name="route" size={18} /></button>
            {L.mob && <button className="avatar" onClick={() => set((s) => ({ menuOpen: !s.menuOpen, cityOpen: false }))} aria-label="Settings and profile">AK</button>}
          </div>
          {st.searchOpen && (
            <div role="listbox" className="popover" style={{ position: 'absolute', top: 60, left: 0, right: 0, borderRadius: 'var(--radius-xl)', padding: 8, display: 'flex', flexDirection: 'column' }}>
              {results.map((p) => (
                <button key={p.k} className="dropdown-row" onMouseDown={() => {
                  set((s) => ({ searchOpen: false, searchQ: p.name, pt: p.ll, tab: s.tab === 'ins' ? 'live' : s.tab }));
                  flyTo(p.ll, 13);
                }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-raised)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="map-pin" size={15} /></span>
                  <span className="stack" style={{ gap: 2 }}><span style={{ fontSize: 14 }}>{p.name}</span><span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.sub}</span></span>
                </button>
              ))}
              {q && results.length === 0 && <span style={{ padding: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>No places match "{st.searchQ}" in {city.name}.</span>}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button className="city-btn popover" onClick={() => set((s) => ({ cityOpen: !s.cityOpen, menuOpen: false }))} aria-haspopup="listbox" aria-expanded={st.cityOpen}>
            <Icon name="map-pin" size={15} />{city.name}<Icon name="chevron-down" size={14} />
          </button>
          {st.cityOpen && (
            <div role="listbox" aria-label="City" className="popover" style={{ position: 'absolute', top: 52, left: 0, width: 260, borderRadius: 'var(--radius-md)', padding: 4, display: 'flex', flexDirection: 'column', zIndex: 1300 }}>
              {st.cities.map((c) => (
                <button key={c.key} role="option" aria-selected={c.key === st.city} className="city-opt"
                  onClick={() => set((s) => ({ city: c.key, cityOpen: false, pt: null, demo: c.built && s.demo === 'notbuilt' ? 'none' : s.demo }))}>
                  <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
                  <span style={{ height: 20, padding: '0 6px', borderRadius: 'var(--radius-xs)', background: c.built ? 'var(--success-soft)' : 'var(--surface-raised)', color: c.built ? 'var(--success)' : 'var(--text-secondary)', fontSize: 11, display: 'inline-flex', alignItems: 'center' }}>{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chip-row noscroll">
        <div role="radiogroup" aria-label="Pollutant" className="poll-group popover noscroll">
          {POLL.map((p) => {
            const f = st.fields[p.k], na = f === 'unavailable';
            return <button key={p.k} role="radio" aria-checked={st.poll === p.k} className="poll-btn" disabled={na || !f} title={na ? `${p.label} is not forecast for ${city.name} yet` : undefined} onClick={() => set({ poll: p.k })}>{p.label}</button>;
          })}
        </div>
        <span className="chip"><Icon name="refresh-cw" size={13} />{forecast}</span>
        <span className="chip" title={`Data status ${degr.l}: ${degr.src}, ${degr.conf} confidence`}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: degr.c }} />
          <span className="mono" style={{ color: 'var(--text-tertiary)' }}>{degr.l}</span>
          <span style={{ color: 'var(--text-primary)' }}>{degr.src + (degr.conf === 'Low' ? ' — low confidence' : '')}</span>
        </span>
        {cm && ca && (
          <span className="chip">
            {P.k === 'pm25' && <span className="mono" style={{ minWidth: 30, height: 20, padding: '0 6px', borderRadius: 'var(--radius-pill)', background: ca.color, color: ca.ink, fontSize: 11, display: 'grid', placeItems: 'center' }} title="PM2.5 sub-index (CPCB NAQI)">{aqiIndex(cm.median)}</span>}
            {P.k !== 'pm25' && <span style={{ width: 8, height: 8, borderRadius: 2, background: ca.color }} />}
            <span style={{ color: 'var(--text-primary)' }}>{ca.name}</span>
            <span className="mono">{P.k === 'co' ? cm.median.toFixed(1) : Math.round(cm.median)} {P.unit}</span>
          </span>
        )}
        {alertEvent && <span className="chip" style={{ color: 'var(--warning)' }}><Icon name="flame" size={13} />{alertEvent.title}</span>}
        <span className="chip">
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 13 }}>
            <span style={{ width: 3, height: 5, borderRadius: 1, background: 'var(--text-primary)' }} />
            <span style={{ width: 3, height: 9, borderRadius: 1, background: sparse ? 'var(--border-strong)' : 'var(--text-primary)' }} />
            <span style={{ width: 3, height: 13, borderRadius: 1, background: 'var(--border-strong)' }} />
          </span>
          {sparse ? 'Sparse monitoring' : 'Moderate monitoring'}
        </span>
      </div>

      {banner && (
        <div role="alert" className="banner" style={{ border: `1px solid ${banner.c}` }}>
          <span style={{ color: banner.c, display: 'flex' }}><Icon name={banner.icon} size={15} /></span>
          <span style={{ flex: 1 }}>{banner.text}</span>
          <button className="btn-ghost-sm" style={{ color: 'var(--text-primary)' }} onClick={() => applyDemo('none')}>{banner.action}</button>
        </div>
      )}
    </div>
  );
}

/* ---------- legend, layers, recenter, zoom ---------- */
function LayerRows() {
  const { st, set } = useSora();
  const flip = (k: keyof typeof st.lay) => () => set((s) => ({ lay: { ...s.lay, [k]: !s.lay[k] } }));
  const rows: [string, string, boolean, () => void][] = [
    ['Uncertainty overlay', 'circle-dashed', st.unc, () => set((s) => ({ unc: !s.unc }))],
    ['Monitoring stations', 'radio-tower', st.lay.stations, flip('stations')],
    ['Wind', 'wind', st.lay.wind, flip('wind')],
    ['Fires (satellite)', 'flame', st.lay.fires, flip('fires')],
  ];
  return (
    <>
      {rows.map(([l, i, on, f]) => (
        <button key={l} role="switch" aria-checked={on} className="menu-item" style={{ minHeight: 44 }} onClick={f}>
          <Icon name={i} size={15} /><span style={{ flex: 1 }}>{l}</span><span className="switch" />
        </button>
      ))}
    </>
  );
}

export function MapControls({ L }: { L: Layout }) {
  const { st, set, mapRef, flyTo } = useSora();
  const city = cityOf(st.city);
  const P = POLL.find((p) => p.k === st.poll)!;
  const legend = useMemo(() => {
    const bp = BP[st.poll], fmt = (n: number) => (n >= 100 ? Math.round(n) : n);
    return st.unc
      ? { title: 'Uncertainty · 90% range width', rows: UNC.filter((_, i) => i % 2 === 0 || i === 7).map((c, i) => ({ c, name: ['Narrow', '', '', 'Wide'][i] || '', range: ['±10%', '±20%', '±30%', '±45%+'][i] })) }
      : { title: P.label + ' · ' + P.unit + ' · AQI category', rows: AQI.map((a, i) => ({ c: a.color, name: a.name, range: i === 0 ? '0–' + fmt(bp[0]) : i === 5 ? fmt(bp[4]) + '+' : fmt(bp[i - 1]) + '–' + fmt(bp[i]) })) };
  }, [st.poll, st.unc, P]);

  return (
    <>
      {L.legendFull && (
        <div style={{ position: 'absolute', top: L.legendTop, right: 16, zIndex: 950 }}>
          <div role="group" aria-label="Legend" className="legend popover">
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{legend.title}</span>
            {legend.rows.map((r) => (
              <span key={r.c} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span className="hexdot" style={{ background: r.c }} />
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.name}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.range}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {L.layersTile && (
        <div style={{ position: 'absolute', left: L.layersLeft, bottom: 16, zIndex: 950, transition: 'left var(--dur-slow) var(--ease-standard)' }}>
          <button className="layers-tile popover" style={{ borderColor: undefined }} onClick={() => set((s) => ({ layersOpen: !s.layersOpen }))} aria-expanded={st.layersOpen} aria-label="Map layers">
            <Icon name="layers" size={20} />Layers
          </button>
          {st.layersOpen && <div className="layer-list popover" style={{ position: 'absolute', bottom: 88, left: 0 }}><LayerRows /></div>}
        </div>
      )}

      <div style={{ position: 'absolute', right: 16, bottom: L.stackBottom, zIndex: 950, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', transition: 'bottom var(--dur-slow) var(--ease-standard)' }}>
        {L.legendBtn && <button className="fab popover" onClick={() => set((s) => ({ legendOpen: !s.legendOpen }))} aria-expanded={st.legendOpen} aria-label="Legend"><Icon name="list" size={17} /></button>}
        {L.layersRound && (
          <div style={{ position: 'relative' }}>
            <button className="fab popover" onClick={() => set((s) => ({ layersOpen: !s.layersOpen }))} aria-expanded={st.layersOpen} aria-label="Map layers"><Icon name="layers" size={17} /></button>
            {st.layersOpen && <div className="layer-list popover" style={{ position: 'absolute', bottom: 0, right: 56, width: 250 }}><LayerRows /></div>}
          </div>
        )}
        <button className="fab popover" onClick={() => flyTo(city.center, st.w < 768 ? 10 : 11)} aria-label={`Recenter on ${city.name}`} title="Recenter"><Icon name="locate-fixed" size={17} /></button>
        <div className="zoom popover">
          <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Icon name="plus" size={17} /></button>
          <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Icon name="minus" size={17} /></button>
        </div>
      </div>

      <span className="attrib">Basemap © Esri, HERE, Garmin · © OpenStreetMap contributors</span>
    </>
  );
}

/* ---------- time scrubber ---------- */
/** City-average series of the active field, with SVG path builders. Empty until the field loads. */
export function useSeries() {
  const { st } = useSora();
  const F = activeField(st);
  return useMemo(() => {
    const ser = F ? fieldSeries(F) : [{ median: 0, p05: 0, p95: 0 }], N = Math.max(1, ser.length - 1);
    const mx = Math.max(1e-9, ...ser.map((s) => s.p95)) * 1.05;
    const path = (W: number, H: number, f: (s: (typeof ser)[number]) => number) => 'M' + ser.map((s, i) => ((i / N) * W).toFixed(1) + ' ' + (H - (f(s) / mx) * H).toFixed(1)).join(' L');
    const band = (W: number, H: number) => path(W, H, (s) => s.p95) + ' L' + ser.slice().reverse().map((s, j) => (((N - j) / N) * W).toFixed(1) + ' ' + (H - (s.p05 / mx) * H).toFixed(1)).join(' L') + ' Z';
    return { ser, mx, N, path, band };
  }, [F]);
}

/** Day ticks for the 72 h axis: "Sat 14:00 · Sun · Mon · Tue 14:00". */
export function dayTicks(F: ReturnType<typeof activeField>) {
  if (!F) return [] as string[];
  const out = [F.times[0]], first = relDay(F.times[0], F.times[0]);
  F.times.forEach((t, i) => { if (i && istHHMM(t) < istHHMM(F.times[i - 1])) out.push(t); });
  return out.map((t, i) => (i === 0 ? first + ' ' + istHHMM(t) : relDay(t, F.times[0])));
}

export function TimeScrubber({ L }: { L: Layout }) {
  const { st, set } = useSora();
  const F = activeField(st);
  const { path, band, N } = useSeries();
  const spark = useMemo(() => ({ line: path(720, 36, (s) => s.median), band: band(720, 36) }), [path, band]);
  const tl = F ? fieldTime(F, st.t) : { day: '', time: '--:--', short: 'Loading…' };
  const T = F ? lastHour(F) : 72;
  const midnights = F ? F.times.map((t, i) => (i && istHHMM(t) < istHHMM(F.times[i - 1]) ? i : -1)).filter((i) => i > 0) : [];
  return (
    <div className="scrub popover" style={{ left: L.scrubLeft, right: L.scrubRight, bottom: L.scrubBottom }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="play" onClick={() => set((s) => ({ playing: !s.playing }))} aria-label={st.playing ? 'Pause forecast animation' : 'Play forecast animation'}>
          <Icon name={st.playing ? 'pause' : 'play'} size={16} />
        </button>
        <div className="stack" style={{ flex: 'none', minWidth: L.tlabelW }}>
          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{tl.short}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>+{st.t} h · IST</span>
        </div>
        <div style={{ flex: 1, position: 'relative', height: 44, minWidth: 0 }}>
          <svg viewBox="0 0 720 36" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', left: 8, right: 8, top: 2, width: 'calc(100% - 16px)', height: 30 }}>
            <path d={spark.band} fill="var(--brand-soft)" />
            <path d={spark.line} fill="none" stroke="var(--brand)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
            {midnights.map((t) => { const x = ((t / N) * 720).toFixed(1); return <line key={t} x1={x} x2={x} y1={0} y2={36} stroke="var(--border-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />; })}
          </svg>
          <input type="range" min={0} max={T} step={1} value={st.t} disabled={!F} onChange={(e) => set({ t: +e.target.value, playing: false })} aria-label="Forecast hour" aria-valuetext={`${tl.day} · ${tl.time} IST`} />
        </div>
      </div>
      {L.scrubFoot && F && (
        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: L.scrubAttrPad, minWidth: 0 }}>
          <span className="mono" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{(L.mob ? dayTicks(F).map((d) => d.split(' ')[0]) : dayTicks(F)).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
