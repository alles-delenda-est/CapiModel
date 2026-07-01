import { REFORMS } from '../reforms.js'

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

// Footnotes referenced in rung summaries via { fn: 'fn_1' } markers.
// Rendered by IntroPage as hover tooltips with optional URL.
export const FOOTNOTES = {
  fn_1: {
    num: 1,
    text: "La CDC est un établissement public financier créé en 1816, placé sous le contrôle direct du Parlement. Elle gère environ 170 Md€ d'actifs nets pour le compte de l'État. L'affectation de ses actifs au fonds de capitalisation fait du sens étant donné que la CDC est en réalité le gestionnaire de facto de l'épargne long-terme des Français — elle fait déjà ce qu'un fonds de capitalisation ferait, mais de manière opaque et sans lien direct avec les droits retraite individuels. Avec un fonds de départ pareil, le fonds de capitalisation pourrait assurer des rendements beaucoup plus importants pour les futurs retraités.",
    url: "https://fr.wikipedia.org/wiki/Caisse_des_d%C3%A9p%C3%B4ts_et_consignations",
  },
  fn_2: {
    num: 2,
    text: "Les logements sociaux font souvent l'actualité ces derniers temps, jamais pour des raisons flatteuses. Le système actuel est à bout de souffle : pendant que des proches de partis de gauche se voient octroyer les meilleures places pour y rester même en tant que député gagnant trois fois le SMIC, les gens en réel besoin attendent littéralement des années pour un foyer trop souvent vétuste, mal équipé, et encore heureux quand ce n'est pas tout simplement insalubre. Ici nous proposons du gagnant-gagnant : l'État, manifestement incapable de gérer le parc actuel, le liquide sur 10 ans, le concept du « logement social » est supprimé de la loi, et à la place la même partie du budget est donnée directement aux foyers les plus modestes pour se loger à leur guise.",
  },
}

export const LADDER_RUNGS = [
  {
    id: 'actuel',
    num: 1,
    label: 'Système actuel',
    short: 'Sans réforme',
    headline: 'Aujourd\u2019hui : un système par répartition sous perfusion',
    summary: "Avec la démographie actuelle, notre système par répartition suppose des transferts permanents du budget général (donc des autres taxes — CSG, FSV, TVA ≈ 40 Md€/an) pour boucler ses fins de mois, et cela ne suffit même pas car le budget de l’État est déficitaire pour cette raison. Sans réforme, la dépendance s’aggrave avec le vieillissement, et la dette avec. Le COR lui-même le chiffre dans son rapport de juin 2026 : avec le seul levier de l’âge, il faudrait partir à la retraite à 67,6 ans en 2070 pour équilibrer le système. La trajectoire mènerait, à terme, à la même situation que les Grecs, qui ont dû couper les dépenses de l’État à l’os.",
    closestPreset: 'derived (counterfactual + transferts BG actuels)',
    color: '#e05c4e',
    greekCollapse: REFORMS.actuel.greekCollapse,
    paramOverrides: REFORMS.actuel.paramOverrides,
  },
  {
    id: 'equinoxe',
    num: 2,
    label: 'Rééquilibrage Équinoxe',
    short: 'Équinoxe',
    headline: 'On rééquilibre : moins de pression sur le budget général',
    summary: "Le rééquilibrage proposé par Équinoxe réduit progressivement les retraites élevées, supprime l'abattement de 10 %, et restaure la CSG/CRDS à taux plein, sans toucher aux petites retraites. Ce rééquilibrage suffit pour que la France reste solvable, pour l'instant, mais les retraites restent structurellement dépendantes des transferts du budget général et de la démographie.",
    closestPreset: 'equinoxeOnly',
    color: '#e9c53d',
    greekCollapse: REFORMS.equinoxe.greekCollapse,
    paramOverrides: REFORMS.equinoxe.paramOverrides,
  },
  {
    id: 'suede',
    num: 3,
    label: 'Mode Suédois',
    short: 'Suède',
    headline: 'Suède : équilibrage automatique + petit pilier capi',
    summary: [
      "Cette proposition de réforme est inspirée du système suédois Inkomstpension (pension par revenu) + Premiepension (pension de prime), dernières « grandes réformes » dans un pays européen (1999). Dans ce modèle, nous restons dans un système par répartition, mais avec un compte notionnel par cotisant, complété par un petit pilier de capitalisation (contribution de 4 % des salaires, que les individus peuvent supplémenter). Le mécanisme d'équilibrage automatique (ABM) coupe l'indexation des retraites lorsque les ressources du système passent en-dessous des décaissements, gardant le système solvable sans recourir à la dette. Cette solution élimine le conflit intergénérationnel parce que les retraités et les actifs partagent les fruits de la croissance économique. ",
      "En option dans le simulateur, vous pouvez doper le fonds de capitalisation en y affectant les actifs nets de la Caisse des Dépôts et des Consignations ",
      { fn: 'fn_1' },
      " (CDC) et en liquidant le parc social sur 10 ans ",
      { fn: 'fn_2' },
      ".",
    ],
    closestPreset: 'v1_default + swedenMode (canonical toggle)',
    color: '#05c1ad',
    greekCollapse: REFORMS.suede.greekCollapse,
    paramOverrides: REFORMS.suede.paramOverrides,
  },
  {
    id: 'chili',
    num: 4,
    label: 'Mode Chilien',
    short: 'Chili',
    headline: 'Chili : capitalisation totale + obligations de reconnaissance',
    summary: [
      "Notre deuxième alternative est de suivre le modèle chilien. Ici, les cotisations basculent intégralement vers la capitalisation. Les droits acquis sont convertis en obligations indexées sur l'inflation, qui se remboursent à mesure que chaque cotisant prend sa retraite. La dette de transition est explicite et lisible — mais elle est massive si on ne la finance pas, même avec l'affectation des actifs nets de la Caisse des Dépôts et des Consignations ",
      { fn: 'fn_1' },
      " (CDC) et la liquidation du parc social sur 10 ans ",
      { fn: 'fn_2' },
      ".",
    ],
    closestPreset: 'v1_default + chileMode (canonical toggle)',
    color: '#9b72f0',
    greekCollapse: REFORMS.chili.greekCollapse,
    paramOverrides: REFORMS.chili.paramOverrides,
  },
  {
    id: 'chili_finance',
    num: 5,
    label: 'Chili + transition financée',
    short: 'Chili financé',
    headline: 'Chili financé : la dette de transition est visible et remboursée par le fonds',
    summary: "Même bascule que le Mode Chilien, mais le déficit de transition est affiché honnêtement comme dette publique (pic ~1 200 Md€ vers 2047, ~137 % du PIB). Les transferts du budget général déjà existants (CSG, FSV, TVA ≈ 40 Md€/an) continuent de couvrir une partie du solde. La dette restante est remboursée par un prélèvement de 2,5 %/an sur le fonds capitalisé (tauK), prélevé uniquement sur la croissance au-delà du plancher de solvabilité — les retraites ne sont jamais amputées. La dette est soldée vers 2060 et le fonds reste autonome jusqu'à la fin de l'horizon.",
    closestPreset: 'v1_default + chileMode + fiscalTransferMode:full',
    color: '#b8c1d1',
    greekCollapse: REFORMS.chili_finance.greekCollapse,
    paramOverrides: REFORMS.chili_finance.paramOverrides,
  },
  {
    id: 'capi_pur',
    num: 6,
    label: 'Capitalisation pure',
    short: 'Capi pur',
    headline: 'Capitalisation pure : bascule totale, dette explicite, pari sur le rendement',
    summary: "La version la plus radicale : tous les actifs (moins de 65 ans) basculent immédiatement en capitalisation. Leurs droits acquis sont convertis en obligations de reconnaissance — une dette explicite et lisible. Leurs cotisations vont intégralement dans le fonds dès le premier jour. L'État ne transfère rien, le fonds n'est pas prélevé. La dette de transition grandit librement pendant des décennies puis se rembourse organiquement lorsque les sorties du fonds dépassent les dépenses résiduelles PAYG. Le pari central : le rendement réel du fonds doit dépasser le taux d'intérêt de la dette sur 50+ ans. Si ce n'est pas le cas, la dette spirale sans issue.",
    closestPreset: 'pureCapi',
    color: '#22d3ee',
    greekCollapse: REFORMS.capi_pur.greekCollapse,
    paramOverrides: REFORMS.capi_pur.paramOverrides,
  },
];

// ------------------------------------------------------------------
// MECHANISMS — individual-level "how does this actually work for me?"
// explainers, keyed by rung id. Shown on demand in a modal / bottom-sheet
// (the ⓘ "Comment ça marche ?" button next to each rung headline), so the
// macro ladder stays uncluttered while curious readers can pull the detail.
//
// Each entry: { tagline, points: [{ k, v }], example?: { label, text } }.
// `points` answer the recurring questions a cotisant has — vehicle,
// contribution, yield, what happens to rights already earned, what they
// receive at retirement, and where the risk sits. `example` is an
// illustrative (non-binding) walk-through for one person.
// ------------------------------------------------------------------
export const MECHANISMS = {
  actuel: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Aucun compte à votre nom. Vos cotisations financent immédiatement les pensions des retraités d'aujourd'hui — c'est la répartition." },
      { k: 'Votre cotisation', v: "Environ 28 % de votre salaire brut (parts salariale et patronale) part dans les caisses et est reversé le mois même aux retraités actuels." },
      { k: 'Vos droits', v: "Vous accumulez des trimestres et des points : une promesse de l'État de vous verser plus tard une pension, qui sera financée par les cotisations des actifs de demain." },
      { k: 'Le rendement', v: "Il ne dépend pas des marchés mais de la démographie et de la masse salariale futures. Aujourd'hui il est négatif au sens où il faut des transferts du budget général pour boucler." },
      { k: 'Le risque', v: "Si la population active diminue — ce qui est en cours — la promesse devient impayable sans hausse d'impôts, baisse des pensions, ou dette supplémentaire." },
    ],
    example: {
      label: 'En une phrase',
      text: "Vous cotisez toute votre vie ; votre pension future est une créance sur les générations suivantes, pas une épargne que vous possédez.",
    },
  },
  equinoxe: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Toujours de la répartition pure : aucun compte individuel, aucune capitalisation. On garde le système actuel mais on en resserre les règles." },
      { k: 'Ce qui change', v: "Les retraites élevées sont progressivement rabotées, l'abattement fiscal de 10 % est supprimé, et la CSG/CRDS revient à taux plein sur les pensions." },
      { k: 'Pour les petites retraites', v: "Rien ne change : le rééquilibrage épargne les pensions modestes et ne touche pas à votre cotisation." },
      { k: 'Le rendement', v: "Inchangé dans son principe — c'est toujours la démographie qui commande. La réforme stabilise les comptes mais ne crée pas d'épargne à votre nom." },
      { k: 'La limite', v: "La France reste solvable pour un temps, mais les pensions restent dépendantes des transferts du budget général et du vieillissement." },
    ],
  },
  suede: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Deux poches. (1) Un compte notionnel à votre nom (Inkomstpension) : c'est toujours de la répartition, mais vos cotisations y sont inscrites et revalorisées selon la croissance des salaires. (2) Un petit pilier réellement capitalisé (Premiepension), investi sur les marchés." },
      { k: 'Votre cotisation', v: "Environ 16 % de votre salaire alimente le compte notionnel ; 4 % de plus sont réellement investis à votre nom, sur des fonds que vous choisissez (plus ou moins en actions)." },
      { k: 'Le rendement', v: "Le compte notionnel suit la croissance de la masse salariale ; le pilier capitalisé suit les marchés financiers. Vos cotisations « travaillent » au lieu d'être seulement une promesse." },
      { k: "L'équilibrage automatique", v: "Si les ressources du système passent sous ses engagements, l'indexation des pensions est automatiquement ralentie. La variable d'ajustement est l'indexation — jamais une nouvelle dette, jamais une hausse de cotisation surprise." },
      { k: 'À la retraite', v: "Votre capital notionnel et votre capital réel sont convertis en rente viagère calculée sur votre espérance de vie à la liquidation." },
    ],
    example: {
      label: 'À titre d’illustration — salaire médian',
      text: "Sur une carrière complète, le pilier capitalisé à 4 % constitue un complément qui peut représenter une part non négligeable de la pension finale, en plus du compte notionnel. Le partage des fruits de la croissance entre actifs et retraités éteint le conflit intergénérationnel.",
    },
  },
  chili: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Un compte de capitalisation individuel (type AFP chilien) ouvert à votre nom. La totalité de vos cotisations retraite y est investie sur les marchés, via des gestionnaires régulés." },
      { k: 'Vos droits déjà acquis', v: "Les années déjà cotisées avant la bascule sont converties en « obligations de reconnaissance » : un titre de dette de l'État, indexé sur l'inflation, qui vous est remis et remboursé au moment où vous partez à la retraite." },
      { k: 'Votre cotisation', v: "Elle ne finance plus les retraités actuels mais alimente directement votre propre capital, qui vous appartient et est transmissible." },
      { k: 'À la retraite', v: "Votre capital accumulé, plus le remboursement de vos obligations de reconnaissance, financent une rente ou un retrait programmé." },
      { k: 'La dette de transition', v: "Le point délicat : pendant des décennies, l'État doit continuer à payer les retraités actuels ET rembourser les obligations de reconnaissance, alors que les cotisations ne lui reviennent plus. D'où une dette de transition massive si elle n'est pas financée." },
    ],
    example: {
      label: 'À titre d’illustration',
      text: "Un actif de 40 ans reçoit une obligation de reconnaissance pour ses ~20 années déjà cotisées ; ses cotisations futures, elles, capitalisent sur son compte jusqu'à 65 ans. À la retraite, les deux se combinent.",
    },
  },
  chili_finance: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Identique au Mode Chilien pour vous : un compte de capitalisation individuel, cotisations intégralement investies à votre nom, droits acquis convertis en obligations de reconnaissance indexées sur l'inflation." },
      { k: 'Ce qui change', v: "La différence est au niveau de l'État, pas du vôtre. La dette de transition est affichée honnêtement comme dette publique (pic ~1 200 Md€ vers 2047) plutôt que cachée." },
      { k: 'Comment la dette est remboursée', v: "Par un prélèvement de 2,5 %/an sur le fonds capitalisé, pris uniquement sur la croissance au-delà du plancher de solvabilité. Concrètement : on ne ponctionne que le surplus de performance, jamais le capital nécessaire à votre pension." },
      { k: 'Votre pension', v: "Elle n'est jamais amputée. La dette est soldée vers 2060 et le fonds reste autonome ensuite, jusqu'à la fin de l'horizon." },
    ],
  },
  capi_pur: {
    tagline: 'Comment ça marche, concrètement, pour vous',
    points: [
      { k: 'Le véhicule', v: "Un compte de capitalisation individuel, comme le Chili — mais la bascule est totale et immédiate pour tous les actifs de moins de 65 ans, sans transition douce." },
      { k: 'Vos droits déjà acquis', v: "Tous convertis en obligations de reconnaissance dès le premier jour : une dette explicite et lisible de l'État envers vous, pour tout ce que vous avez déjà cotisé." },
      { k: 'Votre cotisation', v: "100 % de vos cotisations partent dans votre fonds dès le jour 1. Aucune ne finance plus les retraités actuels par la répartition." },
      { k: 'Le rôle de l’État', v: "L'État ne transfère rien au système et ne prélève jamais le fonds. La dette de transition grandit librement pendant des décennies, puis se rembourse organiquement quand les sorties du fonds dépassent les dépenses résiduelles." },
      { k: 'Le pari central', v: "Le rendement réel du fonds doit dépasser le taux d'intérêt de la dette sur 50 ans et plus. Si oui, la dette se résorbe seule ; si non, elle peut spiraler. C'est la version la plus rémunératrice mais la plus risquée." },
    ],
    example: {
      label: 'À titre d’illustration',
      text: "Dès la bascule, un actif de 30 ans capitalise l'intégralité de ses cotisations pendant 35 ans : c'est lui qui profite le plus de l'effet rendement composé — au prix d'une dette de transition supportée collectivement pendant la montée en charge.",
    },
  },
};
