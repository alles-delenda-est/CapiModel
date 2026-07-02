// Single source for the per-retiree pension figure. Consumed by IntroPage
// (the ladder) and SimplifiedView (Project B) so the same reform yields the
// same pension everywhere. Real €/month, deflated by I_factor_t.
export function derivePerRetireePension(row, R0) {
  const totalRetireesM = (row.retireeIdx ?? 0) * R0;
  if (totalRetireesM <= 1e-6) return 0;
  const totalPensionMdE =
    (row.legacyExp_t ?? 0)
    + (row.transitionalPaygExp_t ?? 0)
    + (row.ndcPaygPension_t ?? 0)
    + (row.capiPayout_t ?? 0);
  return (totalPensionMdE / totalRetireesM) / row.I_factor_t * 1000 / 12;
}
