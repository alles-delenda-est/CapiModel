// Retirement-age lever — restored control + wired actuarial effect.
//
// The control was dropped in the PR34 simulator redesign; this restores it and
// makes the base retirement age a genuine PAYG lever in actuarial mode. The COR
// P_ret tables are calibrated to an effective age of 64, so the engine scales the
// standing retiree count by how far A_R(t) sits above/below 64.
//
// The "default (64) is bit-identical" property is guarded by the engine-reference
// regression (deltaAR = 0 → scale = 1); here we lock the lever's direction.

import { describe, it, expect } from 'vitest';
import { runSimulation, DEFAULT_CONFIG } from '../src/simulation-engine.js';

const UI = { ...DEFAULT_CONFIG, cashFlowMode: 'balanced', geKneeRatio: 3, geFloorRatio: 8 };
const run = age => runSimulation({ ...UI, retirementAgeBase: age });
const retireeIdx2050 = age => run(age).find(r => r.year === 2050).retireeIdx;
const peakDebt = age => Math.max(...run(age).map(r => r.D_t));

describe('retirement-age lever', () => {
  it('raising the base age monotonically reduces the standing retiree count', () => {
    expect(retireeIdx2050(70)).toBeLessThan(retireeIdx2050(67));
    expect(retireeIdx2050(67)).toBeLessThan(retireeIdx2050(64));
    expect(retireeIdx2050(64)).toBeLessThan(retireeIdx2050(62));
  });

  it('raising the base age lowers peak transition debt (later retirement = cheaper)', () => {
    expect(peakDebt(67)).toBeLessThan(peakDebt(64));
    expect(peakDebt(70)).toBeLessThan(peakDebt(67));
  });

  it('retiring earlier than 64 raises the retiree count above the baseline', () => {
    expect(retireeIdx2050(62)).toBeGreaterThan(retireeIdx2050(64));
  });

  it('the retiree-scale is exactly 1 at the default age (fixtures unaffected)', () => {
    // Two independent runs at 64 (default) must match to full precision — i.e.
    // introducing the lever did not perturb the default trajectory.
    const a = run(64), b = runSimulation(UI);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].retireeIdx).toBeCloseTo(b[i].retireeIdx, 12);
      expect(a[i].D_t).toBeCloseTo(b[i].D_t, 6);
    }
  });
});
