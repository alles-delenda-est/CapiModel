// Live 1-D solver for the "Équilibre 2070" reform (spec §7). Auto-solves the
// employment rate so net debt at 2070 ≈ 0 under the CURRENT conditions. When the
// ceiling still cannot clear the debt, returns feasible:false → the view shows
// "Impossible d'équilibrer dans ces conditions sans autre levier".
import { runSimulation } from './simulation-engine.js';

// Load-bearing economic assumption (spec §7): the most optimistic aggregate
// 15–64 employment rate France could plausibly reach. Grounded (2026) in
// harmonised Eurostat/OECD 2024 data — the best-performing large diverse economy
// is the Netherlands (~82.3 %); France is ~68.8 % (INSEE 2024). 0.85 would require
// ~89 % participation (only Iceland, an atypical small economy, reaches it), so
// 0.82 is the defensible ceiling. Full derivation on the Hypothèses page.
export const EMPLOYMENT_CEILING = 0.82;

// "≈ 0" balance band, Md€. Matches the reforms.js contract's "self-financing"
// threshold (equilibre2070 has no capi, so netFund = −D_t; D_t < 50 ≈ balanced).
const DEFAULT_TOL = 50;

function netFundAtYear(config, year) {
  const rows = runSimulation(config);
  const r = rows.find(x => x.year === year) ?? rows[rows.length - 1];
  return r.K_t - r.D_t;
}

export function solveEquilibreEmployment(baseConfig, {
  targetYear = 2070, floor = 0.69, ceiling = EMPLOYMENT_CEILING,
  tol = DEFAULT_TOL, maxIter = 24,
} = {}) {
  const runAt = e => ({ ...baseConfig, employmentRateTarget: e });

  // netFund is monotone-increasing in employment. If even the ceiling can't
  // clear the debt (netFund < −tol), the package is infeasible.
  const netAtCeiling = netFundAtYear(runAt(ceiling), targetYear);
  if (netAtCeiling < -tol) {
    return { employmentRate: ceiling, feasible: false, netFund: netAtCeiling, config: runAt(ceiling) };
  }
  // If even the floor already over-clears (netFund > tol), the floor is enough.
  const netAtFloor = netFundAtYear(runAt(floor), targetYear);
  if (netAtFloor > tol) {
    return { employmentRate: floor, feasible: true, netFund: netAtFloor, config: runAt(floor) };
  }

  let lo = floor, hi = ceiling, mid = ceiling, net = netAtCeiling;
  for (let i = 0; i < maxIter; i++) {
    mid = (lo + hi) / 2;
    net = netFundAtYear(runAt(mid), targetYear);
    if (Math.abs(net) <= tol) break;
    if (net < 0) lo = mid; else hi = mid;   // need more employment ⇒ raise lo
  }
  return { employmentRate: mid, feasible: true, netFund: net, config: runAt(mid) };
}
