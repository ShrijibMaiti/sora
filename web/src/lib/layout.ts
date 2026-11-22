import type { CSSProperties } from 'react';
import type { State } from '../state/store';

/** Geometry of the floating rail / panel / map overlays (port of v4's layout block). */
export function computeLayout(st: State) {
  const { w, h } = st;
  const mob = w < 768;
  const wsH = h - (mob ? 68 : 0);
  const snaps = [120, Math.round(wsH * 0.5), Math.round(wsH * 0.9)];
  const sheetH = st.drag != null ? st.drag : snaps[st.sheet];
  const panelShow = st.tab !== 'ins';
  /* panel scales with the window so the map keeps room for search + chips (≈ clamp(380,30vw,460); Day clamp(440,36vw,540)) */
  const clamp = (lo: number, v: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  const pw = st.tab === 'day' ? clamp(440, w * 0.36, 540) : clamp(380, w * 0.3, 460);
  const open = st.panelOpen && panelShow;
  const mapW = open ? w - 84 - pw : w - 84;
  const compact = mob || mapW < 640;
  /* phone sheet high enough to collide with the floating chrome (~260px tall): hide the chrome so the answer is never covered */
  const chromeHidden = mob && open && sheetH > wsH - 260;
  const chromeHide: CSSProperties = chromeHidden ? { opacity: 0, visibility: 'hidden', pointerEvents: 'none' } : {};

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
    mob, open, pw, wsH, snaps, sheetH, panelShow, panel, layoutKey: [mob, panelShow, pw].join(), chromeHidden, chromeHide,
    attribBottom: mob && open ? sheetH + 4 : 2,
    rail: !mob,
    railGap: h < 640 ? 2 : 6,
    shortRail: h < 640 && !mob,
    panelPad: mob ? '8px 24px 40px' : '28px 28px 40px',
    floatLeft: mob ? 12 : open ? pw + 112 : 100,
    floatRight: mob ? 12 : w >= 1100 ? 236 : 76,
    searchW: mob ? '100%' : 'min(400px,100%)',
    legendTop: mob ? 132 : 16,
    legendFull: w >= 1100 || st.legendOpen,
    legendBtn: w < 1100,
    /* Layers lives in the right-hand control stack at every size, freeing the bottom-left for the time bar */
    layersTile: false,
    layersRound: true,
    layersLeft: open && !mob ? pw + 112 : 100,
    insInset: mob ? '0' : '12px 12px 12px 96px',
    insRadius: mob ? 0 : 24,
    insPad: mob ? '32px 20px' : 'clamp(48px,6vw,88px) clamp(20px,4vw,48px)',
    insSpan: w >= 900 ? 'span 2' : 'auto',
    scrubLeft: mob ? 12 : open ? pw + 112 : 100,
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
