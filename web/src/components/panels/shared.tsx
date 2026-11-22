import type { ReactNode } from 'react';

/** Answer-first panel header: the heading states the result, `sub` carries its numbers (no kicker labels). */
export function PanelHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="stack g12">
      <h1 className="ph1">{title}</h1>
      {sub && <p className="ph-sub">{sub}</p>}
      {children}
    </header>
  );
}

/** View switcher inside a panel: a labelled group of pressed-state buttons. */
export function SubTabs<K extends string>({ items, value, onPick, label = 'View' }: { items: [K, string][]; value: K; onPick: (k: K) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="subtabs noscroll">
      {items.map(([k, l]) => <button key={k} className="subtab" aria-pressed={value === k} onClick={() => onPick(k)}>{l}</button>)}
    </div>
  );
}

export const Disclaimer = () => <p className="disclaimer">Estimates, not measurements. Lower exposure doesn't mean safe.</p>;

export function Meter({ colors, height = 6 }: { colors: string[]; height?: number }) {
  return <span className="meter" style={{ height }}>{colors.map((c, i) => <span key={i} style={{ background: c }} />)}</span>;
}

export function Dl({ rows, gap = '16px 24px', fontSize = 14 }: { rows: [string, ReactNode, React.CSSProperties?][]; gap?: string; fontSize?: number }) {
  return (
    <dl className="dl" style={{ gap, fontSize }}>
      {rows.map(([k, v, s]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt className="eyebrow">{k}</dt>
          <dd style={s}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
