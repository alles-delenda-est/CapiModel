import { describe, it, expect } from 'vitest';
import { SIMPLE_BASE } from '../src/reforms.js';
import { solveEquilibreEmployment, EMPLOYMENT_CEILING } from '../src/equilibre-solver.js';

describe('solveEquilibreEmployment', () => {
  it('drives net fund at 2070 into the balance band under neutral conditions', () => {
    const base = SIMPLE_BASE('equilibre2070', 'neutre');
    const { feasible, netFund, employmentRate } = solveEquilibreEmployment(base, {});
    expect(feasible).toBe(true);
    expect(Math.abs(netFund)).toBeLessThanOrEqual(60);          // within the ~50 Md€ tol band
    expect(employmentRate).toBeGreaterThanOrEqual(0.69);
    expect(employmentRate).toBeLessThanOrEqual(EMPLOYMENT_CEILING);
  });
  it('under stress: either balances below the ceiling, or reports infeasible at the ceiling', () => {
    const base = SIMPLE_BASE('equilibre2070', 'prudent');
    const { feasible, employmentRate } = solveEquilibreEmployment(base, {});
    if (!feasible) {
      expect(employmentRate).toBeCloseTo(EMPLOYMENT_CEILING, 6);  // clamped at ceiling
    } else {
      expect(employmentRate).toBeLessThanOrEqual(EMPLOYMENT_CEILING);
    }
  });
  it('never returns an employment rate outside [floor, ceiling]', () => {
    const base = SIMPLE_BASE('equilibre2070', 'neutre');
    const { employmentRate } = solveEquilibreEmployment(base, { floor: 0.69 });
    expect(employmentRate).toBeGreaterThanOrEqual(0.69);
    expect(employmentRate).toBeLessThanOrEqual(EMPLOYMENT_CEILING);
  });
});
