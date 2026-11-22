/* Wire types for the Sora HTTP API. Keep in sync with docs/api_contract.md. */
import type { Band, Bbox, BuildingKey, City, LatLng, MeKey, ModeKey, PollKey, RouteId } from '../data/sora';

export type ISO = string;
export type { Band, Bbox, City, LatLng };

export type Field = {
  city: string; pollutant: PollKey; unit: string;
  times: ISO[]; lats: number[]; lons: number[];
  median: number[][][]; p05: number[][][]; p95: number[][][];
  coverage: number[][];
  stations: { name: string; lat: number; lon: number; reporting: boolean }[];
  fires: LatLng[];
  wind: { dir_deg: number[]; speed_ms: number[] };
  meta: {
    analysis_time: ISO; next_update: ISO; built_at: ISO;
    degradation: string; n_stations: number; n_reporting: number; background: string;
  };
};

export type PlanRequest = {
  city: string; origin: LatLng; dest: LatLng; mode: ModeKey;
  planned_departure: ISO; earliest: ISO; latest_departure: ISO; latest_arrival: ISO | null;
  max_extra_min: number; origin_building: BuildingKey; dest_building: BuildingKey;
};
export type WireOption = {
  id: RouteId; label: string; departure: ISO; travel_min: number; distance_km: number;
  dose: Band; reduction_pct: Band; p_better: number | null; extra_min: number; path: LatLng[];
};
export type PlanResponse = {
  baseline: WireOption; options: WireOption[]; recommended: Exclude<RouteId, 'plan'>; reliable: boolean;
  explanation: string[]; caveats: string[]; degradation: string; window: { start: ISO; end: ISO };
};

export type Place = { label: string; lat: number; lon: number };
export type DayRequest = {
  city: string; mode: ModeKey; max_extra_min: number;
  stops: {
    name: string; place: Place; alternatives?: Place[];
    arrive_after?: ISO; leave_before?: ISO; duration_min?: number;
    building: BuildingKey; activity?: 'rest' | 'light' | 'moderate' | 'high';
  }[];
};
export type Segment = { me: MeKey; start: ISO; end: ISO; dose: number; label?: string };
export type DayResponse = {
  stops: { name: string; place: string; icon: string; window: string; duration: string; building: string }[];
  original: { segments: Segment[]; total: Band };
  optimized: { segments: Segment[]; total: Band };
  changes: { icon: string; title: string; detail: string; delta_ug: number }[];
  reduction_pct: Band; p_better: number; extra_min: number;
};

export type Change =
  | { kind: 'shift_departure'; minutes: number }
  | { kind: 'mode'; mode: ModeKey }
  | { kind: 'destination'; dest: LatLng; dest_building?: BuildingKey }
  | { kind: 'stay_indoors'; start: ISO; end: ISO };
export type CounterfactualResponse = { delta_pct: Band; p_better: number; verdict: string; reason: string };

export type ApiEvent = {
  kind: string; title: string; body: string; start: ISO; end: ISO | null;
  severity: 'warning' | 'info' | 'success'; probability: number;
};

/** Thrown for any non-2xx response (body `{detail:{code,message,...}}`) and for network failures (status 0). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}
