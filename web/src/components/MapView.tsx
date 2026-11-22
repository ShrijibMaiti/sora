import { useEffect, useReducer, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AQI, CITIES, FIRES, PLACES, POLL, STATIONS, UNC, ROUTE, coverage, hexGrid, hexPoly, inBbox, sample, type LatLng, type RouteId } from '../data/sora';
import { cityOf, useSora } from '../state/store';
import type { Layout } from '../lib/layout';
import { Icon, flameSvg } from './Icon';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Hex = { la: number; lo: number; cov: number; poly: L.Polygon };

export function MapView({ L: lay }: { L: Layout }) {
  const { st, set, ref, mapRef, runPlan, selectOpt } = useSora();
  const el = useRef<HTMLDivElement>(null);
  const g = useRef<{ hexes: Hex[]; stations: L.LayerGroup; fires: L.LayerGroup; wind: L.LayerGroup; routes: L.LayerGroup; stops: L.LayerGroup; tiles?: L.TileLayer; labels?: L.TileLayer; fitKey?: string } | null>(null);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const layRef = useRef(lay);
  layRef.current = lay;

  /* init once */
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 9, maxZoom: 15, zoomSnap: 0.5 })
      .setView([28.62, 77.17], window.innerWidth < 768 ? 10 : 11);
    mapRef.current = map;
    const renderer = L.canvas({ padding: 0.4 });
    const r = 0.0105;
    const hexes = hexGrid(CITIES[0].demo_bbox, r).map(([la, lo]) => ({
      la, lo, cov: coverage(la, lo),
      poly: L.polygon(hexPoly(la, lo, r, 0.86), { renderer, stroke: false, fillOpacity: 0.5, interactive: false }),
    }));
    L.layerGroup(hexes.map((h) => h.poly)).addTo(map);
    const stations = L.layerGroup(STATIONS.map((s) => L.marker([s[0], s[1]], {
      keyboard: false,
      icon: L.divIcon({ className: '', iconSize: [12, 12], html: '<div style="width:10px;height:10px;margin:1px;transform:rotate(45deg);background:var(--surface-raised);border:1.5px solid var(--text-primary)"></div>' }),
    }).bindTooltip(s[2] + ' · station', { direction: 'top', offset: [0, -6] })));
    const fires = L.layerGroup(FIRES.map((f) => L.marker(f, {
      keyboard: false,
      icon: L.divIcon({ className: '', iconSize: [22, 22], html: '<div style="width:22px;height:22px;border-radius:6px;background:var(--surface-overlay);border:1px solid var(--warning);display:grid;place-items:center;color:var(--warning)">' + flameSvg(13) + '</div>' }),
    }).bindTooltip('Active fire · satellite', { direction: 'top', offset: [0, -10] })));
    g.current = { hexes, stations, fires, wind: L.layerGroup(), routes: L.layerGroup().addTo(map), stops: L.layerGroup().addTo(map) };

    map.on('click', (e: L.LeafletMouseEvent) => {
      const s = ref.current, ll: LatLng = [e.latlng.lat, e.latlng.lng];
      if (s.pick) {
        const k = s.pick;
        set({ custom: { ...s.custom, [k]: ll }, trip: { ...s.trip, [k]: 'custom_' + k }, pick: null });
        runPlan();
        return;
      }
      set({ pt: ll, layersOpen: false, sub: { ...s.sub, live: 'overview' } });
    });
    let raf = 0;
    map.on('move zoom', () => { if (ref.current.pt && !raf) raf = requestAnimationFrame(() => { raf = 0; tick(); }); });
    return () => { cancelAnimationFrame(raf); map.remove(); mapRef.current = null; g.current = null; };
  }, [mapRef, ref, set, runPlan]);

  /* basemap per theme */
  useEffect(() => {
    const map = mapRef.current, G = g.current;
    if (!map || !G) return;
    const th = st.theme === 'light' ? 'Light' : 'Dark';
    if (G.tiles) { map.removeLayer(G.tiles); map.removeLayer(G.labels!); }
    const base = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + th;
    G.tiles = L.tileLayer(base + '_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(map);
    G.labels = L.tileLayer(base + '_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'shadowPane', opacity: 0.8 }).addTo(map);
  }, [st.theme, mapRef]);

  /* hex field */
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    const dark = st.theme !== 'light', empty = dark ? '#2a2c31' : '#d5d9e0', op = dark ? 0.36 : 0.34;
    for (const h of G.hexes) {
      let fill: string, fo: number;
      if (h.cov < 0.05) { fill = empty; fo = 0.8; }
      else {
        const s = sample(st.t, h.la, h.lo, st.poll);
        if (st.unc) { const rel = (s.p95 - s.p05) / s.median; fill = UNC[Math.max(0, Math.min(7, Math.round(((rel - 0.2) / 0.55) * 7)))]; fo = 0.72; }
        else { fill = AQI[s.cat].color; fo = op; }
      }
      h.poly.setStyle({ fillColor: fill, fillOpacity: fo });
    }
  }, [st.t, st.poll, st.unc, st.theme]);

  /* layer toggles */
  useEffect(() => {
    const map = mapRef.current, G = g.current;
    if (!map || !G) return;
    ([['stations', G.stations], ['fires', G.fires], ['wind', G.wind]] as const).forEach(([k, grp]) => (st.lay[k] ? grp.addTo(map) : map.removeLayer(grp)));
  }, [st.lay, mapRef]);

  /* wind arrows */
  useEffect(() => {
    const G = g.current;
    if (!G || !st.lay.wind) return;
    G.wind.clearLayers();
    const h = (14 + st.t) % 24, dir = 128 + 18 * Math.sin(st.t / 6), spd = 1.6 + 1.4 * Math.exp(-Math.pow(((h - 14 + 24) % 24), 2) / 18);
    const len = Math.round(10 + spd * 5);
    for (let la = 28.45; la < 28.86; la += 0.07) for (let lo = 76.9; lo < 77.34; lo += 0.08) {
      G.wind.addLayer(L.marker([la, lo], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [30, 30], html: '<div style="width:30px;height:30px;display:grid;place-items:center;transform:rotate(' + dir.toFixed(0) + 'deg);color:var(--text-primary);opacity:.7"><svg width="6" height="' + len + '" viewBox="0 0 6 ' + len + '"><path d="M3 ' + len + 'V2M0.5 5L3 1.5 5.5 5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg></div>' }),
      }));
    }
  }, [st.t, st.lay.wind]);

  /* routes + stops */
  const res = st.res;
  const resKey = res ? (res.error ? res.error : JSON.stringify(res.baseline.path[0]) + res.options[0].dose.median + res.options.map((o) => o.path.length).join()) : '';
  useEffect(() => {
    const map = mapRef.current, G = g.current;
    if (!map || !G) return;
    G.routes.clearLayers(); G.stops.clearLayers();
    const pin = (ll: LatLng, kind: 'start' | 'end' | 'stop', label = '') => L.marker(ll, {
      keyboard: false,
      icon: L.divIcon({
        className: '', iconSize: [18, 18],
        html: kind === 'start' ? '<div style="width:16px;height:16px;margin:1px;border-radius:50%;border:3px solid var(--text-primary);background:var(--route-halo)"></div>'
          : kind === 'end' ? '<div style="width:14px;height:14px;margin:2px;border-radius:3px;background:var(--text-primary);border:2px solid var(--route-halo)"></div>'
            : '<div style="width:22px;height:22px;margin:-2px;border-radius:6px;background:var(--surface-overlay);border:1px solid var(--border-strong);display:grid;place-items:center;font:500 11px Geist Mono;color:var(--text-primary)">' + label + '</div>',
      }),
    });
    if ((st.tab === 'trip' || st.tab === 'what') && res && !res.error) {
      const all = [res.baseline, ...res.options].filter((o) => st.tab === 'trip' || o.id === 'plan' || o.id === 'B');
      all.sort((a, b) => Number(a.id === st.sel) - Number(b.id === st.sel));
      for (const o of all) {
        const R = ROUTE[o.id as RouteId], on = o.id === st.sel || st.tab === 'what', w = R.w + (on ? 1 : 0);
        L.polyline(o.path, { color: css('--route-halo'), weight: w + 4, opacity: on ? 0.95 : 0.6, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(G.routes);
        L.polyline(o.path, { color: css(R.token), weight: w, opacity: on ? 1 : 0.55, dashArray: R.dash || undefined, lineCap: 'round', lineJoin: 'round' })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); selectOpt(o.id); }).bindTooltip(o.label).addTo(G.routes);
      }
      const bp = res.baseline.path;
      pin(bp[0], 'start').addTo(G.stops); pin(bp[bp.length - 1], 'end').addTo(G.stops);
      const key = bp[0].join() + bp[bp.length - 1].join();
      if (G.fitKey !== key) {
        G.fitKey = key;
        const l = layRef.current, left = (l.open && !l.mob ? l.pw + 96 : 96) + 48;
        map.fitBounds(L.latLngBounds(res.options.flatMap((o) => o.path)), { paddingTopLeft: [left, 150], paddingBottomRight: [80, 140], maxZoom: 13 });
      }
    }
    if (st.tab === 'day') {
      const P = Object.fromEntries(PLACES.map((p) => [p.k, p.ll])) as Record<string, LatLng>;
      ([['lajpat', 'H'], ['iitd', '1'], ['greenpark', '2'], ['khan', '3']] as const).forEach(([k, l]) => pin(P[k], 'stop', l).addTo(G.stops));
      L.polyline([P.lajpat, P.iitd, P.greenpark, P.khan, P.lajpat], { color: css('--route-b'), weight: 3, opacity: 0.9, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(G.routes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.tab, st.sel, st.theme, resKey, mapRef, selectOpt]);

  /* city */
  useEffect(() => { mapRef.current?.setView(cityOf(st.city).center, window.innerWidth < 768 ? 10 : 11); }, [st.city, mapRef]);

  /* panel geometry changed → map size */
  useEffect(() => { const id = setTimeout(() => mapRef.current?.invalidateSize(), 30); return () => clearTimeout(id); }, [lay.layoutKey, mapRef]);

  return (
    <>
      <div ref={el} className="map" role="application" aria-label={`Map of ${cityOf(st.city).name} with pollution field`} />
      <PointPopover />
    </>
  );
}

function PointPopover() {
  const { st, set, mapRef } = useSora();
  const map = mapRef.current;
  if (!st.pt || !map) return null;
  const p = map.latLngToContainerPoint(st.pt), sz = map.getSize();
  if (p.x < 0 || p.y < 0 || p.x > sz.x || p.y > sz.y) return null;
  const city = cityOf(st.city), inside = city.built && inBbox(st.pt[0], st.pt[1]);
  const P = POLL.find((x) => x.k === st.poll)!;
  const s = sample(st.t, st.pt[0], st.pt[1], st.poll), c = AQI[s.cat];
  const v = pointText(st.t, s, st.poll === 'co');
  const flipX = p.x > sz.x - 260, flipY = p.y < 150;
  const line = { position: 'absolute', opacity: 0.6, pointerEvents: 'none', zIndex: 700 } as const;
  return (
    <>
      <div aria-hidden="true" style={{ ...line, left: 0, right: 0, top: p.y, borderTop: '1px dashed var(--text-secondary)' }} />
      <div aria-hidden="true" style={{ ...line, top: 0, bottom: 0, left: p.x, borderLeft: '1px dashed var(--text-secondary)' }} />
      <div role="dialog" aria-label="Point estimate" className="popover" style={{
        position: 'absolute', left: p.x, top: p.y, transform: `translate(${flipX ? 'calc(-100% - 12px)' : '12px'},${flipY ? '12px' : 'calc(-100% - 12px)'})`,
        width: 236, borderColor: 'var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 820,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtCoords(st.pt)}</span>
          <button onClick={() => set({ pt: null })} aria-label="Close" style={{ width: 24, height: 24, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', marginRight: -6 }}><Icon name="x" size={13} /></button>
        </div>
        {inside ? (
          <div className="stack g6">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span className="sw" style={{ background: c.color }} />
              <span>{P.label} <span className="mono">~{v.val} {P.unit}</span> <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({v.lo}–{v.hi})</span></span>
            </span>
            <span style={{ fontSize: 12 }}>{c.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Confidence: {v.conf}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Outside the covered area. No estimate here.</span>
        )}
      </div>
    </>
  );
}

export const fmtCoords = (pt: LatLng) => pt[0].toFixed(4) + '° N, ' + pt[1].toFixed(4) + '° E';
export function pointText(t: number, s: ReturnType<typeof sample>, co: boolean) {
  const r = (n: number) => n.toFixed(co ? 1 : 0);
  const conf = s.coverage > 0.6 && t < 24 ? 'high (dense monitoring)'
    : s.coverage > 0.3 ? 'moderate (' + (t > 36 ? 'longer lead time' : 'moderate monitoring') + ')' : 'low (sparse monitoring)';
  return { val: r(s.median), lo: r(s.p05), hi: r(s.p95), conf };
}
