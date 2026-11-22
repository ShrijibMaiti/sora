import { useSora } from './state/store';
import { computeLayout } from './lib/layout';
import { ProfileMenu, Rail, TabBar } from './components/Chrome';
import { MapView } from './components/MapView';
import { SidePanel } from './components/SidePanel';
import { FloatTop, MapControls, TimeScrubber } from './components/MapChrome';
import { BootOverlay, FullState, Onboarding } from './components/Overlays';
import { Insights } from './components/Insights';

/** Sora App v4: full-bleed map, floating rail + slide-over panel (bottom sheet + tab bar on mobile). */
export default function App() {
  const { st } = useSora();
  const L = computeLayout(st);
  return (
    <div className="root" style={{ flexDirection: L.mob ? 'column' : 'row' }}>
      {L.rail && <Rail L={L} />}
      <ProfileMenu L={L} />
      <div className="ws">
        <MapView L={L} />
        <SidePanel L={L} />
        <FloatTop L={L} />
        <MapControls L={L} />
        <TimeScrubber L={L} />
        <BootOverlay />
        <FullState />
        <Insights L={L} />
      </div>
      {L.mob && <TabBar L={L} />}
      <Onboarding />
    </div>
  );
}
