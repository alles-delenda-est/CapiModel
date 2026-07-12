// Guard: the calibration register (src/calibration.js — the sourced-of-record)
// must agree with the engine's DEFAULT_CONFIG for every overlapping key, so the
// documented values can never silently drift from the values the engine uses.
// If you intentionally change an engine constant, update its register entry in
// the same commit and this test keeps them locked together.

import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/simulation-engine.js';
import { CALIBRATION } from '../src/calibration.js';

describe('calibration register ↔ engine DEFAULT_CONFIG', () => {
  const engineBacked = CALIBRATION.filter(
    c => c.key !== '—' && typeof c.value === 'number',
  );

  it('covers a non-trivial set of engine-backed constants', () => {
    expect(engineBacked.length).toBeGreaterThanOrEqual(10);
  });

  it.each(engineBacked.map(c => [c.key, c.value]))(
    'register %s = engine default',
    (key, value) => {
      expect(DEFAULT_CONFIG[key]).toBeDefined();
      expect(DEFAULT_CONFIG[key]).toBeCloseTo(value, 9);
    },
  );

  it('every engine-backed key is a real DEFAULT_CONFIG key', () => {
    for (const c of engineBacked) {
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, c.key)).toBe(true);
    }
  });
});
