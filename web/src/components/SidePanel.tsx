import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { useSora } from '../state/store';
import type { Layout } from '../lib/layout';
import { LivePanel } from './panels/LivePanel';
import { TripPanel } from './panels/TripPanel';
import { DayPanel } from './panels/DayPanel';
import { WhatIfPanel } from './panels/WhatIfPanel';

const LABEL = { live: 'Live map panel', trip: 'Trip planner', day: 'Day planner', what: 'What if', ins: 'Insights' };

export function SidePanel({ L }: { L: Layout }) {
  const { st, set } = useSora();
  const moved = useRef(false);
  if (!L.panelShow) return null;

  /* mobile bottom sheet: drag between snaps 120 / 50% / 90%, tap to cycle */
  const onDown = (e: RPointerEvent) => {
    const y0 = e.clientY, h0 = L.sheetH;
    moved.current = false;
    let last: number | null = null;
    const mv = (ev: PointerEvent) => {
      const d = y0 - ev.clientY;
      if (Math.abs(d) > 4) moved.current = true;
      last = Math.max(80, Math.min(L.wsH, h0 + d));
      set({ drag: last });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (last != null) {
        const h = last;
        let bi = 0;
        L.snaps.forEach((s, i) => { if (Math.abs(s - h) < Math.abs(L.snaps[bi] - h)) bi = i; });
        set({ drag: null, sheet: bi });
      }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  return (
    <aside aria-label={LABEL[st.tab]} className="panel" style={L.panel}>
      {L.mob && (
        <button className="sheet-handle" onPointerDown={onDown} aria-label={['Expand panel', 'Expand panel fully', 'Collapse panel'][st.sheet]}
          onClick={() => { if (moved.current) { moved.current = false; return; } set((s) => ({ sheet: (s.sheet + 1) % 3 })); }}>
          <span />
        </button>
      )}
      <div className="panel-scroll" style={{ padding: L.panelPad }}>
        {st.booting ? (
          <div aria-busy="true" aria-label="Loading forecast" className="stack g12">
            <span className="pulse" style={{ height: 20, width: '45%', borderRadius: 4, background: 'var(--surface-overlay)' }} />
            <span className="pulse" style={{ height: 120, borderRadius: 'var(--radius-lg)', background: 'var(--surface-raised)' }} />
            <span className="pulse" style={{ height: 14, width: '80%', borderRadius: 4, background: 'var(--surface-overlay)' }} />
            <span className="pulse" style={{ height: 14, width: '60%', borderRadius: 4, background: 'var(--surface-overlay)' }} />
            <span className="pulse" style={{ height: 180, borderRadius: 'var(--radius-lg)', background: 'var(--surface-raised)' }} />
          </div>
        ) : st.tab === 'live' ? <LivePanel /> : st.tab === 'trip' ? <TripPanel /> : st.tab === 'day' ? <DayPanel /> : st.tab === 'what' ? <WhatIfPanel /> : null}
      </div>
    </aside>
  );
}
