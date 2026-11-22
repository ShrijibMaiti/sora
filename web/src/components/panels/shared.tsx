import type { ReactNode } from 'react';

export function PanelHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="stack g12">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="ph1">{title}</h1>
      {children}
    </header>
  );
}

export function SubTabs<K extends string>({ items, value, onPick }: { items: [K, string][]; value: K; onPick: (k: K) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="subtabs noscroll">
      {items.map(([k, l]) => <button key={k} role="tab" className="subtab" aria-selected={value === k} onClick={() => onPick(k)}>{l}</button>)}
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
