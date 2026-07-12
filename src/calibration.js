// Calibration-constants register — the single sourced-of-record for every
// externally-anchored constant in the model.
//
// WHY THIS EXISTS. Externally-sourced constants were previously scattered
// through the engine and the pages with thin provenance ("INSEE", not a
// table/number/date), and several displayed values had drifted from their
// sources. This module gives each constant one home with: value, unit, the
// engine key it feeds, and a document-grade source (publication, vintage,
// note/url). The Hypothèses page renders this table live, and a test
// (tests/calibration.test.js) asserts the register agrees with the engine
// DEFAULT_CONFIG for every overlapping key — so the two cannot silently
// diverge again.
//
// This module is DOCUMENTATION OF RECORD, not a behaviour change: it mirrors
// the values the engine already uses. Changing an engine number is a separate,
// fixture-regenerating change — do that in the engine and update the value
// here in the same commit.
//
// `note` is written to be honest about certainty. Where a component is not
// independently verifiable (e.g. the exact CDC allocation), it says so rather
// than implying a precision the source does not support.

/**
 * @typedef {Object} CalibConstant
 * @property {string} key      engine config key it feeds (or '—' if display-only)
 * @property {number|string} value
 * @property {string} unit
 * @property {string} label
 * @property {'S'|'C'|'M'} kind  S=sourced, C=calibrated, M=modelling assumption
 * @property {string} source   publication + vintage
 * @property {string} note     provenance detail, certainty, and any caveat
 */

/** @type {CalibConstant[]} */
export const CALIBRATION = [
  // --- macro / returns ---
  {
    key: 'pi', value: 0.02, unit: '/an', label: 'Inflation (π)', kind: 'M',
    source: 'Cible BCE',
    note: 'Convention de long terme; constante sur l’horizon (spec §5.1).',
  },
  {
    key: 'w_r', value: 0.004, unit: '/an', label: 'Croissance réelle du salaire (w_r)', kind: 'C',
    source: 'INSEE SMPT 2014–2024; COR RA2026',
    note: 'Moyenne INSEE ~0,4 %/an. Plus conservateur que le scénario central COR (0,7 %/an); c’est un choix, pas une contrainte.',
  },
  {
    key: 'r_c', value: 0.045, unit: '/an réel', label: 'Rendement réel attendu de la capitalisation (r_c)', kind: 'S',
    source: 'Norvège GPFG (NBIM) 1998–2025',
    note: 'Le GPFG affiche ~4,3 %/an RÉEL sur 1998–2025 (~6,6 % nominal). La valeur du modèle (4,5 %) est légèrement au-dessus de ce repère; à exposer comme curseur [2,5 %–6 %] (spec 0002). Une pénalité d’effet de taille (GE) réduit r_c au-delà de ~3× le PIB.',
  },
  {
    key: 'r_f_portfolio', value: 0.045, unit: '/an réel', label: 'Rendement réel du fonds legacy (r_f)', kind: 'S',
    source: 'Médiane historique OCDE, portefeuille 60/40',
    note: 'Utilisé par eq 36 (rendement fonds) et eq 58 (spread).',
  },
  {
    key: 'r_f_annuity', value: 0.015, unit: '/an réel', label: 'Taux de l’annuité indexée (OATi)', kind: 'S',
    source: 'OATi 2024–2026 (0,5–1,5 % réel)',
    note: 'Tarife l’annuité indexée du pot capi (eq 53). Distinct de r_f_portfolio: couverture au taux souverain indexé, pas au rendement diversifié.',
  },
  {
    key: 'r_d_base', value: 0.035, unit: '/an', label: 'Taux d’emprunt de base (r_d_base)', kind: 'S',
    source: 'OAT 10 ans 2026 (~3,25–3,88 %)',
    note: 'Hors prime de risque endogène (qui monte avec la dette/PIB). À exposer comme curseur (spec 0002).',
  },
  // --- sovereign stocks (2027 basis; only the ratio enters the model) ---
  {
    key: 'existingDebt', value: 3570, unit: 'Md€', label: 'Dette souveraine préexistante (base 2027)', kind: 'S',
    source: 'INSEE comptes nationaux (dette fin 2024 ≈ 3 305 Md€) projetée à 2027',
    note: 'Seul le ratio existingDebt/baseGDP entre dans le modèle (eq 32) = ~119 % en 2027. Ancré sur la dette fin-2024 (~3 305 Md€) + progression ~2 pp/an.',
  },
  {
    key: 'baseGDP', value: 3000, unit: 'Md€', label: 'PIB nominal (base 2027)', kind: 'S',
    source: 'INSEE (PIB 2024 ≈ 2 920 Md€) projeté à 2027',
    note: 'Base du ratio de dette; ~3 000 Md€ en 2027 sous inflation 2 % + croissance réelle.',
  },
  // --- pension system perimeter ---
  {
    key: 'R0', value: 18.0, unit: 'M', label: 'Nombre de retraités (base 2027, R0)', kind: 'C',
    source: 'DREES Édition 2025; COR RA2026',
    note: 'Le COR recense ~17,2 M retraités FIN 2023; +150–200 k/an → ~17,7–17,8 M fin 2026. La valeur 18,0 M inclut les ayants-droit (réversion). À scinder en droits directs vs survivants si le périmètre est resserré (PENDING #9).',
  },
  {
    key: 'E0', value: 413, unit: 'Md€/an', label: 'Dépense retraite totale (base 2027, E0)', kind: 'S',
    source: 'COR juin 2025/2026, scénario central',
    note: '≈ 13,8 % du PIB. = cotisations 367 + FSV/État 40 − solde (−6).',
  },
  {
    key: 'W0', value: 1320, unit: 'Md€', label: 'Masse salariale (base 2027, W0)', kind: 'S',
    source: 'INSEE comptes nationaux',
    note: 'Assiette des cotisations (tau_s, tau_e).',
  },
  {
    key: 'tau_s', value: 0.113, unit: '', label: 'Taux de cotisation salarié (tau_s)', kind: 'S',
    source: 'Barème URSSAF retraite',
  },
  {
    key: 'tau_e', value: 0.165, unit: '', label: 'Taux de cotisation employeur (tau_e)', kind: 'S',
    source: 'Barème URSSAF retraite',
  },
  // --- demography ---
  {
    key: 'lifeExpAt65_Y0', value: 21.82, unit: 'ans', label: 'Espérance de vie à 65 ans (2027)', kind: 'S',
    source: 'INSEE tables de mortalité',
  },
  {
    key: 'lifeExpAt65_per_decade', value: 0.91, unit: 'ans/décennie', label: 'Gain d’espérance de vie à 65 ans par décennie', kind: 'C',
    source: 'INSEE projections; COR RA2026',
    note: 'Pilote l’âge indexé (eq 12a). Une légère décélération apparaît dans les tables 2026 — à recalibrer au prochain millésime de données.',
  },
  // --- legacy fund starting value (F0) — component-level, honestly caveated ---
  {
    key: '—', value: '≈ 170–340', unit: 'Md€', label: 'Fonds de départ (F0) — composition indicative', kind: 'C',
    source: 'CDC (bilan public); FRR (rapport annuel); Agirc-Arrco (réserves)',
    note: 'Composantes: Agirc-Arrco ~85,6 Md€ de réserves (confirmé); FRR ~20 Md€ (et NON ~36); CDC actifs mobilisables ~170 Md€ (fn_1) — l’allocation exacte affectable à un fonds de transition n’est pas indépendamment vérifiable. F0 est fixé par preset; le total exact est une hypothèse de politique publique, pas une donnée.',
  },
  // --- policy package reference ---
  {
    key: '—', value: '≈ 10', unit: 'Md€/an', label: '« Contre-Budget 2026 » (paquet Équinoxe)', kind: 'M',
    source: 'Contre-Budget 2026 (référence à documenter)',
    note: 'Source de ~10 Md€/an du paquet Équinoxe (suppression abattement 10 % IR côté prestation; restauration CSG/CRDS taux plein côté recette). Référence à définir une fois et à rendre liable (actuellement non sourcée de façon vérifiable).',
  },
]
