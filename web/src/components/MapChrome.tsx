import { useEffect, useMemo, useRef, useState } from 'react';
import { AQI, BP, DEGRADE, PLACES, POLL, UNC, aqiIndex, cat } from '../data/sora';
import { activeField, cityOf, useSora } from '../state/store';
import { fieldMean, fieldSeries, fieldTime, lastHour, relDay } from '../lib/field';
import { istHHMM } from '../lib/time';
import type { Layout } from '../lib/layout';
import { Icon } from './Icon';

/* ---------- search, city, chips, banner ---------- */
export function FloatTop({ L }: { L: Layout }) {
  const { st, set, applyDemo, flyTo, searchElRef, openSearch } = useSora();
  const [dataOpen, setDataOpen] = useState(false);
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
    ? { icon: 'satellite', text: "Satellite data only: treat advice as indicative. Ground stations haven't reported since 11:00.", c: 'var(--warning)', action: 'Dismiss' }
    : st.demo === 'offline' ? { icon: 'cloud-off', text: "Can't reach Sora's servers. Retrying every 30 s.", c: 'var(--danger)', action: 'Retry now' } : null;
  /* the Data chip never claims "good" while offline or degraded; its dot matches the banner's colour */
  const offline = st.offline || st.demo === 'offline';
  const data = offline ? { dot: 'var(--danger)', label: 'Offline', time: `last ${updated.replace(' IST', '')}` }
    : degraded ? { dot: 'var(--warning)', label: 'Data: limited', time: updated.replace(' IST', '') }
      : { dot: degr.c, label: degr.conf === 'Low' || sparse ? 'Data: limited' : 'Data: good', time: updated.replace(' IST', '') };

  /* search: combobox with arrow-key navigation over the result options */
  const [active, setActive] = useState(-1);
  const pick = (p: (typeof PLACES)[number]) => {
    set((s) => ({ searchOpen: false, searchQ: p.name, pt: p.ll, tab: s.tab === 'ins' ? 'live' : s.tab }));
    flyTo(p.ll, 13);
  };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { set({ searchOpen: false }); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      set({ searchOpen: true });
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % results.length : (i - 1 + results.length) % results.length));
    } else if (e.key === 'Enter' && st.searchOpen) { e.preventDefault(); pick(results[Math.max(0, active)]); }
  };

  /* the Data popover closes on Esc or a click outside it */
  const dataRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dataOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDataOpen(false);
    const onDown = (e: PointerEvent) => { if (!dataRef.current?.contains(e.target as Node)) setDataOpen(false); };
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [dataOpen]);

  return (
    <div className="float-top" style={{ left: L.floatLeft, right: L.floatRight, ...L.chromeHide }} aria-hidden={L.chromeHidden || undefined}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: L.searchW, maxWidth: '100%' }}>
          <div className="searchbar popover">
            <input ref={searchElRef} value={st.searchQ} placeholder={`Search places in ${city.name}`} aria-label="Search for a place"
              role="combobox" aria-expanded={st.searchOpen} aria-controls="search-results" aria-autocomplete="list"
              aria-activedescendant={st.searchOpen && active >= 0 && results[active] ? `sr-${results[active].k}` : undefined}
              onChange={(e) => { set({ searchQ: e.target.value, searchOpen: true }); setActive(-1); }} onFocus={openSearch}
              onBlur={() => setTimeout(() => set({ searchOpen: false }), 160)} onKeyDown={onSearchKey} />
            <span style={{ color: 'var(--text-secondary)', display: 'flex', padding: '0 8px' }}><Icon name="search" size={18} /></span>
            <span style={{ width: 1, height: 24, background: 'var(--border-default)' }} />
            <button className="route-btn" aria-label="Plan a trip" title="Plan a trip" onClick={() => set({ tab: 'trip', panelOpen: true, editTrip: true, searchOpen: false })}><Icon name="route" size={18} /></button>
            {L.mob && <button className="avatar" onClick={() => set((s) => ({ menuOpen: !s.menuOpen, cityOpen: false }))} aria-label="Settings and profile"><Icon name="user" size={17} /></button>}
          </div>
          {st.searchOpen && (
            <div id="search-results" role="listbox" aria-label="Places" className="popover" style={{ position: 'absolute', top: 60, left: 0, right: 0, borderRadius: 'var(--radius-xl)', padding: 8, display: 'flex', flexDirection: 'column' }}>
              {results.map((p, i) => (
                <div key={p.k} id={`sr-${p.k}`} role="option" aria-selected={i === active} className="dropdown-row" onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  onMouseEnter={() => setActive(i)} style={{ cursor: 'pointer', background: i === active ? 'var(--surface-active)' : undefined }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-raised)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="map-pin" size={15} /></span>
                  <span className="stack" style={{ gap: 2 }}><span style={{ fontSize: 'var(--fs-ui)' }}>{p.name}</span><span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-tertiary)' }}>{p.sub}</span></span>
                </div>
              ))}
              {q && results.length === 0 && <span style={{ padding: 12, fontSize: 'var(--fs-small)', color: 'var(--text-tertiary)' }}>No places match "{st.searchQ}" in {city.name}.</span>}
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
                  <span style={{ flex: 1, fontSize: 'var(--fs-small)' }}>{c.name}</span>
                  <span style={{ height: 20, padding: '0 6px', borderRadius: 'var(--radius-xs)', background: c.built ? 'var(--success-soft)' : 'var(--surface-raised)', color: c.built ? 'var(--success)' : 'var(--text-secondary)', fontSize: 'var(--fs-micro)', display: 'inline-flex', alignItems: 'center' }}>{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* status first (what the air is), then the one control, then data quality folded into one chip */}
      <div ref={dataRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div className="chip-row">
          {cm && ca && (
            <span className="chip" aria-label={`City average ${P.label}: ${ca.name}, ${Math.round(cm.median)} ${P.unit}`}>
              {P.k === 'pm25' && <span className="mono" style={{ minWidth: 30, height: 20, padding: '0 6px', borderRadius: 'var(--radius-pill)', background: ca.color, color: ca.ink, fontSize: 'var(--fs-micro)', display: 'grid', placeItems: 'center' }} title="PM2.5 sub-index (CPCB NAQI)">{aqiIndex(cm.median)}</span>}
              {P.k !== 'pm25' && <span style={{ width: 8, height: 8, borderRadius: 2, background: ca.color }} />}
              <span style={{ color: 'var(--text-primary)' }}>{ca.name}</span>
              <span className="mono">{P.k === 'co' ? cm.median.toFixed(1) : Math.round(cm.median)} {P.unit}</span>
            </span>
          )}
          {alertEvent && <span className="chip" style={{ color: 'var(--warning)' }}><Icon name="flame" size={13} />{alertEvent.title}</span>}
          <div className="sel-wrap" style={{ flex: 'none' }}>
            <select className="chip-select" aria-label="Pollutant" value={st.poll} onChange={(e) => set({ poll: e.target.value as typeof st.poll })}>
              {POLL.map((p) => {
                const f = st.fields[p.k], na = f === 'unavailable';
                return <option key={p.k} value={p.k} disabled={na || !f}>{p.label}{na ? ' (not forecast here yet)' : ''}</option>;
              })}
            </select>
            <span className="chev"><Icon name="chevron-down" size={14} /></span>
          </div>
          <button className="chip" aria-expanded={dataOpen} aria-controls="data-pop" onClick={() => setDataOpen((o) => !o)}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: data.dot }} />
            <span style={{ color: 'var(--text-primary)' }}>{data.label}</span>
            <span className="mono">{data.time}</span>
            <Icon name="chevron-down" size={13} />
          </button>
        </div>
        {dataOpen && (
          <div id="data-pop" className="popover" style={{ alignSelf: 'flex-start', width: 'min(340px,100%)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--fs-small)' }}>
            <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}><Icon name="refresh-cw" size={13} />{forecast}</span>
            <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: degr.c, flex: 'none' }} />
              {degr.src}, {degr.conf.toLowerCase()} confidence
            </span>
            <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 13 }}>
                <span style={{ width: 3, height: 5, borderRadius: 1, background: 'var(--text-primary)' }} />
                <span style={{ width: 3, height: 9, borderRadius: 1, background: sparse ? 'var(--border-strong)' : 'var(--text-primary)' }} />
                <span style={{ width: 3, height: 13, borderRadius: 1, background: 'var(--border-strong)' }} />
              </span>
              {sparse ? 'Few ground stations reporting: ranges are wider' : 'Ground stations reporting normally'}
            </span>
          </div>
        )}
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
        <div style={{ position: 'absolute', top: L.legendTop, right: 16, zIndex: 950, ...L.chromeHide }}>
          <div role="group" aria-label="Legend" className="legend popover">
            <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)', marginBottom: 2 }}>{legend.title}</span>
            {legend.rows.map((r) => (
              <span key={r.c} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)' }}>
                <span className="hexdot" style={{ background: r.c }} />
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.name}</span>
                <span className="mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>{r.range}</span>
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

      <div style={{ position: 'absolute', right: 16, bottom: L.stackBottom, zIndex: 950, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', transition: 'bottom var(--dur-slow) var(--ease-standard)', ...L.chromeHide }}>
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

      <span className="attrib" style={{ bottom: L.attribBottom }}>© OpenStreetMap contributors</span>
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
    <div className="scrub popover" style={{ left: L.scrubLeft, right: L.scrubRight, bottom: L.scrubBottom, ...L.chromeHide }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="play" onClick={() => set((s) => ({ playing: !s.playing }))} aria-label={st.playing ? 'Pause forecast animation' : 'Play forecast animation'}>
          <Icon name={st.playing ? 'pause' : 'play'} size={16} />
        </button>
        <div className="stack" style={{ flex: 'none', minWidth: L.tlabelW }}>
          <span style={{ fontSize: 'var(--fs-small)', fontWeight: 500, whiteSpace: 'nowrap' }}>{tl.short}</span>
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>+{st.t} h · IST</span>
        </div>
        <div style={{ flex: 1, position: 'relative', height: 44, minWidth: 0 }}>
          <svg viewBox="0 0 720 36" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', left: 8, right: 8, top: 2, width: 'calc(100% - 16px)', height: 30 }}>
            <path d={spark.band} fill="var(--surface-active)" />
            <path d={spark.line} fill="none" stroke="var(--text-secondary)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
            {midnights.map((t) => { const x = ((t / N) * 720).toFixed(1); return <line key={t} x1={x} x2={x} y1={0} y2={36} stroke="var(--border-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />; })}
          </svg>
          <input type="range" min={0} max={T} step={1} value={st.t} disabled={!F} onChange={(e) => set({ t: +e.target.value, playing: false })} aria-label="Forecast hour" aria-valuetext={`${tl.day} · ${tl.time} IST`} />
        </div>
      </div>
      {L.scrubFoot && F && (
        /* each day label sits at its own midnight tick (same 8px inset as the sparkline) */
        <div style={{ paddingLeft: L.scrubAttrPad }}>
          <div className="scrub-days" aria-hidden="true" style={{ margin: '0 8px' }}>
            {dayTicks(F).map((d, i) => {
              const at = i === 0 ? 0 : midnights[i - 1] / N;
              /* first label is the start time only (its day is in the time readout), so it never collides with the next tick */
              return <span key={i} style={{ left: `${(at * 100).toFixed(2)}%`, paddingLeft: i ? 4 : 0 }}>{i === 0 ? d.split(' ').pop() : d.split(' ')[0]}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
