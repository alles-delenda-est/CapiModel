import { useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  runSimulation, DEFAULT_CONFIG, DEMOGRAPHIC_PROFILES,
} from '../simulation-engine.js'
import { extractKPIs } from '../presets.js'
import ChartTooltip from '../components/ChartTooltip.jsx'
import './TransitionWalkthrough.css'

// =====================================================================
// CapiModel v1.0a — Transition Walkthrough
//
// Stages are defined by extending v1_default with stage-specific overrides.
// All five stages run once at component mount; charts layer prior stages
// as 0.25-opacity ghosts. Log-scale auto-switches at 100,000 Md€ peak
// total debt (existing + transition + cumulative interest), per Task 4 brief.
// =====================================================================

const BASE = DEFAULT_CONFIG

// Stage 1 — Status quo: realistic demographics, no reforms.
const STAGE_1 = {
  ...BASE,
  demoProfile: 'realistic',
  useEquinoxe: false,
  enableCapi: false,
  hlmDiscount: false,
  delta: 0,
  rho: 0,
  lambda: 0,
  // Flat employment trajectory (no labour reform yet).
  employmentRate0: 0.69,
  employmentRateTarget: 0.69,
}

// Stage 2 — Équinoxe: progressive bracket reduction + IR-deduction abolition
//  + CSG/CRDS restoration (full v1.0a three-component split).
const STAGE_2 = { ...STAGE_1, useEquinoxe: true }

// Stage 3 — Capi + HLM: cohort transition for under-50s + HLM cessions
//  + transition levy. v0.11 had two separate stages here (capi_brut +
//  hlm_cdc); v1.0a consolidates them into one per the Task 4 brief.
const STAGE_3 = {
  ...STAGE_2,
  enableCapi: true,
  cutoffAge: 50,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
}

// Stage 4 — Labour reform: employment rate target +10% over 8 years.
//  v1.0a uses employmentRateTarget directly; v0.11 had R_ramp + R_ramp_years.
//  0.69 × 1.10 = 0.759 (employment +10% from baseline).
const STAGE_4 = {
  ...STAGE_3,
  employmentRateTarget: 0.759,
  employmentTransitionYears: 8,
}

// Stage 5 — Demographic reform: switch to reformed demographic profile
//  (TFR 1.9 + migration +120k/yr + effective retirement → 67).
const STAGE_5 = {
  ...STAGE_4,
  demoProfile: 'reformed',
}

// Compute dependency-ratio change from t=0 to t=43 (year 2070, COR central
// horizon). Used for narrative figures. Formula matches spec §4 / §7.
function dependencyRatioChange(rows) {
  const r0 = rows[0].retireeIdx / rows[0].activePopFactor
  const r43 = rows[43].retireeIdx / rows[43].activePopFactor
  return (r43 / r0) - 1
}

// Peak total debt across the horizon = max(D_ext + D + CI). This is the
// metric the Task 4 brief uses for chip-colour assignment AND for log-scale
// auto-switch (threshold 100,000 Md€).
function peakTotalDebt(rows) {
  let peak = 0
  for (const r of rows) {
    const total = r.D_ext_t + r.D_t + r.CI_t
    if (total > peak) peak = total
  }
  return peak
}

const LOG_SCALE_THRESHOLD = 100_000  // Md€

// Format helpers ------------------------------------------------------

const fmtMd = (v) => {
  if (v == null || !Number.isFinite(v)) return '—'
  // For values ≥ 1M Md€, use M Md€ scale (per Task 4 brief).
  if (Math.abs(v) >= 1_000_000) return `${(v / 1e6).toFixed(2)} M Md€`
  const rounded = Math.round(v)
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')} Md€`
}
const fmtYear = (v) => (v ? String(v) : 'Jamais')
const fmtPctPP = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

const fmtDelta = (cur, prev, invert = false) => {
  if (cur == null || prev == null) return null
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null
  const d = cur - prev
  if (Math.abs(d) < 0.5) return null
  const sign = d > 0 ? '+' : ''
  const good = invert ? d < 0 : d > 0
  const cls = good ? 'tw-delta-good' : 'tw-delta-bad'
  let formatted
  if (Math.abs(d) >= 1_000_000) {
    formatted = `${sign}${(d / 1e6).toFixed(2)} M`
  } else {
    formatted = `${sign}${Math.round(d).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')}`
  }
  return { text: `${formatted} Md€`, cls }
}

const fmtTooltipVal = (v) => {
  if (typeof v !== 'number') return v
  if (Math.abs(v) >= 1_000_000) return `${(v / 1e6).toFixed(2)} M`
  if (Math.abs(v) >= 100) {
    return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  }
  return v.toFixed(1)
}

const stageOpacity = (i, current) => i === current ? 1.0 : 0.25

// =====================================================================
// Main component
// =====================================================================

export default function TransitionWalkthrough({ navigateTo }) {
  // Run all five stages once. Stable across renders.
  const sims = useMemo(() => {
    const stages = [
      { id: 'status_quo', params: STAGE_1 },
      { id: 'equinoxe',   params: STAGE_2 },
      { id: 'capi_hlm',   params: STAGE_3 },
      { id: 'labor',      params: STAGE_4 },
      { id: 'demographie', params: STAGE_5 },
    ]
    return stages.map(s => {
      const results = runSimulation(s.params)
      const kpis = extractKPIs(results)
      return {
        id: s.id,
        results,
        kpis,
        peakTotalDebt: peakTotalDebt(results),
        depRatioChange: dependencyRatioChange(results),
      }
    })
  }, [])

  // Stage chip categorical disposition (Task 4 §6).
  // catastrophic = (peak total debt > 100k Md€) OR (no debt-free year).
  // Verified empirically against v1.0a engine; matches v0.11 (Stages 1–4
  // catastrophic, Stage 5 clean) so no v0.11→v1.0a category flip occurred.
  const stageCategory = (i) => {
    const s = sims[i]
    if (s.peakTotalDebt > LOG_SCALE_THRESHOLD) return 'catastrophic'
    if (s.kpis.debtFreeYear == null) return 'catastrophic'
    return 'clean'
  }

  // Sanity check on dependency-ratio narrative figures vs spec §7.
  // realistic = +70%, reformed = +21%; tolerance ±5pp before escalation.
  // (Logged in dev console, not surfaced to UI.)
  if (typeof console !== 'undefined') {
    const realisticDR = sims[0].depRatioChange
    const reformedDR = sims[4].depRatioChange
    if (Math.abs(realisticDR - 0.70) > 0.05) {
      // eslint-disable-next-line no-console
      console.warn('[walkthrough] realistic dep ratio drift vs spec §7 +70% target:', fmtPctPP(realisticDR))
    }
    if (Math.abs(reformedDR - 0.21) > 0.05) {
      // eslint-disable-next-line no-console
      console.warn('[walkthrough] reformed dep ratio drift vs spec §7 +21% target:', fmtPctPP(reformedDR))
    }
  }

  // Stage definitions with dynamic narrative figures.
  const STAGES = [
    {
      id: 'status_quo',
      label: 'Statu quo',
      title: 'Statu quo avec démographie réaliste',
      changeHeadline: 'Aucune réforme',
      narrative: `Le système par répartition est maintenu tel quel. La courbe démographique réaliste retient un pic des retraités à ${DEMOGRAPHIC_PROFILES.realistic.peakMult.toFixed(2)}× le niveau de 2027 et un plateau à ${DEMOGRAPHIC_PROFILES.realistic.longRunMult.toFixed(2)}×, plus défavorable que les projections du COR (1,30× / 1,25×). Le ratio de dépendance change de ${fmtPctPP(sims[0].depRatioChange)} entre 2027 et 2070 — au-delà de la projection COR centrale (+42% vers +48% selon la source).`,
      chartExplain1: 'Les pensions versées (zone rouge + verte) croissent avec le nombre de retraités. Le financement courant (ligne bleue) suit la masse salariale. L’écart entre les deux alimente la dette de transition.',
      chartExplain2: 'Sans réforme et avec une démographie défavorable, la dette publique (zones bleues + ambre) explose. L’axe est en échelle logarithmique pour rester lisible.',
      debtLabel: 'Trajectoire dette actuelle',
    },
    {
      id: 'equinoxe',
      label: 'Équinoxe',
      title: 'Rééquilibrage Équinoxe (3 composantes)',
      changeHeadline: 'Réduction progressive des pensions élevées + restauration CSG/CRDS',
      narrative: 'Trois composantes (v1.0a) s’appliquent simultanément&nbsp;: (1) un barème progressif sur les pensions au-dessus de 1 800 €/mois (plafonné à 20% au-delà de 4 000 €) — ~17,7 Md€/an d’économies sur les pensions legacy uniquement&nbsp;; (2) abolition de l’abattement IR de 10% — ~5 Md€/an, legacy uniquement&nbsp;; (3) restauration de la CSG/CRDS taux plein sur tous les retraités (legacy ET capi) — ~5 Md€/an de recette fiscale. Total t=0&nbsp;: ~22,7 Md€/an d’économies côté prestation + ~5 Md€/an de recette côté impôt. Les trois trajectoires divergent dans le temps. Voir spec §5.5 pour le détail.',
      chartExplain1: 'La zone des pensions (rouge) recule par rapport à l’étape 1 (grisée) : Équinoxe réduit les prestations legacy. Le financement (bleu) inclut la recette CSG/CRDS qui croît avec retireeIdx(t).',
      chartExplain2: 'La dette de transition s’annule rapidement, mais la dette préexistante (zone bleu foncé) continue de croître avec le PIB et les intérêts cumulés (ambre) restent.',
      debtLabel: 'Trajectoire dette avec Équinoxe',
    },
    {
      id: 'capi_hlm',
      label: 'Capi + HLM',
      title: 'Capitalisation des cotisations + cessions HLM',
      changeHeadline: 'Cohorte des moins de 50 ans en capitalisation + 5%/an de cessions HLM',
      narrative: 'Les actifs âgés de 50 ans ou moins en 2027 basculent progressivement vers un régime par capitalisation (rendement réel 4,5%, voir spec §3.6). Les cotisations employeur restent prioritairement affectées au financement du passif legacy ; le surplus va à la capi. En parallèle, 5% du parc HLM est cédé chaque année pendant 20 ans (décote plafonnée à 30%, plus-values nettes captées par la CdC). Un prélèvement de transition de 30% sur les flux capi s’active environ 15 ans après la réforme pour rembourser la dette. v1.0a corrige le partage par tête en partage par actifs (spec §5.13)&nbsp;: les pensions capi reflètent la part actuarielle réelle des retraités dans le pot, ce qui augmente la pression sur le système (insuffisance capi visible).',
      chartExplain1: 'Les pensions capitalisation (vert) apparaissent au-dessus des pensions legacy (rouge). Le financement intègre les produits HLM, le prélèvement de transition, et la CSG/CRDS Équinoxe.',
      chartExplain2: 'Les pensions capi ne couvrent pas la totalité du besoin : la garantie d’État compense l’insuffisance par emprunt (CK_t cumulé). La trajectoire reste catastrophique dans cette étape.',
    },
    {
      id: 'labor',
      label: 'Marché du travail',
      title: 'Réforme du marché du travail',
      changeHeadline: 'Hausse du taux d’emploi de +10% sur 8 ans',
      narrative: 'Réforme du droit du travail (abolition CDI, allègement licenciement, refonte des transferts aux chômeurs/étudiants). Seul l’effet sur la participation au marché du travail est modélisé : le taux d’emploi 15-64 monte de 0,69 à 0,759 (+10%) sur 8 ans (cible OCDE médiane). Cela augmente la masse salariale, donc les cotisations, et le PIB. Les effets sur les salaires individuels et les économies budgétaires directes ne sont pas modélisés.',
      chartExplain1: 'Le financement courant (bleu) augmente avec la masse salariale. Les pensions legacy diminuent légèrement par rapport à l’étape 3 (effet indirect via active-pop dans la courbe E0_legacy_t).',
      chartExplain2: 'La dette de transition reste contenue (la dette préexistante continue de tracker le PIB) mais le système ne se désendette toujours pas dans l’horizon de 70 ans. La démographie reste le facteur limitant.',
    },
    {
      id: 'demographie',
      label: 'Démographie',
      title: 'Réforme démographique',
      changeHeadline: 'Profil démographique réformé (TFR 1,9 + migration +120k/an)',
      narrative: `Mesures structurelles sur la natalité et l’immigration qualifiée, plus l’allongement effectif de la vie active. Le profil démographique passe du scénario réaliste au scénario réformé : ratio de dépendance ${fmtPctPP(sims[4].depRatioChange)} entre 2027 et 2070 (vs ${fmtPctPP(sims[0].depRatioChange)} au statu quo). C’est la combinaison qui rend le système soutenable&nbsp;: les réformes fiscales et budgétaires des étapes précédentes ne suffisent pas seules.`,
      chartExplain1: 'Les pensions diminuent par rapport à l’étape 4 grâce au profil démographique moins défavorable. Le financement reste comparable.',
      chartExplain2: 'La dette se résorbe entièrement dans l’horizon. Le ratio dette/PIB repasse sous le niveau pré-réforme.',
    },
  ]

  const [currentStage, setCurrentStage] = useState(0)
  const cur = sims[currentStage]
  const prev = currentStage > 0 ? sims[currentStage - 1] : null

  // Auto-switch chart 2 to log scale when current stage's peak total debt
  // exceeds 100k Md€ (Task 4 brief §B.5).
  const useLogScale = cur.peakTotalDebt > LOG_SCALE_THRESHOLD

  // Build layered chart data — render stages 0..currentStage, the current
  // stage at full opacity, prior stages at 0.25 opacity.
  const chartData = useMemo(() => {
    const years = sims[0].results.map(r => r.year)
    return years.map((year, yi) => {
      const point = { year }
      for (let i = 0; i <= currentStage; i++) {
        const r = sims[i].results[yi]
        point[`legacyExp_${i}`] = r.legacyExp_t
        point[`capiPayout_${i}`] = r.capiPayout_t
        // "Funding courant" = total inflows to the legacy fund:
        //   non-employer revenue (eq 38, including S0_csg_revenue_t)
        //   + employer share routed to legacy (eq 40 → emplrToLeg_t)
        // Excluding debt interest cost (which is a deduction).
        point[`funding_${i}`] = r.fundReturn_t + r.H_t_proceeds + r.abatement_t
                              + r.C_s_payg_t + r.S0_csg_revenue_t + r.emplrToLeg_t
        point[`existingDebt_${i}`] = r.D_ext_t
        point[`transitionDebt_${i}`] = r.D_t
        point[`cumInterest_${i}`] = r.CI_t
        // debtRatio_t is already in % — keep as-is.
        point[`debtRatio_${i}`] = r.debtRatio_t
      }
      return point
    })
  }, [currentStage, sims])

  const deltas = prev
    ? {
        peakDebt: fmtDelta(cur.kpis.peakDebt, prev.kpis.peakDebt, true),
        totalInterest: fmtDelta(cur.kpis.totalInterest, prev.kpis.totalInterest, true),
        netPosition: fmtDelta(cur.kpis.netPosition, prev.kpis.netPosition, false),
      }
    : { peakDebt: null, totalInterest: null, netPosition: null }

  const debtFreeChanged = prev && prev.kpis.debtFreeYear !== cur.kpis.debtFreeYear

  const goPrev = () => setCurrentStage(s => Math.max(0, s - 1))
  const goNext = () => setCurrentStage(s => Math.min(STAGES.length - 1, s + 1))

  const tooltipChart1 = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const suffix = `_${currentStage}`
    const filtered = payload.filter(e => e.dataKey?.endsWith(suffix))
    return <ChartTooltip active={active} payload={filtered} label={label} unit="Md€" />
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
          const unit = isRatio ? '% PIB' : 'Md€'
          return (
            <div key={idx} className="ct-row">
              <span className="ct-dot" style={{ background: e.color }} />
              <span className="ct-name">{e.name}</span>
              <span className="ct-value">
                {fmtTooltipVal(Array.isArray(e.value) ? e.value[1] : e.value)} {unit}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="tw-app">
      <header className="tw-header">
        <h1>Parcours de la transition (v1.0a)</h1>
        <p className="tw-subtitle">
          Les cinq étapes de la réforme, superposées pas à pas sur le moteur v1.0a.
        </p>
      </header>

      {/* Stage chips */}
      <div className="tw-stepper" role="tablist" aria-label="Étapes de la transition">
        {STAGES.map((s, i) => {
          const cat = stageCategory(i)
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === currentStage}
              className={`tw-chip tw-chip-${cat} ${i === currentStage ? 'active' : ''} ${i < currentStage ? 'passed' : ''}`}
              onClick={() => setCurrentStage(i)}
              title={`${s.title} — ${cat === 'catastrophic' ? 'régime catastrophique' : 'soutenable'}`}
            >
              <span className="tw-chip-num">{i + 1}</span>
              <span className="tw-chip-label">{s.label}</span>
            </button>
          )
        })}
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
              <YAxis width={60} tick={{ fontSize: 13 }} label={{ value: 'Md€/an', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
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
                    name={isCurrent ? 'Pensions capi' : undefined}
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
          <h3>
            Dette publique et intérêts cumulés
            {useLogScale && <span className="tw-log-tag"> · échelle log auto</span>}
          </h3>
          <p className="tw-chart-explain">{STAGES[currentStage].chartExplain2}</p>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis yAxisId="left" width={70} tick={{ fontSize: 13 }}
                scale={useLogScale ? 'log' : 'auto'}
                domain={useLogScale ? [1, 'auto'] : ['auto', 'auto']}
                allowDataOverflow={useLogScale}
                label={{ value: useLogScale ? 'Md€ (log)' : 'Md€', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <YAxis yAxisId="right" orientation="right" width={55} tick={{ fontSize: 13 }}
                label={{ value: '% PIB', angle: 90, position: 'insideRight', dx: 8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
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
                    name={isCurrent ? 'Dette préexistante (D_ext)' : undefined}
                    legendType={isCurrent ? 'plainline' : 'none'} />,
                  <Area key={`td_${i}`} type="monotone" dataKey={`transitionDebt_${i}`} stackId={`debt_${i}`}
                    yAxisId="left"
                    fill="#60a5fa" fillOpacity={o * 0.35} stroke="#3b82f6" strokeOpacity={o}
                    strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                    name={isCurrent ? (STAGES[i].debtLabel ?? 'Dette de transition') : undefined}
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
        <p className="tw-stage-text" dangerouslySetInnerHTML={{ __html: STAGES[currentStage].narrative }} />

        <div className="tw-kpi-grid">
          <div className="tw-kpi">
            <div className="tw-kpi-label">Dette de transition maximale</div>
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
            <div className="tw-kpi-sub">capi − dette de transition</div>
            {deltas.netPosition && (
              <div className={`tw-kpi-delta ${deltas.netPosition.cls}`}>{deltas.netPosition.text}</div>
            )}
          </div>
        </div>

        <div className="tw-controls">
          <button className="tw-btn tw-btn-prev" onClick={goPrev} disabled={currentStage === 0}>
            ← Précédent
          </button>
          <button className="tw-btn tw-btn-next" onClick={goNext} disabled={currentStage === STAGES.length - 1}>
            Suivant →
          </button>
        </div>
      </section>

      <footer className="tw-footer">
        <p>
          Le moteur sous-jacent est celui de la{' '}
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
