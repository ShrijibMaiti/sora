// Unit tests for on-device day recording (src/lib/track.ts). Run: npm test (Node ≥ 22.18 strips the TypeScript types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keep, metres, segment } from '../src/lib/track.ts';

const T0 = Date.parse('2027-01-10T02:30:00Z'); // 08:00 IST
const min = 60e3;
const home = { lat: 28.5677, lon: 77.2433 }, college = { lat: 28.545, lon: 77.1926 };
const fix = (m, p, acc = 15) => ({ t: T0 + m * min, lat: p.lat, lon: p.lon, acc });
const jitter = (p, k) => ({ lat: p.lat + ((k * 7) % 5 - 2) * 1e-4, lon: p.lon + ((k * 3) % 5 - 2) * 1e-4 }); // ≤ ~30 m
const along = (a, b, s) => ({ lat: a.lat + (b.lat - a.lat) * s, lon: a.lon + (b.lon - a.lon) * s });

// 30 min at home, 25 min riding to college (~5.6 km, ~13 km/h), 40 min there
function day() {
  const out = [];
  for (let m = 0; m <= 30; m += 2) out.push(fix(m, jitter(home, m)));
  for (let m = 31; m < 55; m += 1) out.push(fix(m, along(home, college, (m - 30) / 25)));
  for (let m = 55; m <= 95; m += 2) out.push(fix(m, jitter(college, m)));
  return out;
}

test('stays and a ride, in order, with dose', () => {
  const p = segment(day(), () => 100);
  assert.deepEqual(p.map((x) => x.kind), ['stay', 'vehicle', 'stay']);
  assert.ok(metres(p[0], home) < 50 && metres(p[2], college) < 50);
  assert.ok(Math.abs(p[1].km - metres(home, college) / 1000) < 0.3);
  // dose = conc × factor × L/min / 1000 × minutes: home 30 min at 0.82 × 12 L/min at 100 µg/m³ ≈ 29.5 µg
  assert.ok(Math.abs(p[0].dose - 100 * 0.82 * 12 / 1000 * 30) < 1, `${p[0].dose}`);
  assert.ok(p.every((x) => x.dose > 0));
});

test('a walk is slower than 7 km/h; long gaps and coarse fixes are not counted', () => {
  const walk = [0, 5, 10, 15].map((m) => fix(m, along(home, college, m / 60))); // ~5.6 km/h
  assert.deepEqual(segment(walk, () => 50).map((x) => x.kind), ['walk']);
  const gap = [fix(0, home), fix(1, home), fix(60, college), fix(61, college)];
  assert.equal(segment(gap, () => 50).reduce((a, x) => a + (x.end - x.start), 0), 2 * min);
  assert.deepEqual(segment([fix(0, home, 500), fix(5, college, 500)], () => 50), []);
});

test('keep thins fixes to 30 s or 25 m', () => {
  const a = fix(0, home);
  assert.equal(keep(undefined, a), true);
  assert.equal(keep(a, { ...a, t: a.t + 10e3 }), false);
  assert.equal(keep(a, { ...a, t: a.t + 31e3 }), true);
  assert.equal(keep(a, { ...a, t: a.t + 5e3, lat: a.lat + 3e-4 }), true);
  assert.equal(keep(a, { ...a, t: a.t + 40e3, acc: 300 }), false);
});
