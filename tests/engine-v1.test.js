import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEMOGRAPHIC_PROFILES,
  DREES_DECILES,
  LIFE_EXP_INDEXATION_FRACTION,
  smoothstep,
  clamp,
  fisher,
  interpLinear,
} from '../src/simulation-engine-v1.js';

describe('module scaffold', () => {
  it('exports DEFAULT_CONFIG with expected horizon and Y0', () => {
    expect(DEFAULT_CONFIG.N).toBe(70);
    expect(DEFAULT_CONFIG.Y0).toBe(2027);
  });

  it('exports the three demographic profiles', () => {
    expect(Object.keys(DEMOGRAPHIC_PROFILES).sort())
      .toEqual(['cor_central', 'realistic', 'reformed']);
  });

  it('exports DREES_DECILES with 10 entries', () => {
    expect(DREES_DECILES).toHaveLength(10);
    expect(DREES_DECILES[0].lo).toBe(0);
    expect(DREES_DECILES[9].hi).toBe(6000);
  });

  it('exports LIFE_EXP_INDEXATION_FRACTION = 0.5', () => {
    expect(LIFE_EXP_INDEXATION_FRACTION).toBe(0.5);
  });
});

// §11.1 unit tests for smoothstep S(x; a, b)
describe('smoothstep §0', () => {
  it('S(a; a, b) = 0', () => expect(smoothstep(0, 0, 1)).toBe(0));
  it('S(b; a, b) = 1', () => expect(smoothstep(1, 0, 1)).toBe(1));
  it('S((a+b)/2; a, b) = 0.5', () => {
    expect(smoothstep(0.5, 0, 1)).toBeCloseTo(0.5, 12);
  });
  it('S(a-1; a, b) clamps to 0', () => expect(smoothstep(-1, 0, 1)).toBe(0));
  it('S(b+1; a, b) clamps to 1', () => expect(smoothstep(2, 0, 1)).toBe(1));
  it('a == b: S = 1 for x >= a, 0 otherwise', () => {
    expect(smoothstep(5, 5, 5)).toBe(1);
    expect(smoothstep(4.999, 5, 5)).toBe(0);
  });
  it('shape: u² × (3 − 2u) at u = 0.25 → 0.15625', () => {
    expect(smoothstep(0.25, 0, 1)).toBeCloseTo(0.15625, 12);
  });
});

describe('clamp §0', () => {
  it('within range', () => expect(clamp(0.5, 0, 1)).toBe(0.5));
  it('below lo', () => expect(clamp(-1, 0, 1)).toBe(0));
  it('above hi', () => expect(clamp(2, 0, 1)).toBe(1));
  it('at boundaries', () => {
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });
});

// §5.1 eq (1) Fisher exact: w_n = π + w_r + π × w_r
describe('fisher composition', () => {
  it('fisher(0.004, 0.02) = 0.004 + 0.02 + 0.00008 = 0.02408', () => {
    expect(fisher(0.004, 0.02)).toBeCloseTo(0.02408, 12);
  });
  it('fisher(0, x) = x', () => expect(fisher(0, 0.05)).toBe(0.05));
  it('fisher(x, 0) = x', () => expect(fisher(0.05, 0)).toBe(0.05));
});

// §5.2 eq (7d) piecewise-linear interp with endpoint clamp
describe('interpLinear', () => {
  const anchors = [[0, 1.0], [14, 1.0], [29, 0.96], [44, 0.90], [70, 0.86]];
  it('exact anchor t=14', () => expect(interpLinear(14, anchors)).toBeCloseTo(1.0, 12));
  it('exact anchor t=29', () => expect(interpLinear(29, anchors)).toBeCloseTo(0.96, 12));
  it('halfway between (14, 1.0) and (29, 0.96) = 0.98', () => {
    expect(interpLinear(21.5, anchors)).toBeCloseTo(0.98, 12);
  });
  it('clamps below first anchor', () => expect(interpLinear(-5, anchors)).toBe(1.0));
  it('clamps above last anchor', () => expect(interpLinear(100, anchors)).toBe(0.86));
});
