/* Records where you go while Sora is open (opt-in, spec §27, §40): fixes stay in this device's storage, 48 h at most.
   shortcut: browsers stop location when the page is in the background; continuous recording needs a native app. */
import { useEffect, useState } from 'react';
import { keep, type Fix } from './track';

export const TRACK_KEY = 'sora.track', REC_KEY = 'sora.recording';
const KEEP_MS = 48 * 3600e3, MAX_FIXES = 5000;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: in memory only */ } };
const readFixes = (): Fix[] => { try { return JSON.parse(read(TRACK_KEY) || '[]'); } catch { return []; } };

export function useRecorder() {
  const [on, setOn] = useState(() => read(REC_KEY) === '1');
  const [fixes, setFixes] = useState<Fix[]>(readFixes);
  const [err, setErr] = useState('');
  const toggle = (v: boolean) => { write(REC_KEY, v ? '1' : '0'); setOn(v); setErr(''); };

  useEffect(() => { // "Delete history on this device" also stops recording and drops the fixes
    const reset = () => { setOn(false); setFixes([]); };
    window.addEventListener('sora:cleared', reset);
    return () => window.removeEventListener('sora:cleared', reset);
  }, []);

  useEffect(() => {
    if (!on) return;
    if (!('geolocation' in navigator)) { setErr('This browser cannot share its location.'); return; }
    const id = navigator.geolocation.watchPosition((p) => {
      setErr('');
      const f: Fix = { t: p.timestamp, lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      setFixes((xs) => {
        if (!keep(xs[xs.length - 1], f)) return xs;
        const next = [...xs.filter((x) => x.t >= Date.now() - KEEP_MS), f].slice(-MAX_FIXES);
        write(TRACK_KEY, JSON.stringify(next));
        return next;
      });
    }, (e) => {
      if (e.code === e.PERMISSION_DENIED) { toggle(false); setErr('Location permission was refused, so Sora cannot record.'); }
      else setErr('Waiting for a location fix…');
    }, { enableHighAccuracy: true, maximumAge: 15e3, timeout: 60e3 });
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);

  return { on, fixes, err, toggle };
}
