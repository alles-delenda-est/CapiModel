import { describe, it, expect } from 'vitest';
import { derivePerRetireePension } from '../src/pension.js';

describe('derivePerRetireePension', () => {
  const R0 = 18.0;
  it('matches the IntroPage inline formula on a representative row', () => {
    const row = {
      retireeIdx: 1.2, legacyExp_t: 300, transitionalPaygExp_t: 40,
      ndcPaygPension_t: 10, capiPayout_t: 50, I_factor_t: 1.15,
    };
    const totalRetireesM = row.retireeIdx * R0;              // 21.6
    const totalPension = 300 + 40 + 10 + 50;                 // 400
    const expected = (totalPension / totalRetireesM) / row.I_factor_t * 1000 / 12;
    expect(derivePerRetireePension(row, R0)).toBeCloseTo(expected, 9);
  });
  it('returns 0 when there are effectively no retirees (guard)', () => {
    expect(derivePerRetireePension({ retireeIdx: 0, I_factor_t: 1 }, R0)).toBe(0);
  });
  it('tolerates missing optional pension fields', () => {
    const row = { retireeIdx: 1, legacyExp_t: 180, I_factor_t: 1 };
    expect(derivePerRetireePension(row, R0)).toBeCloseTo((180 / 18) / 1 * 1000 / 12, 9);
  });
});
