// Reference traces (§11.3) for v1.1 parametric-mode preset.
//
// Assertion strategy:
//   1. Spec-mandated anchors at t=0, 22, 33, 69 (per Task 2 brief).
//   2. Full 70-year × every-field regression baseline against the captured
//      fixture `tests/fixtures/v1.1-default-trace.json`.
//
// v1.1: target fixture switched from v1.0a-default-trace.json to
// v1.1-default-trace.json; the v1.0a fixture is preserved unchanged at
// `tests/fixtures/v1.0a-default-trace.json` as an archival snapshot of the
// pre-§5.6.1 binary-cohort behaviour.
//
// v2.1 note: demoMode now defaults to 'actuarial'. This file tests the
// parametric mode explicitly (demoMode:'parametric') to preserve the v1.1
// regression baseline as a permanent backward-compat guard. The actuarial
// default path is separately locked by v2.0-actuarial-cor-central-trace.json.
//
// **Engine-change protocol.** Any future change that alters parametric-preset
// output will fail the regression and require either:
//   - a fixture update committed in a PR with explicit per-field justification, OR
//   - a fix to the engine.
// All such cases must be presented to the user for validation irrespective
// of the permissions mode (per Task 2 brief).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runSimulation } from '../src/simulation-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'fixtures/v1.1-default-trace.json');
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

// Explicit parametric pin — demoMode defaults to 'actuarial' since v2.1.
const rows = runSimulation({ demoMode: 'parametric' });

// =================== §11.3 spec-mandated anchors ===================

describe('§11.3 reference trace — spec-mandated anchors', () => {
  // ----- t = 0 (Y0 = 2027) — §12 immediate self-checks -----
  describe('t=0 (year 2027)', () => {
    const r = rows[0];

    // Tolerance: 0.5% — DREES integral computed numerically (50-step midpoint
    // Riemann), spec target is "≈17.7" per §12. Actual: 17.6788.
    it('S0_brackets_t ≈ 17.7 Md€/yr (within 0.5%)', () => {
      expect(r.S0_brackets_t).toBeGreaterThan(17.6);
      expect(r.S0_brackets_t).toBeLessThan(17.8);
    });

    // Tolerance: exact (no premium below threshold1=150% and debtRatio(0)=115%).
    it('r_d_t = r_d_base = 0.035 exactly', () => {
      expect(r.r_d_t).toBeCloseTo(0.035, 12);
    });

    // Tolerance: exact by construction (eq 7e).
    it('cohIdx = 1.0 exactly (legacy cohort intact at t=0)', () => {
      expect(r.cohIdx).toBe(1);
    });

    // Tolerance: exact by construction (eq 7c at t=0 → S(0;0,22)=0).
    it('retireeIdx = 1.0 exactly', () => {
      expect(r.retireeIdx).toBeCloseTo(1.0, 12);
    });

    // Tolerance: exact (anchor at t=0 in cor_central activePopAnchors).
    it('activePopFactor = 1.0 exactly', () => {
      expect(r.activePopFactor).toBeCloseTo(1.0, 12);
    });

    // Tolerance: exact, since both numerator and denominator equal 1.
    it('dependencyRatio = 1.0 exactly', () => {
      expect(r.dependencyRatio_t).toBeCloseTo(1.0, 12);
    });
  });

  // ----- t = 22 (Y0 + 22 = 2049) — peak demographic year -----
  describe('t=22 (year 2049, peakT)', () => {
    const r = rows[22];

    // Tolerance: per Task 2 brief — assert retireeIdx ∈ [1.299, 1.301].
    // At peakT, S(peakT;0,peakT)=1, S(peakT;peakT,70)=0 → retireeIdx = peakMult = 1.30 exactly.
    it('retireeIdx ∈ [1.299, 1.301] (peakMult = 1.30 within smoothstep tolerance)', () => {
      expect(r.retireeIdx).toBeGreaterThanOrEqual(1.299);
      expect(r.retireeIdx).toBeLessThanOrEqual(1.301);
    });
  });

  // ----- t = 33 (Y0 + 33 = 2060, halfway COR projection) -----
  describe('t=33 (year 2060)', () => {
    const r = rows[33];

    // Tolerance: 5% — bounded plausibility check, NOT a tight calibration.
    // Reasoning: spec §7 anchors cor_central to COR central scenario which
    // shows +48% dependency-ratio change 2024→2070 (cor_central yields +42%
    // by 2070, slight under-shoot acknowledged in spec §8.3). At t=33 (2060,
    // 33/43 ≈ 77% of the way to peak transition) we expect roughly 30–40%
    // rise from baseline 1.0. Actual model output: 1.370 (37% rise).
    it('dependencyRatio in plausible halfway range [1.30, 1.40]', () => {
      expect(r.dependencyRatio_t).toBeGreaterThan(1.30);
      expect(r.dependencyRatio_t).toBeLessThan(1.40);
    });

    // Sanity: cohIdx well past the midpoint of the 45-year decay.
    it('cohIdx is past midpoint and below 0.30 (legacy mostly extinct)', () => {
      expect(r.cohIdx).toBeLessThan(0.30);
    });
  });

  // ----- t = 69 (Y0 + 69 = 2096, final year) -----
  describe('t=69 (year 2096, final year)', () => {
    const r = rows[69];

    // Tolerance: 0.1% — equilibrium target longRunMult = 1.25 with smoothstep
    // approach. At t=69 the second smoothstep S(69;22,70) is ≈0.999, so
    // retireeIdx = 1 + 0.30 - (1-0.001)×0.05 ≈ 1.250.
    it('retireeIdx ≈ longRunMult = 1.25 (within 0.1%)', () => {
      expect(r.retireeIdx).toBeGreaterThanOrEqual(1.249);
      expect(r.retireeIdx).toBeLessThanOrEqual(1.251);
    });

    // Tolerance: 0.5% — last activePopAnchor is (70, 0.86); at t=69 we're
    // 1y short, interpolated against (44, 0.90). Linear interpolation:
    // 0.90 + 25/26 × (0.86 - 0.90) = 0.90 - 25/26 × 0.04 ≈ 0.8615.
    it('activePopFactor ≈ 0.86 (within 0.5%, off-by-one-year linear interp)', () => {
      expect(r.activePopFactor).toBeGreaterThanOrEqual(0.86);
      expect(r.activePopFactor).toBeLessThanOrEqual(0.865);
    });

    // Tolerance: exact — cohIdx = 1 - S(t;0,45) = 1 - 1 = 0 for t ≥ 45.
    it('cohIdx = 0 exactly (legacy fully extinct under 45-year tail)', () => {
      expect(r.cohIdx).toBe(0);
    });
  });
});

// =================== Full 70-year × every-field regression ===================

describe('§11.3 full regression baseline against fixture', () => {
  it('row count matches fixture (70 years)', () => {
    expect(rows.length).toBe(FIXTURE.length);
    expect(rows.length).toBe(70);
  });

  it('every numeric field of every row matches fixture to 1e-9', () => {
    // 1e-9 absolute tolerance: tighter than 1e-6 because all the work is in
    // a single Node process — no IPC / serialisation / cross-platform float
    // drift in the comparison path. The fixture is bit-equivalent to the
    // engine output unless something changed.
    const failures = [];
    for (let i = 0; i < rows.length; i++) {
      for (const key of Object.keys(FIXTURE[i])) {
        const expected = FIXTURE[i][key];
        const actual = rows[i][key];
        if (typeof expected === 'number' && Number.isFinite(expected)) {
          // For Md€ values that grow geometrically, allow a relative tolerance
          // when |expected| > 1; otherwise absolute.
          const tol = Math.max(1e-9, Math.abs(expected) * 1e-9);
          if (Math.abs(actual - expected) > tol) {
            failures.push(`t=${i} ${key}: expected ${expected}, got ${actual}, diff ${actual - expected}`);
          }
        } else if (typeof expected !== 'number') {
          if (actual !== expected) {
            failures.push(`t=${i} ${key}: expected ${expected}, got ${actual}`);
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} field mismatch(es) vs fixture. ` +
        `If the engine changed intentionally, regenerate the fixture and present ` +
        `the diff to the user for validation.\n` +
        failures.slice(0, 20).join('\n') +
        (failures.length > 20 ? `\n... and ${failures.length - 20} more` : ''),
      );
    }
  });

  it('every row in the fixture has the same field set as the engine output', () => {
    const engineKeys = new Set(Object.keys(rows[0]));
    const fixtureKeys = new Set(Object.keys(FIXTURE[0]));
    const missingInFixture = [...engineKeys].filter(k => !fixtureKeys.has(k));
    const missingInEngine = [...fixtureKeys].filter(k => !engineKeys.has(k));
    expect(missingInFixture, `engine has fields not in fixture: ${missingInFixture.join(', ')}`)
      .toEqual([]);
    expect(missingInEngine, `fixture has fields not in engine: ${missingInEngine.join(', ')}`)
      .toEqual([]);
  });
});

// ============= v2.0 actuarial-mode regression baseline =============
//
// Locks the actuarial kernel (COR/INSEE table dispatch + §6.5 per-cohort
// population mask) against a stored trace. NOTE: the demographic data in
// src/demographic-tables.js is currently a synthetic PLACEHOLDER — this
// fixture protects the *engine logic*, not the demographic values. It MUST
// be regenerated when the placeholder tables are replaced with primary-source
// COR juin 2025 / INSEE T60 transcriptions (a data-only change).

const ACT_FIXTURE_PATH = resolve(__dirname, 'fixtures/v2.0-actuarial-cor-central-trace.json');
const ACT_FIXTURE = JSON.parse(readFileSync(ACT_FIXTURE_PATH, 'utf8'));
const actRows = runSimulation({
  demoMode: 'actuarial',
  demoScenario: 'cor_central',
  mortalityFemaleFraction: 0.52,
});

describe('v2.0 actuarial-mode regression baseline against fixture', () => {
  it('row count matches fixture (70 years)', () => {
    expect(actRows.length).toBe(ACT_FIXTURE.length);
    expect(actRows.length).toBe(70);
  });

  it('every numeric field of every row matches the actuarial fixture to 1e-9', () => {
    const failures = [];
    for (let i = 0; i < actRows.length; i++) {
      for (const key of Object.keys(ACT_FIXTURE[i])) {
        const expected = ACT_FIXTURE[i][key];
        const actual = actRows[i][key];
        if (typeof expected === 'number' && Number.isFinite(expected)) {
          const tol = Math.max(1e-9, Math.abs(expected) * 1e-9);
          if (Math.abs(actual - expected) > tol) {
            failures.push(`t=${i} ${key}: expected ${expected}, got ${actual}, diff ${actual - expected}`);
          }
        } else if (typeof expected !== 'number') {
          if (actual !== expected) {
            failures.push(`t=${i} ${key}: expected ${expected}, got ${actual}`);
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} field mismatch(es) vs actuarial fixture. ` +
        `If the engine or demographic-tables.js changed intentionally, regenerate ` +
        `tests/fixtures/v2.0-actuarial-cor-central-trace.json and present the diff.\n` +
        failures.slice(0, 20).join('\n') +
        (failures.length > 20 ? `\n... and ${failures.length - 20} more` : ''),
      );
    }
  });

  it('actuarial fixture field set matches engine output', () => {
    const engineKeys = new Set(Object.keys(actRows[0]));
    const fixtureKeys = new Set(Object.keys(ACT_FIXTURE[0]));
    const missingInFixture = [...engineKeys].filter(k => !fixtureKeys.has(k));
    const missingInEngine = [...fixtureKeys].filter(k => !engineKeys.has(k));
    expect(missingInFixture, `engine has fields not in fixture: ${missingInFixture.join(', ')}`)
      .toEqual([]);
    expect(missingInEngine, `fixture has fields not in engine: ${missingInEngine.join(', ')}`)
      .toEqual([]);
  });
});
