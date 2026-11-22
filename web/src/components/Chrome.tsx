import { BUILDINGS, MODES, type BuildingKey, type ModeKey } from '../data/sora';
import { useSora, type Demo, type Tab } from '../state/store';
import type { Layout } from '../lib/layout';
import { Icon } from './Icon';

export const TABS: { k: Tab; label: string; short: string; icon: string }[] = [
  { k: 'live', label: 'Live map', short: 'Live', icon: 'map' },
  { k: 'trip', label: 'Plan a trip', short: 'Trip', icon: 'route' },
  { k: 'day', label: 'Plan my day', short: 'Day', icon: 'calendar-days' },
  { k: 'what', label: 'What if', short: 'What if', icon: 'message-circle-question' },
  { k: 'ins', label: 'Insights', short: 'Insights', icon: 'chart-column' },
];

function useTabPick(mob: boolean) {
  const { st, set } = useSora();
  return (k: Tab) => {
    if (st.tab === k && k !== 'ins') { set({ panelOpen: !st.panelOpen }); return; }
    set({ tab: k, panelOpen: true, pt: k === 'live' ? st.pt : null, pick: null, sheet: mob ? Math.max(1, st.sheet) : st.sheet });
  };
}

function NavTabs({ L, short }: { L: Layout; short: boolean }) {
  const { st } = useSora();
  const pick = useTabPick(L.mob);
  return (
    <>
      {TABS.map((t) => (
        <button key={t.k} role="tab" className="nav-tab" aria-selected={st.tab === t.k} aria-label={t.label} onClick={() => pick(t.k)}>
          <span className="pill"><Icon name={t.icon} size={18} /></span>
          {!short && <span className="lbl">{t.short}</span>}
        </button>
      ))}
    </>
  );
}

export function Rail({ L }: { L: Layout }) {
  const { st, set, toggleTheme } = useSora();
  const panelOpen = st.panelOpen && st.tab !== 'ins';
  const toggleLabel = st.panelOpen ? 'Hide side panel' : 'Show side panel';
  const themeLabel = st.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <nav aria-label="Main" className="rail noscroll">
      <a href="/" className="rail-home" aria-label="Sora home">
        <span style={{ color: 'var(--brand)', display: 'flex' }}><Icon name="hexmark" size={22} /></span>
        <span className="word">sora</span>
      </a>
      <button className="icon-btn" style={{ marginBottom: 12 }} onClick={() => set((s) => ({ panelOpen: !s.panelOpen, tab: s.tab === 'ins' ? 'live' : s.tab }))}
        aria-label={toggleLabel} aria-expanded={panelOpen} title={toggleLabel}>
        <Icon name="menu" size={20} />
      </button>
      <div role="tablist" aria-orientation="vertical" aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: L.railGap }}>
        <NavTabs L={L} short={L.shortRail} />
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button className="icon-btn muted" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}><Icon name={st.theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
        <button className="avatar" onClick={() => set((s) => ({ menuOpen: !s.menuOpen, cityOpen: false }))} aria-haspopup="menu" aria-expanded={st.menuOpen} aria-label="Settings and profile">AK</button>
      </div>
    </nav>
  );
}

export function TabBar({ L }: { L: Layout }) {
  return <nav role="tablist" aria-label="Sections" className="tabbar"><NavTabs L={L} short={false} /></nav>;
}

const DEMOS: [Demo, string, string][] = [
  ['none', 'Normal', 'circle'], ['loading', 'Loading forecast', 'loader'], ['offline', 'Backend unreachable', 'cloud-off'],
  ['degraded', 'Degraded data (CAMS only)', 'satellite'], ['unreliable', 'Options not reliably different', 'equal-approximately'],
  ['nofeasible', 'No feasible option', 'circle-slash'], ['notbuilt', 'City not yet built', 'construction'],
];

export function Select<T extends string>({ value, onChange, options, className = 'sel-sm', chevClass = '', label, style }: {
  value: T; onChange: (v: T) => void; options: { k: T; label: string }[]; className?: string; chevClass?: string; label?: string; style?: React.CSSProperties;
}) {
  return (
    <div className="sel-wrap" style={style}>
      <select className={className} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
      </select>
      <span className={'chev ' + chevClass}><Icon name="chevron-down" size={14} /></span>
    </div>
  );
}

export function ProfileMenu({ L }: { L: Layout }) {
  const { st, set, applyDemo, toggleTheme } = useSora();
  if (!st.menuOpen) return null;
  const themeLabel = st.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <div role="menu" className="menu popover" style={L.menuPos}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--surface-raised)', border: '1px solid var(--border-default)', display: 'grid', placeItems: 'center', fontWeight: 500 }}>AK</span>
        <span className="stack"><span style={{ fontSize: 13, fontWeight: 500 }}>Aanya Kapoor</span><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Routine stored on this device</span></span>
      </div>
      <div className="menu-sec">
        <span className="menu-cap">Preferences</span>
        <label className="pref-row">Default mode
          <Select<ModeKey> value={st.prefs.mode} options={MODES} onChange={(v) => set((s) => ({ prefs: { ...s.prefs, mode: v } }))} />
        </label>
        <label className="pref-row">Home building
          <Select<BuildingKey> value={st.prefs.bld} options={BUILDINGS} onChange={(v) => set((s) => ({ prefs: { ...s.prefs, bld: v } }))} />
        </label>
        <label className="stack" style={{ gap: 4, fontSize: 13 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>Extra minutes I'll accept<span className="mono">{st.prefs.extra} min</span></span>
          <input type="range" min={0} max={30} step={1} value={st.prefs.extra} onChange={(e) => set((s) => ({ prefs: { ...s.prefs, extra: +e.target.value } }))} style={{ width: '100%', accentColor: 'var(--brand)' }} />
        </label>
      </div>
      <div className="menu-sec tight">
        <span className="menu-cap" style={{ marginBottom: 4 }}>Preview states</span>
        {DEMOS.map(([k, l, i]) => (
          <button key={k} role="menuitemradio" aria-checked={st.demo === k} className="menu-item" onClick={() => applyDemo(k)}>
            <Icon name={i} size={15} /><span style={{ flex: 1 }}>{l}</span>{st.demo === k && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
      <div className="menu-sec tight">
        <button className="menu-item" onClick={toggleTheme}><Icon name={st.theme === 'dark' ? 'sun' : 'moon'} size={15} />{themeLabel}</button>
        <button className="menu-item" onClick={() => set({ onb: 0, menuOpen: false })}><Icon name="rotate-ccw" size={15} />Replay onboarding</button>
        <a className="menu-item" href="/styleguide"><Icon name="palette" size={15} />Styleguide</a>
      </div>
    </div>
  );
}
