import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEMOGRAPHIC_PROFILES,
  DREES_DECILES,
  LIFE_EXP_INDEXATION_FRACTION,
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
