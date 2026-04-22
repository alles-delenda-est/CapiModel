import { useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { runSimulation, extractKPIs, PRESETS } from '../simulation-engine.js'
import ChartTooltip from '../components/ChartTooltip.jsx'
import './TransitionWalkthrough.css'

// Stage-5 labor-reform parameters from grid search (scripts/calibrate-stage5.js).
// Pension-floor constraint is non-binding; picked values sit at upper R_ramp boundary.
const LABOR_REFORM_R_RAMP = 0.10
const LABOR_REFORM_R_RAMP_YEARS = 8

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
const STAGE_3 = { ...STAGE_2, cutoffAge: 50 }
const STAGE_4 = {
  ...STAGE_3,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
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
    chartExplain1:
      'Les pensions versées (zone rouge + verte) croissent avec le nombre de retraités. Le financement courant (ligne bleue) suit la masse salariale. L\u2019écart entre les deux alimente la dette de transition.',
    chartExplain2:
      'Sans réforme et avec une démographie défavorable, la dette publique (zones bleues) croît sans limite. Le ratio dette/PIB (axe droit, violet) diverge.',
    params: STAGE_1,
  },
  {
    id: 'equinoxe',
    label: 'Équinoxe',
    title: 'Rééquilibrage Équinoxe',
    changeHeadline: 'Réduction progressive des pensions élevées',
    narrative:
      'Un barème progressif s\u2019applique aux pensions au-dessus de 1\u202f800\u202f\u20ac/mois, plafonné à 20\u202f% au-delà de 4\u202f000\u202f\u20ac/mois. La mesure s\u2019active immédiatement et porte sur le stock existant comme sur les nouveaux retraités.',
    chartExplain1:
      'La zone des pensions (rouge) recule par rapport à l\u2019étape 1 (grisée)\u202f: l\u2019abattement Équinoxe réduit les prestations élevées. Le financement (bleu) reste comparable.',
    chartExplain2:
      'La dette croît moins vite que l\u2019étape précédente (grisée). Le ratio dette/PIB reste divergent mais le pic est retardé.',
    params: STAGE_2,
  },
  {
    id: 'capi_brut',
    label: 'Capitalisation',
    title: 'Transition vers la capitalisation (brut)',
    changeHeadline: 'Cotisations des moins de 50 ans vers la capitalisation',
    narrative:
      'Les actifs âgés de 50 ans ou moins en 2026 basculent progressivement vers un régime par capitalisation (rendement réel 3\u202f%). Les cotisations employeur sont affectées en priorité au financement du passif legacy. Le fonds par capitalisation est encore trop petit dans les premières années pour couvrir les pensions, et l\u2019État garantit le différentiel en empruntant. Sans prélèvement de transition ni financement complémentaire, la dette augmente par rapport à l\u2019étape précédente.',
    chartExplain1:
      'Les pensions capitalisation (vert) apparaissent au-dessus des pensions legacy (rouge). Le financement courant (bleu) intègre les cotisations restant dans le système par répartition.',
    chartExplain2:
      'La dette de transition (bleu clair) s\u2019ajoute à la dette existante (bleu foncé). Sans prélèvement de transition, la trajectoire est temporairement plus défavorable que l\u2019étape 2.',
    params: STAGE_3,
  },
  {
    id: 'hlm_cdc',
    label: 'HLM + CdC',
    title: 'Prélèvement de transition + mobilisation HLM/CdC',
    changeHeadline: 'Prélèvement de transition + cession progressive du parc HLM',
    narrative:
      'Le prélèvement de transition (30\u202f% des flux capitalisation, activé ~15 ans après la réforme) s\u2019ajoute aux cessions HLM (5\u202f% du parc par an pendant 20 ans, décote plafonnée à 30\u202f%). Les plus-values nettes, captées par la Caisse des Dépôts, complètent le prélèvement pour financer le passif legacy et réduire la dette accumulée aux étapes précédentes.',
    chartExplain1:
      'Le financement courant (bleu) augmente par rapport à l\u2019étape 3 grâce aux produits HLM et au prélèvement de transition. L\u2019écart pension\u2013financement se réduit.',
    chartExplain2:
      'La dette de transition atteint un pic puis commence à décroître. Les intérêts cumulés (ambre) ralentissent leur progression.',
    params: STAGE_4,
  },
  {
    id: 'labor',
    label: 'Marché du travail',
    title: 'Réforme du marché du travail',
    changeHeadline: 'Hausse du taux d\u2019emploi de +10\u202f% sur 8 ans',
    narrative:
      'Abolition du CDI, introduction d\u2019un droit de licenciement et réduction des transferts aux chômeurs et étudiants. Seul l\u2019effet sur la participation au marché du travail est modélisé\u202f: la masse salariale croît proportionnellement à l\u2019emploi, ce qui augmente les cotisations. Les effets sur les salaires et les économies budgétaires directes ne sont pas modélisés.',
    chartExplain1:
      'Le financement courant (bleu) augmente grâce à la hausse de la masse salariale. Les pensions restent identiques à l\u2019étape précédente.',
    chartExplain2:
      'La dette se résorbe plus rapidement. Les intérêts cumulés sont réduits par rapport à l\u2019étape 4 (grisée).',
    params: STAGE_5,
  },
  {
    id: 'demographie',
    label: 'Démographie',
    title: 'Réforme démographique',
    changeHeadline: 'Retour au profil démographique de référence',
    narrative:
      'Mesures visant à adoucir la pression démographique (natalité, immigration qualifiée, allongement effectif de la vie active). Le profil des retraités revient du profil pessimiste (pic 1,40× / plateau 1,35×) vers le profil de référence (pic 1,30× / plateau 1,25×).',
    chartExplain1:
      'Les pensions versées (rouge + vert) diminuent par rapport à l\u2019étape 5 grâce à un profil démographique moins défavorable. Le financement reste comparable.',
    chartExplain2:
      'La dette se résorbe entièrement. Le ratio dette/PIB (axe droit) repasse sous zéro, indiquant un désendettement complet.',
    params: STAGE_6,
  },
]

const stageOpacity = (i, current) => i === current ? 1.0 : 0.25

const fmtMd = (v) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const rounded = Math.round(v)
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019')} Md\u20ac`
}
const fmtYear = (v) => (v ? String(v) : 'Jamais')
const fmtDelta = (cur, prev, unit = 'Md\u20ac', invert = false) => {
  if (cur == null || prev == null) return null
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null
  const d = cur - prev
  if (Math.abs(d) < 0.5) return null
  const sign = d > 0 ? '+' : ''
  const good = invert ? d < 0 : d > 0
  const cls = good ? 'tw-delta-good' : 'tw-delta-bad'
  const rounded = Math.round(d)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019')
  return { text: `${sign}${formatted} ${unit}`, cls }
}

const fmtTooltipVal = (v) => {
  if (typeof v !== 'number') return v
  if (Math.abs(v) >= 100) return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019')
  return v.toFixed(1)
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

  const chartData = useMemo(() => {
    const years = sims[0].results.map(r => r.year)
    return years.map((year, yi) => {
      const point = { year }
      for (let i = 0; i <= currentStage; i++) {
        const r = sims[i].results[yi]
        point[`legacyExp_${i}`] = r.legacyExp
        point[`capiPayout_${i}`] = r.capiPayout
        point[`funding_${i}`] = r.emplC_s + r.emplC_e + r.fundReturn + r.levy + r.hlmProceeds
        point[`existingDebt_${i}`] = r.existingDebtCurrent
        point[`transitionDebt_${i}`] = r.debt
        point[`cumInterest_${i}`] = r.cumInterest
        point[`debtRatio_${i}`] = r.debtRatio * 100
      }
      return point
    })
  }, [currentStage, sims])

  const cur = sims[currentStage]
  const prev = currentStage > 0 ? sims[currentStage - 1] : null

  const deltas = prev
    ? {
        peakDebt: fmtDelta(cur.kpis.peakDebt, prev.kpis.peakDebt, 'Md\u20ac', true),
        totalInterest: fmtDelta(cur.kpis.totalInterest, prev.kpis.totalInterest, 'Md\u20ac', true),
        netPosition: fmtDelta(cur.kpis.netPosition, prev.kpis.netPosition, 'Md\u20ac', false),
      }
    : { peakDebt: null, totalInterest: null, netPosition: null }

  const debtFreeChanged = prev && prev.kpis.debtFreeYear !== cur.kpis.debtFreeYear

  const goPrev = () => setCurrentStage((s) => Math.max(0, s - 1))
  const goNext = () => setCurrentStage((s) => Math.min(STAGES.length - 1, s + 1))

  const tooltipChart1 = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const suffix = `_${currentStage}`
    const filtered = payload.filter(e => e.dataKey?.endsWith(suffix))
    return <ChartTooltip active={active} payload={filtered} label={label} unit="Md\u20ac" />
  }

  const tooltipChart2 = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const suffix = `_${currentStage}`
    const filtered = payload.filter(e => e.dataKey?.endsWith(suffix))
    return (
      <div className="ct-box">
        <div className="ct-year">Année {label}</div>
        {filtered.map((e, idx) => {
          const isRatio = e.dataKey?.startsWith('debtRatio')
          const unit = isRatio ? '% PIB' : 'Md\u20ac'
          return (
            <div key={idx} className="ct-row">
              <span className="ct-dot" style={{ background: e.color }} />
              <span className="ct-name">{e.name}</span>
              <span className="ct-value">{fmtTooltipVal(Array.isArray(e.value) ? e.value[1] : e.value)} {unit}</span>
            </div>
          )
        })}
      </div>
    )
  }

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

      {/* Chart 1: Pension flows */}
      <section className="tw-section">
        <div className="tw-chart-block">
          <h3>Pensions versées vs. financement</h3>
          <p className="tw-chart-explain">{STAGES[currentStage].chartExplain1}</p>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis width={60} tick={{ fontSize: 13 }} label={{ value: 'Md\u20ac/an', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={tooltipChart1} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              {Array.from({ length: currentStage + 1 }).flatMap((_, i) => {
                const o = stageOpacity(i, currentStage)
                const isCurrent = i === currentStage
                return [
                  <Area key={`le_${i}`} type="monotone" dataKey={`legacyExp_${i}`} stackId={`pensions_${i}`}
                    fill="#dc2626" fillOpacity={o * 0.35} stroke="#dc2626" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Pensions legacy' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Area key={`cp_${i}`} type="monotone" dataKey={`capiPayout_${i}`} stackId={`pensions_${i}`}
                    fill="#34d399" fillOpacity={o * 0.35} stroke="#059669" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Pensions capitalisation' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Line key={`fn_${i}`} type="monotone" dataKey={`funding_${i}`}
                    stroke="#2563eb" strokeOpacity={o} strokeWidth={isCurrent ? 2.5 : 1}
                    dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Financement courant' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                ]
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Debt and interest */}
        <div className="tw-chart-block">
          <h3>Dette publique et intérêts cumulés</h3>
          <p className="tw-chart-explain">{STAGES[currentStage].chartExplain2}</p>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis yAxisId="left" width={70} tick={{ fontSize: 13 }} label={{ value: 'Md\u20ac', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <YAxis yAxisId="right" orientation="right" width={55} tick={{ fontSize: 13 }} label={{ value: '% PIB', angle: 90, position: 'insideRight', dx: 8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={tooltipChart2} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              {Array.from({ length: currentStage + 1 }).flatMap((_, i) => {
                const o = stageOpacity(i, currentStage)
                const isCurrent = i === currentStage
                return [
                  <Area key={`ed_${i}`} type="monotone" dataKey={`existingDebt_${i}`} stackId={`debt_${i}`}
                    yAxisId="left"
                    fill="#1e40af" fillOpacity={o * 0.35} stroke="#1e40af" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Dette existante' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Area key={`td_${i}`} type="monotone" dataKey={`transitionDebt_${i}`} stackId={`debt_${i}`}
                    yAxisId="left"
                    fill="#60a5fa" fillOpacity={o * 0.35} stroke="#3b82f6" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Dette de transition' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Area key={`ci_${i}`} type="monotone" dataKey={`cumInterest_${i}`} stackId={`debt_${i}`}
                    yAxisId="left"
                    fill="#d97706" fillOpacity={o * 0.35} stroke="#d97706" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Intérêts cumulés' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Line key={`dr_${i}`} type="monotone" dataKey={`debtRatio_${i}`}
                    yAxisId="right"
                    stroke="#9333ea" strokeOpacity={o} strokeWidth={isCurrent ? 2.5 : 1}
                    strokeDasharray={isCurrent ? undefined : '4 2'}
                    dot={false} isAnimationActive={false}
                    name={isCurrent ? 'Ratio dette/PIB' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                ]
              })}
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
