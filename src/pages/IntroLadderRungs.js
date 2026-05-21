// Five-rung pedagogical ladder for the redesigned Intro page.
// Each rung is a paramOverrides object layered on top of UI_CONFIG from
// src/presets.js. See INTRO_LADDER_MAPPING.md for rationale.
//
// `greekCollapse: true` activates the pedagogical post-processing overlay
// (applyGreekCollapseOverlay, below). Used by IntroPage and SimulatorPage
// (only for rung 1 / no-reform scenario in the simulator).

// Threshold constants — Greek-style fiscal collapse pedagogical overlay.
// "No country has sustained debt > 300 % of GDP without restructuring"
// (Reinhart & Rogoff, This Time Is Different). The GE-penalty kick-in at
// 150 % models the snowball effect of refinancing risk before outright
// restructuring becomes inevitable.
export const GREEK_GE_THRESHOLD_PCT_GDP    = 150
export const GREEK_COLLAPSE_TRIGGER_PCT    = 300
export const GREEK_GE_ACCEL_PER_YEAR       = 0.04
export const GREEK_R_D_RESTRUCTURE_TRIGGER = 0.195

// applyGreekCollapseOverlay — applies the pedagogical Greek-collapse
// overlay to a chart series IN PLACE. Returns { collapseIdx, collapseYear,
// debtRatioAtCollapse } when a restructuring is triggered, or null.
//
// `fieldMap` lets callers pass series with different field names:
//   { debt, debtRatio, rDeff, pension, solde, year }
// Each value names the property on each series element holding that
// quantity. `debtRatio` must be a percentage (e.g., 240 for 240 % GDP).
//
// The overlay does TWO things:
//   1. Above GE threshold (150 % GDP): adds a 4 %/yr compound multiplier
//      to debt fields each subsequent year — models the spiral that the
//      engine's endogenous rate only partially captures.
//   2. Above collapse trigger (300 % GDP) or r_d ≥ 19.5 %: caps debt at
//      that level (forced restructuring), phases in a 50 % real pension
//      cut over 3 years, and forces the solde toward ~0 (austerity
//      equilibrium).
export function applyGreekCollapseOverlay(series, fieldMap) {
  const { debt, debtRatio, rDeff, pension, solde } = fieldMap

  // Step 1: GE acceleration above the threshold.
  let accel = 1
  for (let i = 0; i < series.length; i++) {
    if (series[i][debtRatio] > GREEK_GE_THRESHOLD_PCT_GDP) {
      accel *= 1 + GREEK_GE_ACCEL_PER_YEAR
    }
    if (accel !== 1) {
      series[i][debt]      = series[i][debt]      * accel
      series[i][debtRatio] = series[i][debtRatio] * accel
    }
  }

  // Step 2: restructuring once trigger crossed.
  const collapseIdx = series.findIndex(
    s => s[debtRatio] > GREEK_COLLAPSE_TRIGGER_PCT
      || (rDeff && s[rDeff] >= GREEK_R_D_RESTRUCTURE_TRIGGER),
  )
  if (collapseIdx <= 0) return null

  const capDebt      = series[collapseIdx][debt]
  const capDebtRatio = series[collapseIdx][debtRatio]
  for (let i = collapseIdx; i < series.length; i++) {
    const tSinceCollapse = i - collapseIdx
    const cutPhase = Math.min(1, tSinceCollapse / 3)
    series[i][pension]    = series[i][pension] * (1 - 0.5 * cutPhase)
    series[i][debt]       = capDebt      * (1 - 0.1 * cutPhase)
    series[i][debtRatio]  = capDebtRatio * (1 - 0.1 * cutPhase)
    series[i][solde]      = series[i][solde] + Math.abs(series[i][solde]) * cutPhase
  }
  return {
    collapseIdx,
    collapseYear: series[collapseIdx].year,
    debtRatioAtCollapse: capDebtRatio,
  }
}

export const LADDER_RUNGS = [
  {
    id: 'actuel',
    num: 1,
    label: 'Système actuel',
    short: 'Sans réforme',
    headline: 'Aujourd\u2019hui : un système par répartition sous perfusion',
    summary: "Avec la démographie actuelle, notre système par répartition suppose des transferts permanents du budget général (donc des autres taxes — CSG, FSV, TVA \u2248 40 Md€/an) pour boucler ses fins de mois, et cela ne suffit même pas car le budget de l'État est déficitaire pour cette raison. Sans réforme, la dépendance s'aggrave avec le vieillissement, et la dette avec, jusqu'à ce que nous nous retrouvions dans la même situation que les Grecs. Pour rappel, ils ont dû couper les dépenses de l'État à l'os. Avec les paramètres budgétaires de la France, seules de grosses coupes des retraites pourraient suffire.",
    closestPreset: 'derived (counterfactual + transferts BG actuels)',
    color: '#b85c3c',
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
  {
    id: 'equinoxe',
    num: 2,
    label: 'Rééquilibrage Équinoxe',
    short: 'Équinoxe',
    headline: 'On rééquilibre : moins de pression sur le budget général',
    summary: "Le rééquilibrage proposé par Équinoxe réduit progressivement les pensions élevées, supprime l'abattement de 10 %, et restaure la CSG/CRDS à taux plein, sans toucher aux petites retraites. Ce rééquilibrage suffit pour que la France reste solvable, pour l'instant, mais les retraites restent structurellement dépendantes des transferts du budget général et de la démographie.",
    closestPreset: 'equinoxeOnly',
    color: '#c9a961',
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
  {
    id: 'suede',
    num: 3,
    label: 'Mode Suédois',
    short: 'Suède',
    headline: 'Suède : équilibrage automatique + petit pilier capi',
    summary: "Cette proposition de réforme est inspirée du système suédois Inkomstpension (pension par revenu) + Premiepension (pension de prime), dernières « grandes réformes » dans un pays européen (1999). Dans ce modèle, nous restons dans un système par répartition, mais avec un compte notionnel par cotisant, complété par un petit pilier de capitalisation (contribution de 4 % des salaires, que les individus peuvent supplémenter). Le mécanisme d'équilibrage automatique (ABM) coupe l'indexation des pensions lorsque les ressources du système passent en-dessous des décaissements, gardant le système solvable sans recourir à la dette. Cette solution élimine le conflit intergénérationnel parce que les retraités et les actifs partagent les fruits de la croissance économique.",
    closestPreset: 'v1_default + swedenMode (canonical toggle)',
    color: '#0d9488',
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
  {
    id: 'chili',
    num: 4,
    label: 'Mode Chilien',
    short: 'Chili',
    headline: 'Chili : capitalisation totale + obligations de reconnaissance',
    summary: "Notre deuxième alternative est de suivre le modèle chilien. Ici, les cotisations basculent intégralement vers la capitalisation. Les droits acquis sont convertis en obligations indexées sur l'inflation, qui se remboursent à mesure que chaque cotisant prend sa retraite. La dette de transition est explicite et lisible — mais elle est massive si on ne la finance pas.",
    closestPreset: 'v1_default + chileMode (canonical toggle)',
    color: '#7c3aed',
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
  {
    id: 'chili_finance',
    num: 5,
    label: 'Chili + transition financée',
    short: 'Chili financé',
    headline: 'Chili financé : la dette de transition est visible et remboursée par le fonds',
    summary: "Même bascule que le Mode Chilien, mais le déficit de transition est affiché honnêtement comme dette publique (pic ~1 200 Md€ vers 2047, ~137 % du PIB). Les transferts du budget général déjà existants (CSG, FSV, TVA ≈ 40 Md€/an) continuent de couvrir une partie du solde. La dette restante est remboursée par un prélèvement de 2,5 %/an sur le fonds capitalisé (tauK), prélevé uniquement sur la croissance au-delà du plancher de solvabilité — les pensions ne sont jamais amputées. La dette est soldée vers 2060 et le fonds reste autonome jusqu'à la fin de l'horizon.",
    closestPreset: 'v1_default + chileMode + fiscalTransferMode:full',
    color: '#1e293b',
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
];
