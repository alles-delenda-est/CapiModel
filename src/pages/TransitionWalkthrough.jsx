import { useState, useMemo } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { runSimulation, extractKPIs, PRESETS } from '../simulation-engine.js'
import ChartTooltip from '../components/ChartTooltip.jsx'
import './TransitionWalkthrough.css'

// Stage-5 labor-reform parameters come from a grid search minimizing
// cumulative interest subject to per-retiree real pension ≥ 2026 level.
// See scripts/calibrate-stage5.js. The pension-floor constraint is
// non-binding (indexation keeps real per-retiree constant), so the picked
// values sit at the upper boundary of the plausible grid.
const LABOR_REFORM_R_RAMP = 0.10
const LABOR_REFORM_R_RAMP_YEARS = 8

// Build a full parameter set for each stage, starting from the default
// preset and stacking reforms cumulatively. Stages 1–5 use the pessimistic
// demographic profile; stage 6 reverts to the reformed (closer to COR)
// profile to represent the effect of demographic reform.
const BASE = PRESETS.default.params

const STAGE_1 = {
  ...BASE,
  demoProfile: 'realistic',
  useEquinoxe: false,
  cutoffAge: null,
  hlmDiscount: false,
  delta: 0,
  rho: 0,
  lambda: 0,
  R_ramp: 0,
}
const STAGE_2 = { ...STAGE_1, useEquinoxe: true }
// Capi transition and the transition levy are a single policy package: the levy
// is what makes capitalisation fundable on the debt side, so they activate together.
const STAGE_3 = { ...STAGE_2, cutoffAge: 50, lambda: 0.30 }
const STAGE_4 = {
  ...STAGE_3,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
}
const STAGE_5 = {
  ...STAGE_4,
  R_ramp: LABOR_REFORM_R_RAMP,
  R_ramp_years: LABOR_REFORM_R_RAMP_YEARS,
}
const STAGE_6 = { ...STAGE_5, demoProfile: 'reformed' }

const STAGES = [
  {
    id: 'status_quo',
    label: 'Statu quo',
    title: 'Statu quo avec démographie réaliste',
    changeHeadline: 'Aucune réforme',
    narrative:
      'Le système par répartition est maintenu tel quel. La courbe démographique utilisée ici retient un pic des retraités à 1,40× le niveau de 2026 et un plateau à 1,35×, plus défavorable que les projections du COR (1,30× / 1,25×).',
    params: STAGE_1,
  },
  {
    id: 'equinoxe',
    label: 'Équinoxe',
    title: 'Rééquilibrage Équinoxe',
    changeHeadline: 'Réduction progressive des pensions élevées',
    narrative:
      'Un barème progressif s’applique aux pensions au-dessus de 1 800 €/mois, plafonné à 20 % au-delà de 4 000 €/mois. La mesure s’active immédiatement et porte sur le stock existant comme sur les nouveaux retraités.',
    params: STAGE_2,
  },
  {
    id: 'capi_brut',
    label: 'Capitalisation',
    title: 'Transition vers la capitalisation (brut)',
    changeHeadline: 'Cotisations des moins de 50 ans vers la capitalisation + prélèvement de transition',
    narrative:
      'Les actifs âgés de 50 ans ou moins en 2026 basculent progressivement vers un régime par capitalisation (rendement réel 3 %). Les cotisations employeur sont affectées en priorité au financement du passif legacy. Le prélèvement de transition (30 % des flux vers la capitalisation, activé 15 ans après la réforme) contribue au remboursement de la dette, mais à lui seul il ne suffit pas : le fonds par capitalisation est encore trop petit pour couvrir les premières pensions, et l’État garantit le différentiel en empruntant. La dette de transition augmente donc temporairement par rapport à l’étape précédente — c’est la bosse que le financement HLM/CdC, à l’étape suivante, vient absorber.',
    params: STAGE_3,
  },
  {
    id: 'hlm_cdc',
    label: 'HLM + CdC',
    title: 'Mobilisation HLM et CdC',
    changeHeadline: 'Cession progressive du parc HLM pour financer la transition',
    narrative:
      'Cession de 5 % du parc HLM par an pendant 20 ans, avec une décote de volume plafonnée à 30 %. Les plus-values nettes, captées par la Caisse des Dépôts, abondent le financement courant de la transition et comblent la bosse de dette créée à l’étape 3. C’est le pas qui fait véritablement basculer la trajectoire.',
    params: STAGE_4,
  },
  {
    id: 'labor',
    label: 'Marché du travail',
    title: 'Réforme du marché du travail',
    changeHeadline: 'Hausse du taux d’emploi de +10 % sur 8 ans',
    narrative:
      'Abolition du CDI, introduction d’un droit de licenciement et réduction des transferts aux chômeurs et étudiants. Seul l’effet sur la participation au marché du travail est modélisé : la masse salariale croît proportionnellement à l’emploi, ce qui augmente les cotisations. Les effets sur les salaires et les économies budgétaires directes ne sont pas modélisés.',
    params: STAGE_5,
  },
  {
    id: 'demographie',
    label: 'Démographie',
    title: 'Réforme démographique',
    changeHeadline: 'Retour au profil démographique de référence',
    narrative:
      'Mesures visant à adoucir la pression démographique (natalité, immigration qualifiée, allongement effectif de la vie active). Le profil des retraités revient du profil pessimiste (pic 1,40× / plateau 1,35×) vers le profil de référence (pic 1,30× / plateau 1,25×).',
    params: STAGE_6,
  },
]

const fmtMd = (v) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const rounded = Math.round(v)
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')} Md€`
}
const fmtYear = (v) => (v ? String(v) : 'Jamais')
const fmtDelta = (cur, prev, unit = 'Md€', invert = false) => {
  if (cur == null || prev == null) return null
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null
  const d = cur - prev
  if (Math.abs(d) < 0.5) return null
  const sign = d > 0 ? '+' : ''
  const good = invert ? d < 0 : d > 0
  const cls = good ? 'tw-delta-good' : 'tw-delta-bad'
  const rounded = Math.round(d)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  return { text: `${sign}${formatted} ${unit}`, cls }
}

export default function TransitionWalkthrough({ navigateTo }) {
  const [currentStage, setCurrentStage] = useState(0)

  const sims = useMemo(
    () => STAGES.map((s) => {
      const results = runSimulation(s.params)
      return { id: s.id, results, kpis: extractKPIs(results) }
    }),
    []
  )

  // Debt scales span >4 orders of magnitude across stages (millions of Md€ in
  // early runaway stages, tens of thousands once the reform stack stabilizes),
  // so layering prior stages onto the same axes is unreadable. Each stage is
  // plotted in isolation; the narrative and KPI deltas carry the cumulative
  // comparison.
  const chartData = useMemo(
    () => sims[currentStage].results.map((r) => ({
      year: r.year,
      pension: r.legacyExp + r.capiPayout,
      funding: r.emplC_s + r.emplC_e + r.fundReturn + r.hlmProceeds + r.abatement,
      debt: r.debt + r.existingDebtCurrent,
      interest: r.cumInterest,
    })),
    [currentStage, sims]
  )

  const cur = sims[currentStage]
  const prev = currentStage > 0 ? sims[currentStage - 1] : null

  const deltas = prev
    ? {
        peakDebt: fmtDelta(cur.kpis.peakDebt, prev.kpis.peakDebt, 'Md€', true),
        totalInterest: fmtDelta(cur.kpis.totalInterest, prev.kpis.totalInterest, 'Md€', true),
        netPosition: fmtDelta(cur.kpis.netPosition, prev.kpis.netPosition, 'Md€', false),
      }
    : { peakDebt: null, totalInterest: null, netPosition: null }

  const debtFreeChanged = prev && prev.kpis.debtFreeYear !== cur.kpis.debtFreeYear

  const goPrev = () => setCurrentStage((s) => Math.max(0, s - 1))
  const goNext = () => setCurrentStage((s) => Math.min(STAGES.length - 1, s + 1))

  return (
    <div className="tw-app">
      <header className="tw-header">
        <h1>Parcours de la transition</h1>
        <p className="tw-subtitle">
          Les six étapes de la réforme, superposées pas à pas sur le modèle.
        </p>
      </header>

      {/* Stage chips */}
      <div className="tw-stepper" role="tablist" aria-label="Étapes de la transition">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === currentStage}
            className={`tw-chip ${i === currentStage ? 'active' : ''} ${i < currentStage ? 'passed' : ''}`}
            onClick={() => setCurrentStage(i)}
            title={s.title}
          >
            <span className="tw-chip-num">{i + 1}</span>
            <span className="tw-chip-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Charts */}
      <section className="tw-section">
        <div className="tw-chart-block">
          <h3>Pensions versées vs. financement</h3>
          <p className="tw-chart-explain">
            Courbe rouge : total des pensions versées (répartition + capitalisation).
            Courbe verte : financement courant (cotisations, rendements du fonds legacy,
            produits des cessions HLM, abattement fiscal). L’écart entre les deux
            alimente la dette de transition ; celle-ci, par effet de composition des
            intérêts, pèse ensuite sur le graphique du dessous bien au-delà du seul
            écart visible ici.
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis width={60} tick={{ fontSize: 13 }} label={{ value: 'Md€/an', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={<ChartTooltip unit="Md€" />} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              <Line type="monotone" dataKey="pension" stroke="#dc2626" strokeWidth={2.5} name="Pensions versées" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="funding" stroke="#059669" strokeWidth={2.5} name="Financement courant" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="tw-chart-block">
          <h3>Dette publique totale et intérêts cumulés</h3>
          <p className="tw-chart-explain">
            Courbe bleue : somme de la dette française existante (3 200 Md€ en 2026,
            qui croît à son propre rythme) et de la dette de transition générée par
            le modèle. Courbe ambrée : intérêts cumulés payés depuis 2026. Les
            échelles varient fortement d’une étape à l’autre (cf. indicateurs ci-dessous).
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis width={70} tick={{ fontSize: 13 }} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={<ChartTooltip unit="Md€" />} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              <Line type="monotone" dataKey="debt" stroke="#2563eb" strokeWidth={2.5} name="Dette publique totale" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="interest" stroke="#d97706" strokeWidth={2.5} name="Intérêts cumulés" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Narrative + KPI delta */}
      <section className="tw-section tw-narrative">
        <div className="tw-stage-header">
          <div className="tw-stage-num">Étape {currentStage + 1}/{STAGES.length}</div>
          <h2>{STAGES[currentStage].title}</h2>
          <div className="tw-stage-change">{STAGES[currentStage].changeHeadline}</div>
        </div>
        <p className="tw-stage-text">{STAGES[currentStage].narrative}</p>

        <div className="tw-kpi-grid">
          <div className="tw-kpi">
            <div className="tw-kpi-label">Dette totale maximale</div>
            <div className="tw-kpi-value">{fmtMd(cur.kpis.peakDebt)}</div>
            <div className="tw-kpi-sub">en {cur.kpis.peakDebtYear ?? '—'}</div>
            {deltas.peakDebt && (
              <div className={`tw-kpi-delta ${deltas.peakDebt.cls}`}>{deltas.peakDebt.text}</div>
            )}
          </div>
          <div className="tw-kpi">
            <div className="tw-kpi-label">Année de désendettement</div>
            <div className="tw-kpi-value">{fmtYear(cur.kpis.debtFreeYear)}</div>
            <div className="tw-kpi-sub">{debtFreeChanged ? `précédemment ${fmtYear(prev.kpis.debtFreeYear)}` : ''}</div>
          </div>
          <div className="tw-kpi">
            <div className="tw-kpi-label">Intérêts cumulés (70 ans)</div>
            <div className="tw-kpi-value">{fmtMd(cur.kpis.totalInterest)}</div>
            <div className="tw-kpi-sub">paiements cumulés</div>
            {deltas.totalInterest && (
              <div className={`tw-kpi-delta ${deltas.totalInterest.cls}`}>{deltas.totalInterest.text}</div>
            )}
          </div>
          <div className="tw-kpi">
            <div className="tw-kpi-label">Position nette finale</div>
            <div className="tw-kpi-value">{fmtMd(cur.kpis.netPosition)}</div>
            <div className="tw-kpi-sub">capitalisation − dette</div>
            {deltas.netPosition && (
              <div className={`tw-kpi-delta ${deltas.netPosition.cls}`}>{deltas.netPosition.text}</div>
            )}
          </div>
        </div>

        <div className="tw-controls">
          <button
            className="tw-btn tw-btn-prev"
            onClick={goPrev}
            disabled={currentStage === 0}
          >
            ← Précédent
          </button>
          <button
            className="tw-btn tw-btn-next"
            onClick={goNext}
            disabled={currentStage === STAGES.length - 1}
          >
            Suivant →
          </button>
        </div>
      </section>

      <footer className="tw-footer">
        <p>
          Le modèle sous-jacent est le même que celui de la{' '}
          <a href="#/simulateur" onClick={(e) => { e.preventDefault(); navigateTo('simulateur') }}>
            version experte
          </a>
          {' '}; les hypothèses détaillées sont exposées dans{' '}
          <a href="#/hypotheses" onClick={(e) => { e.preventDefault(); navigateTo('hypotheses') }}>
            Hypothèses &amp; Sources
          </a>.
        </p>
      </footer>
    </div>
  )
}
