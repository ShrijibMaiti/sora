/* IST helpers. The API speaks ISO 8601; the UI shows IST wall-clock times. */
import { hhmm, toMin } from '../data/sora';

export const IST_MS = 5.5 * 3600e3;
export const HOUR_MS = 3600e3;

/** Minutes since IST midnight. */
export const istMinutes = (iso: string) => { const d = new Date(Date.parse(iso) + IST_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const istHHMM = (iso: string) => hhmm(istMinutes(iso));
/** "Sat 21 Nov" */
export const istDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)).replace(',', '');
/** Start of the IST day containing `iso`, as epoch ms. */
export const istDayStart = (iso: string) => { const ms = Date.parse(iso) + IST_MS; return ms - (ms % 86400e3) - IST_MS; };

/** ISO for the first IST wall-clock time "HH:MM" at or after `refIso`. */
export function istTimeOnOrAfter(t: string, refIso: string) {
  let ms = istDayStart(refIso) + toMin(t) * 60e3;
  if (ms < Date.parse(refIso)) ms += 86400e3;
  return new Date(ms).toISOString();
}

/** Hour index t (fractional) of an ISO time within a field whose first frame is t0. */
export const hourIndex = (iso: string, t0: string) => (Date.parse(iso) - Date.parse(t0)) / HOUR_MS;
