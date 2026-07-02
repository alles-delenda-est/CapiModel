// The four "prices" the SimplifiedView surfaces (spec §4). Composes existing,
// tested pieces — it does not re-derive engine physics.
import { derivePerRetireePension } from './pension.js';
import { extractKPIs } from './presets.js';
import { applyGreekCollapseOverlay } from './pages/IntroLadderRungs.js';

export function extractSimplifiedKPIs(rows, { R0, baselinePerRetiree2027 }) {
  const row2070 = rows.find(r => r.year === 2070) ?? rows[rows.length - 1];

  // 1. Pension moyenne 2070 — delta vs pinned 2027 baseline (real €/mois).
  const pensionDelta2070 =
    derivePerRetireePension(row2070, R0) - baselinePerRetiree2027;

  // 2. Année de collapse — Project A's 250 % restructuring trigger, on TOTAL
  // sovereign debt (debtRatio_t = (D_ext_t + D_t)/GDP*100), matching the intro
  // ladder's canonical collapse semantics. The overlay mutates a copy in place;
  // we only read its return. null ⇒ the view shows "Système sain".
  const probe = rows.map(r => ({
    year: r.year, debt: r.D_t, debtRatio: r.debtRatio_t,
    rDeff: r.r_d_t, pension: 0, solde: 0,
  }));
  const collapse = applyGreekCollapseOverlay(probe, {
    debt: 'debt', debtRatio: 'debtRatio', rDeff: 'rDeff',
    pension: 'pension', solde: 'solde',
  });
  const collapseYear = collapse ? collapse.collapseYear : null;

  // 3. Sacrifices budgétaires — cumulative budget transfers, real €2027.
  const sacrificesReal = extractKPIs(rows).totalFiscalTransferReal;

  // 4. Fonds net 2070 — funded position at COR's horizon.
  const fondsNet2070 = row2070.K_t - row2070.D_t;

  return { pensionDelta2070, collapseYear, sacrificesReal, fondsNet2070 };
}
