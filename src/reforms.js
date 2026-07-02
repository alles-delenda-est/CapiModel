// Canonical reform definitions — the SINGLE SOURCE OF TRUTH for what each reform
// DOES (paramOverrides layered on UI_CONFIG). Consumed by the intro ladder
// (src/pages/IntroLadderRungs.js) and, from Project B, the SimplifiedView, so the
// same reform produces the same numbers everywhere. View-specific presentation
// (labels, summaries, colours) stays in the consuming components.
//
// `greekCollapse` flags whether the reform gets the pedagogical restructuring
// overlay (applyGreekCollapseOverlay lives in IntroLadderRungs.js).

import { UI_CONFIG } from './presets.js';

export const REFORMS = {
  actuel: {
    id: 'actuel',
    label: 'Statu quo',
    blurb: 'La répartition telle quelle, sans réforme.',
    greekCollapse: true,
    paramOverrides: {
      useEquinoxe: false,
      enableCapi: false,
      hlmDiscount: false,
      delta: 0,
      rho: 0,
      lambda: 0,
      employmentRateTarget: 0.69,
      chileMode: false,
      swedenMode: false,
      fiscalTransferMode: 'full',
      demoProfile: 'realistic',
    },
  },

  equinoxe: {
    id: 'equinoxe',
    label: 'Rééquilibrage (Équinoxe)',
    blurb: 'Réforme des prestations et de l’âge, sans capitalisation.',
    greekCollapse: false,
    paramOverrides: {
      useEquinoxe: true,
      equinoxePhasing: 'phased-10y',
      enableCapi: false,
      hlmDiscount: false,
      delta: 0,
      rho: 0,
      lambda: 0,
      employmentRateTarget: 0.69,
      chileMode: false,
      swedenMode: false,
      fiscalTransferMode: 'full',
      demoProfile: 'realistic',
    },
  },

  suede: {
    id: 'suede',
    label: 'Modèle suédois',
    blurb: 'Comptes notionnels à cotisations définies (NDC).',
    greekCollapse: false,
    paramOverrides: {
      useEquinoxe: true,
      equinoxePhasing: 'phased-10y',
      enableCapi: false,
      swedenMode: true,
      swedenABM: true,
      swedenCapiRate: 0.04,
      chileMode: false,
      hlmDiscount: false,
      delta: 0,
      rho: 0,
      lambda: 0,
      employmentRateTarget: 0.69,
      fiscalTransferMode: 'none',
      demoProfile: 'realistic',
    },
  },

  chili: {
    id: 'chili',
    greekCollapse: false,
    paramOverrides: {
      useEquinoxe: true,
      equinoxePhasing: 'phased-10y',
      enableCapi: true,
      chileMode: true,
      swedenMode: false,
      cutoffAge: 50,
      hlmDiscount: true,
      delta: 0.3,
      rho: 0.05,
      T_hlm: 20,
      lambda: 0,
      tauK: 0,
      thetaBuffer: 0.01,
      employmentRateTarget: 0.69,
      fiscalTransferMode: 'none',
      demoProfile: 'realistic',
    },
  },

  chili_finance: {
    id: 'chili_finance',
    label: 'Capitalisation financée',
    blurb: 'Bascule capitalisée dont la dette de transition est financée.',
    greekCollapse: false,
    paramOverrides: {
      useEquinoxe: true,
      equinoxePhasing: 'phased-10y',
      enableCapi: true,
      chileMode: true,
      swedenMode: false,
      cutoffAge: 50,
      hlmDiscount: true,
      delta: 0.3,
      rho: 0.05,
      T_hlm: 20,
      lambda: 0.30,
      tauK: 0.025,
      thetaBuffer: 0.01,
      employmentRateTarget: 0.759,
      employmentTransitionYears: 8,
      fiscalTransferMode: 'full',
      demoProfile: 'realistic',
    },
  },

  capi_pur: {
    id: 'capi_pur',
    greekCollapse: false,
    paramOverrides: {
      useEquinoxe: true,
      equinoxePhasing: 'phased-10y',
      enableCapi: true,
      chileMode: true,
      swedenMode: false,
      cutoffAge: 65,
      hlmDiscount: true,
      delta: 0.3,
      rho: 0.05,
      T_hlm: 20,
      tauK: 0,
      lambda: 0,
      thetaBuffer: 0.01,
      employmentRateTarget: 0.69,
      fiscalTransferMode: 'none',
      demoProfile: 'realistic',
    },
  },

  // NEW (Project B): parametric balance of the current répartition system.
  equilibre2070: {
    id: 'equilibre2070',
    label: 'Équilibre 2070',
    blurb: 'Équilibrer la répartition à l’horizon 2070 — au prix qu’il faut.',
    greekCollapse: false,
    paramOverrides: {
    // Parametric balance of répartition by 2070: no capitalisation, no budget
    // transfers — age indexed (~67.6 by 2070) + Équinoxe + high employment. Verified
    // buildable: debt clears by 2070 under cor_central (peak ~200 Md€). The severity
    // of what it takes IS the lesson.
    useEquinoxe: true,
    equinoxePhasing: 'phased-10y',
    enableCapi: false,
    chileMode: false,
    swedenMode: false,
    hlmDiscount: false,
    delta: 0,
    rho: 0,
    lambda: 0,
    retirementAgeMode: 'indexed',
    employmentRateTarget: 0.80,
    employmentTransitionYears: 8,
    fiscalTransferMode: 'none',
    demoProfile: 'cor_central',
  },
  },
};

// ── SimplifiedView presentation layer (Project B) ──────────────────────────
// The 5 reforms the simple view exposes, in display order (spec §2).
export const SIMPLE_REFORM_IDS = [
  'actuel', 'equinoxe', 'equilibre2070', 'suede', 'chili_finance',
];

// Macro "conditions" — orthogonal to the reform (spec §3, B3). A small
// correlated macro regime; NOT reforms, carry no structural levers. Values
// mirror presets.js v1_stress / defaults / v1_optimiste.
export const MACRO_CONDITIONS = {
  prudent:   { label: 'Prudent',   params: { r_c: 0.025, r_f_portfolio: 0.025, w_r: 0.001, r_d_base: 0.045, extraSpread: 0.005 } },
  neutre:    { label: 'Neutre',    params: {} },
  optimiste: { label: 'Optimiste', params: { r_c: 0.05,  r_f_portfolio: 0.05,  w_r: 0.008 } },
};

// Single base-config builder: UI_CONFIG ← reform.paramOverrides ← condition.params.
export function SIMPLE_BASE(reformId, conditionId = 'neutre') {
  return {
    ...UI_CONFIG,
    ...REFORMS[reformId].paramOverrides,
    ...(MACRO_CONDITIONS[conditionId]?.params ?? {}),
  };
}
