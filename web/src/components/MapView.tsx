import { useEffect, useReducer, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AQI, PLACES, POLL, UNC, ROUTE, hexGrid, hexPoly, inBbox, recOf, routeToken, type LatLng, type RouteId, type Sample } from '../data/sora';
import { activeField, cityOf, useSora } from '../state/store';
import { covFloor, sampleField } from '../lib/field';
import type { Layout } from '../lib/layout';
import { Icon, flameSvg } from './Icon';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* Leaflet race: a canvas redraw queued on the next frame can fire after map.remove() has dropped the context
   (React dev double-mount, fast unmounts). Skip the redraw when the renderer is gone. */
{
  const proto = L.Canvas.prototype as unknown as { _redraw: () => void; _ctx?: CanvasRenderingContext2D };
  const redraw = proto._redraw;
  proto._redraw = function (this: typeof proto) { if (this._ctx) redraw.call(this); };
}
type Hex = { la: number; lo: number; cov: number; poly: L.Polygon };

export function MapView({ L: lay }: { L: Layout }) {
  const { st, set, ref, mapRef, runPlan, selectOpt } = useSora();
  const el = useRef<HTMLDivElement>(null);
  const g = useRef<{ hexes: Hex[]; field: L.LayerGroup; renderer: L.Canvas; stations: L.LayerGroup; fires: L.LayerGroup; wind: L.LayerGroup; routes: L.LayerGroup; stops: L.LayerGroup; tiles?: L.TileLayer; labels?: L.TileLayer; fitKey?: string } | null>(null);
  const F = activeField(st), pm = st.fields.pm25 && st.fields.pm25 !== 'unavailable' ? st.fields.pm25 : null;
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const layRef = useRef(lay);
  layRef.current = lay;

  /* init once */
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 9, maxZoom: 15, zoomSnap: 0.5 })
      .setView([28.62, 77.17], window.innerWidth < 768 ? 10 : 11);
    mapRef.current = map;
    g.current = {
      hexes: [], field: L.layerGroup().addTo(map), renderer: L.canvas({ padding: 0.4 }), stations: L.layerGroup(), fires: L.layerGroup(), wind: L.layerGroup(),
      routes: L.layerGroup().addTo(map), stops: L.layerGroup().addTo(map),
    };

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

  /* basemap: OSM raster restyled to graphite by the .sora-tiles filter (theme handled in CSS).
     shortcut: tile.openstreetmap.org is for light use only; switch to a keyed provider before public launch. */
  useEffect(() => {
    const map = mapRef.current, G = g.current;
    if (!map || !G || G.tiles) return;
    G.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: 'sora-tiles' }).addTo(map);
  }, [mapRef]);

  /* hexes, stations, fires: rebuilt when a city's PM2.5 field (re)loads */
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    G.field.clearLayers(); G.stations.clearLayers(); G.fires.clearLayers(); G.hexes = [];
    if (!pm) return;
    const r = 0.0105, masked = covFloor(pm) > 0;
    G.hexes = hexGrid(cityOf(pm.city).bbox, r).map(([la, lo]) => ({
      la, lo, cov: masked ? sampleField(pm, 0, la, lo).coverage : 1,
      poly: L.polygon(hexPoly(la, lo, r, 0.86), { renderer: G.renderer, stroke: false, fillOpacity: 0, interactive: false }).addTo(G.field),
    }));
    pm.stations.forEach((s) => L.marker([s.lat, s.lon], {
      keyboard: false,
      icon: L.divIcon({ className: '', iconSize: [12, 12], html: `<div style="width:10px;height:10px;margin:1px;transform:rotate(45deg);background:var(--surface-raised);border:1.5px solid ${s.reporting ? 'var(--text-primary)' : 'var(--text-tertiary)'}"></div>` }),
    }).bindTooltip(s.name + ' · station' + (s.reporting ? '' : ' · not reporting'), { direction: 'top', offset: [0, -6] }).addTo(G.stations));
    pm.fires.forEach((f) => L.marker(f, {
      keyboard: false,
      icon: L.divIcon({ className: '', iconSize: [22, 22], html: '<div style="width:22px;height:22px;border-radius:6px;background:var(--surface-overlay);border:1px solid var(--warning);display:grid;place-items:center;color:var(--warning)">' + flameSvg(13) + '</div>' }),
    }).bindTooltip('Active fire · satellite', { direction: 'top', offset: [0, -10] }).addTo(G.fires));
  }, [pm]);

  /* hex colours */
  useEffect(() => {
    const G = g.current;
    if (!G || !F) return;
    /* the canvas renderer can't read CSS variables: resolve the token palette once per pass */
    /* on Trip / What if the field steps back so the routes lead */
    const empty = css('--hex-empty'), op = (parseFloat(css('--field-opacity')) || 0.36) * (st.tab === 'trip' || st.tab === 'what' ? 0.5 : 1);
    const aqi = AQI.map((a) => css(a.v)), unc = UNC.map((_, i) => css(`--unc-${i + 1}`));
    for (const h of G.hexes) {
      let fill: string, fo: number;
      if (h.cov < 0.05) { fill = empty; fo = 0.8; }
      else {
        const s = sampleField(F, st.t, h.la, h.lo);
        if (st.unc) { fill = unc[Math.max(0, Math.min(7, Math.round(((s.spread - 0.2) / 0.55) * 7)))]; fo = 0.72; }
        else { fill = aqi[s.cat]; fo = op; }
      }
      h.poly.setStyle({ fillColor: fill, fillOpacity: fo });
    }
  }, [F, st.t, st.unc, st.theme, st.tab]); // runs after the rebuild effect above in the same commit

  /* layer toggles */
  useEffect(() => {
    const map = mapRef.current, G = g.current;
    if (!map || !G) return;
    ([['stations', G.stations], ['fires', G.fires], ['wind', G.wind]] as const).forEach(([k, grp]) => (st.lay[k] ? grp.addTo(map) : map.removeLayer(grp)));
  }, [st.lay, mapRef]);

  /* wind arrows (city-mean wind from the field response) */
  useEffect(() => {
    const G = g.current;
    if (!G || !st.lay.wind || !pm) return;
    G.wind.clearLayers();
    const i = Math.max(0, Math.min(pm.wind.dir_deg.length - 1, Math.round(st.t))), dir = pm.wind.dir_deg[i], spd = pm.wind.speed_ms[i];
    const len = Math.round(10 + spd * 5), [s, w, n, e] = cityOf(pm.city).bbox;
    for (let la = s + 0.05; la < n; la += 0.07) for (let lo = w + 0.06; lo < e; lo += 0.08) {
      G.wind.addLayer(L.marker([la, lo], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [30, 30], html: '<div style="width:30px;height:30px;display:grid;place-items:center;transform:rotate(' + dir.toFixed(0) + 'deg);color:var(--text-primary);opacity:.7"><svg width="6" height="' + len + '" viewBox="0 0 6 ' + len + '"><path d="M3 ' + len + 'V2M0.5 5L3 1.5 5.5 5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg></div>' }),
      }));
    }
  }, [st.t, st.lay.wind, pm]);

  /* routes + stops */
  const res = st.res;
  const resKey = res ? (res.error ? res.error : JSON.stringify(res.baseline.path[0]) + res.options[0].dose.median + res.options.map((o) => o.path.length).join() + res.reliable + res.recommended) : '';
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
            : '<div style="width:22px;height:22px;margin:-2px;border-radius:6px;background:var(--surface-overlay);border:1px solid var(--border-strong);display:grid;place-items:center;font:500 11px var(--font-mono);color:var(--text-primary)">' + label + '</div>',
      }),
    });
    if ((st.tab === 'trip' || st.tab === 'what') && res && !res.error) {
      /* What if asks about your own trip, so only that route is drawn; colours follow the honest recommendation */
      const rec = recOf(res);
      const all = [res.baseline, ...res.options].filter((o) => st.tab === 'trip' || o.id === 'plan');
      all.sort((a, b) => Number(a.id === st.sel) - Number(b.id === st.sel));
      for (const o of all) {
        /* colour follows the recommendation (blue = recommended); dash stays per option for colour-blind reading */
        const R = ROUTE[o.id as RouteId], on = o.id === st.sel || st.tab === 'what', w = (o.id === 'plan' ? 3 : o.id === rec ? 5 : 4) + (on ? 1 : 0);
        L.polyline(o.path, { color: css('--route-halo'), weight: w + 4, opacity: on ? 0.95 : 0.6, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(G.routes);
        L.polyline(o.path, { color: css(routeToken(o.id, rec)), weight: w, opacity: on ? 1 : 0.55, dashArray: R.dash || undefined, lineCap: 'round', lineJoin: 'round' })
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
      L.polyline([P.lajpat, P.iitd, P.greenpark, P.khan, P.lajpat], { color: css('--text-primary'), weight: 3, opacity: 0.8, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(G.routes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.tab, st.sel, st.theme, resKey, mapRef, selectOpt]);

  /* city: centre it in the visible map, not under the open panel */
  useEffect(() => {
    const map = mapRef.current, l = layRef.current;
    if (!map) return;
    map.setView(cityOf(st.city).center, l.mob ? 10 : 11, { animate: false });
    if (l.open && !l.mob) map.panBy([-(l.pw + 96) / 2, 0], { animate: false });
  }, [st.city, mapRef]);

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
  const city = cityOf(st.city), F = activeField(st), inside = !!F && city.built && inBbox(st.pt[0], st.pt[1], city.bbox);
  const P = POLL.find((x) => x.k === (F?.pollutant ?? st.poll))!;
  if (!F) return null;
  const s = sampleField(F, st.t, st.pt[0], st.pt[1]), c = AQI[s.cat];
  const v = pointText(st.t, s, F.pollutant === 'co');
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
          <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-tertiary)' }}>{fmtCoords(st.pt)}</span>
          <button onClick={() => set({ pt: null })} aria-label="Close point estimate" style={{ width: 44, height: 44, margin: '-12px -16px -12px 0', border: 0, background: 'transparent', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}><Icon name="x" size={13} /></button>
        </div>
        {inside ? (
          <div className="stack g6">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-label)' }}>
              <span className="sw" style={{ background: c.color }} />
              <span>{P.label} <span className="mono">~{v.val} {P.unit}</span> <span className="mono" style={{ color: 'var(--text-tertiary)' }}>({v.lo}–{v.hi})</span></span>
            </span>
            <span style={{ fontSize: 'var(--fs-label)' }}>{c.name}</span>
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-secondary)' }}>Confidence: {v.conf}</span>
          </div>
        ) : (
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>Outside the covered area. No estimate here.</span>
        )}
      </div>
    </>
  );
}

export const fmtCoords = (pt: LatLng) => pt[0].toFixed(4) + '° N, ' + pt[1].toFixed(4) + '° E';
export function pointText(t: number, s: Sample, co: boolean) {
  const r = (n: number) => n.toFixed(co ? 1 : 0);
  const conf = s.coverage > 0.6 && t < 24 ? 'high (dense monitoring)'
    : s.coverage > 0.3 ? 'moderate (' + (t > 36 ? 'longer lead time' : 'moderate monitoring') + ')' : 'low (sparse monitoring)';
  return { val: r(s.median), lo: r(s.p05), hi: r(s.p95), conf };
}
