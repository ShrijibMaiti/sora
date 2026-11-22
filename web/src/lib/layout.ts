import type { CSSProperties } from 'react';
import type { State } from '../state/store';

/** Geometry of the floating rail / panel / map overlays (port of v4's layout block). */
export function computeLayout(st: State) {
  const { w, h } = st;
  const mob = w < 768, tablet = w < 1100;
  const wsH = h - (mob ? 68 : 0);
  const snaps = [120, Math.round(wsH * 0.5), Math.round(wsH * 0.9)];
  const sheetH = st.drag != null ? st.drag : snaps[st.sheet];
  const panelShow = st.tab !== 'ins';
  const pw = st.tab === 'day' ? (tablet ? 480 : 600) : tablet ? 420 : 500;
  const open = st.panelOpen && panelShow;
  const mapW = open ? w - 84 - pw : w - 84;
  const tight = open && w - 84 - pw < 760;
  const compact = mob || mapW < 640;

  const panel: CSSProperties = mob
    ? {
      position: 'absolute', left: 0, right: 0, bottom: 0, height: sheetH, borderTop: '1px solid var(--border-default)', borderRadius: '20px 20px 0 0',
      boxShadow: 'var(--shadow-overlay)', transform: `translateY(${open ? '0' : '110%'})`,
      transition: st.drag != null ? 'none' : 'height var(--dur-slow) var(--ease-standard),transform var(--dur-slow) var(--ease-standard)',
    }
    : {
      position: 'absolute', left: 96, top: 12, bottom: 12, width: pw, border: '1px solid var(--border-default)', borderRadius: 24, overflow: 'hidden',
      boxShadow: 'var(--shadow-overlay)', transform: `translateX(${open ? '0' : '-24px'}) scale(${open ? 1 : 0.98})`, transformOrigin: 'left center',
      opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', visibility: open ? 'visible' : 'hidden',
      transition: `transform var(--dur-slow) var(--ease-enter),opacity var(--dur-base) var(--ease-standard),visibility 0s linear ${open ? '0s' : '360ms'}`,
    };

  return {
    mob, open, pw, wsH, snaps, sheetH, panelShow, panel, layoutKey: [mob, panelShow, pw].join(),
    rail: !mob,
    railGap: h < 640 ? 2 : 6,
    shortRail: h < 640 && !mob,
    panelPad: mob ? '8px 24px 40px' : '40px 40px 40px',
    floatLeft: mob ? 12 : open ? pw + 112 : 100,
    floatRight: mob ? 12 : w >= 1100 ? 236 : 76,
    searchW: mob ? '100%' : '400px',
    legendTop: mob ? 132 : 16,
    legendFull: w >= 1100 || st.legendOpen,
    legendBtn: w < 1100,
    layersTile: !mob && !tight,
    layersRound: mob || tight,
    layersLeft: open && !mob ? pw + 112 : 100,
    insInset: mob ? '0' : '12px 12px 12px 96px',
    insRadius: mob ? 0 : 24,
    insPad: mob ? '32px 20px' : 'clamp(48px,6vw,88px) clamp(20px,4vw,48px)',
    insSpan: w >= 900 ? 'span 2' : 'auto',
    scrubLeft: mob ? 12 : open ? pw + (tight ? 112 : 204) : 192,
    scrubRight: mob ? 68 : 80,
    scrubBottom: mob ? (open ? sheetH : 0) + 12 : 20,
    stackBottom: mob ? (open ? sheetH : 0) + 12 : 20,
    menuPos: (mob ? { right: 12, top: 76 } : { left: 96, bottom: 16 }) as CSSProperties,
    scrubFoot: !compact,
    tlabelW: compact ? 0 : 120,
    scrubAttrPad: compact ? 0 : 172,
  };
}

export type Layout = ReturnType<typeof computeLayout>;
