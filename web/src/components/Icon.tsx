import type { CSSProperties } from 'react';
import {
  ArrowLeftRight, ArrowRight, ArrowUpRight, Copy, Bike, Bus, CalendarDays, Car, ChartColumn, Check, ChevronDown, Circle, CircleDashed, CircleSlash, Clock, ClockAlert,
  CloudFog, CloudOff, CloudRain, Construction, Crosshair, Dumbbell, EqualApproximately, Flag, Flame, Footprints, GraduationCap, House,
  Layers, List, Loader, LocateFixed, Map as MapIcon, MapPin, MapPinOff, Menu, MessageCircleQuestion, Minus, Moon, MousePointerClick,
  Palette, Pause, Play, Plus, RadioTower, RefreshCw, RotateCcw, Route, Satellite, ScanLine, Search, SlidersHorizontal, Smartphone,
  Sparkles, Sun, Sunrise, Timer, ToggleRight, TrainFront, TrendingUp, Utensils, Wind, X, type LucideIcon,
  AirVent, ArrowDownRight, Bell, Building2, ChevronRight, Download, Gauge, Info, Lightbulb, MoveUpRight, Tornado, TrainTrack, TriangleAlert,
  Send, ShieldCheck, Trash2, User,
} from 'lucide-react';

/* Lucide line icons re-stroked to 1.6 (design system §Iconography), plus three custom glyphs. */
const LUCIDE: Record<string, LucideIcon> = {
  'arrow-left-right': ArrowLeftRight, 'arrow-right': ArrowRight, 'arrow-up-right': ArrowUpRight, copy: Copy, bike: Bike, bus: Bus, 'calendar-days': CalendarDays, car: Car, 'chart-column': ChartColumn, check: Check,
  'chevron-down': ChevronDown, circle: Circle, 'circle-dashed': CircleDashed, 'circle-slash': CircleSlash, clock: Clock, 'clock-alert': ClockAlert,
  'cloud-fog': CloudFog, 'cloud-off': CloudOff, 'cloud-rain': CloudRain, construction: Construction, crosshair: Crosshair, dumbbell: Dumbbell,
  'equal-approximately': EqualApproximately, flag: Flag, flame: Flame, footprints: Footprints, 'graduation-cap': GraduationCap, house: House,
  layers: Layers, list: List, loader: Loader, 'locate-fixed': LocateFixed, map: MapIcon, 'map-pin': MapPin, 'map-pin-off': MapPinOff, menu: Menu,
  'message-circle-question': MessageCircleQuestion, minus: Minus, moon: Moon, 'mouse-pointer-click': MousePointerClick, palette: Palette,
  pause: Pause, play: Play, plus: Plus, 'radio-tower': RadioTower, 'refresh-cw': RefreshCw, 'rotate-ccw': RotateCcw, route: Route,
  satellite: Satellite, 'scan-line': ScanLine, search: Search, 'sliders-horizontal': SlidersHorizontal, smartphone: Smartphone,
  sparkles: Sparkles, sun: Sun, sunrise: Sunrise, timer: Timer, 'toggle-right': ToggleRight, 'train-front': TrainFront,
  'trending-up': TrendingUp, utensils: Utensils, wind: Wind, x: X,
  'air-vent': AirVent, 'arrow-down-right': ArrowDownRight, bell: Bell, 'building-2': Building2, 'chevron-right': ChevronRight, download: Download,
  gauge: Gauge, info: Info, lightbulb: Lightbulb, 'move-up-right': MoveUpRight, tornado: Tornado, 'train-track': TrainTrack, 'triangle-alert': TriangleAlert,
  send: Send, 'shield-check': ShieldCheck, 'trash-2': Trash2, user: User,
};

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Custom({ name, size }: { name: string; size: number }) {
  if (name === 'hexmark')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
        <path d="M8 3.5l3 1.7v3.5l-3 1.7-3-1.7V5.2z" />
        <path d="M16 3.5l3 1.7v3.5l-3 1.7-3-1.7V5.2z" opacity=".55" />
        <path d="M12 10.3l3 1.7v3.5l-3 1.7-3-1.7V12z" />
        <path d="M8 17l3 1.7v.1L8 20.5l-3-1.7z" opacity=".55" />
      </svg>
    );
  if (name === 'two-wheeler')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} style={{ display: 'block' }}>
        <circle cx="5.5" cy="17" r="2.5" /><circle cx="18.5" cy="17" r="2.5" /><path d="M8 17h6l2.5-7H19" /><path d="M14.5 5h2l2 12" /><path d="M3.5 13H10l1.5 4" />
      </svg>
    );
  if (name === 'auto')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} style={{ display: 'block' }}>
        <path d="M3 16v-6a5 5 0 0 1 5-5h6l5 5.5V16" /><path d="M12 5v6h7" /><path d="M3 11h6" /><circle cx="7" cy="16.5" r="2" /><circle cx="17" cy="16.5" r="2" /><path d="M9 16.5h6" />
      </svg>
    );
  return null;
}

export function Icon({ name, size = 16, style }: { name: string; size?: number; style?: CSSProperties }) {
  const L = LUCIDE[name];
  return (
    <span aria-hidden="true" className="s-icon" style={{ width: size, height: size, ...style }}>
      {L ? <L size={size} strokeWidth={1.6} style={{ display: 'block' }} /> : <Custom name={name} size={size} />}
    </span>
  );
}

/** HTML string version for Leaflet divIcons. */
export const flameSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
