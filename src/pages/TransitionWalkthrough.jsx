import { useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
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
// as 0.25-opacity ghosts. Charts truncate the x-axis at the first year
// where total debt ratio (existingDebt + D) / GDP exceeds 500%, with an
// annotation marking the divergence point ("modèle non applicable"). KPI
// cards always reflect the full 70-year simulation, regardless of chart
// truncation. Series that are zero throughout the rendered horizon are
// omitted from chart and legend (e.g. "Pensions capi" in stages 1–2).
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

// Stage 3 — Model change: capi cohort transition (under-50s) + labour
//  reform (employment +10% over 8 years). HLM/CdC funding NOT yet active.
//  Pedagogically isolates the transition cost: even with capi + labour,
//  the legacy fund needs additional financing or debt explodes.
const STAGE_3 = {
  ...STAGE_2,
  enableCapi: true,
  cutoffAge: 50,
  employmentRateTarget: 0.759,
  employmentTransitionYears: 8,
}

// Stage 4 — Transition financing: stage 3 + HLM cessions (5%/yr × 20 yrs,
//  decote ≤30%) + transition levy (30% on capi flows, redirected to
//  legacy debt repayment). The HLM proceeds + levy flip the debt
//  trajectory from divergent to bounded.
const STAGE_4 = {
  ...STAGE_3,
  hlmDiscount: true,
  delta: 0.3,
  rho: 0.05,
  T_hlm: 20,
  lambda: 0.30,
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

// Peak total debt across the horizon = max(D_ext + D + CI). Used for
// stage-chip colour assignment ("catastrophic" vs "clean").
function peakTotalDebt(rows) {
  let peak = 0
  for (const r of rows) {
    const total = r.D_ext_t + r.D_t + r.CI_t
    if (total > peak) peak = total
  }
  return peak
}

// Catastrophic chip colour applies above this peak-total-debt level.
const CATASTROPHIC_PEAK_DEBT = 100_000  // Md€

// Chart x-axis truncates at the first year where (existingDebt + D)/GDP
// exceeds this threshold. Verified empirically: stages 1–3 cross 500%
// well before t=69 (years 2069/2075/2062, peak ratios 37,700%/12,800%/
// 99,600% respectively); stages 4 and 5 never cross (peaks 272% / 180%)
// and render to full horizon naturally.
const TRUNCATION_THRESHOLD_PCT = 500

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
      { id: 'status_quo',  params: STAGE_1 },
      { id: 'equinoxe',    params: STAGE_2 },
      { id: 'capi_labor',  params: STAGE_3 },
      { id: 'hlm_cdc',     params: STAGE_4 },
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
    if (s.peakTotalDebt > CATASTROPHIC_PEAK_DEBT) return 'catastrophic'
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
      chart1Subtitle: 'Le statu quo : la faillite inévitable',
      chartExplain1: 'Les pensions versées (zone rouge) croissent avec le nombre de retraités. Le financement courant, c-à-d les cotisations (ligne bleue), suit la masse salariale. L’écart entre les deux grandit, le recours à la dette avec lui.',
      chartExplain2: 'Sans réforme et avec une démographie défavorable, la dette publique (zones bleues + ambre) explose. Afin de rester lisible, ce graphique s’arrête dès que la dette atteint 500% du PIB, un record absolu à ma connaissance, et de très loin. Bien avant d’arriver là la France ne pourrait plus payer les retraites.',
      debtLabel: 'Trajectoire dette actuelle',
    },
    {
      id: 'equinoxe',
      label: 'Équinoxe',
      title: 'Rééquilibrage Équinoxe (3 composantes)',
      changeHeadline: 'Réduction progressive des pensions élevées + restauration CSG/CRDS',
      narrative: 'Le rééquilibrage Équinoxe consiste en trois composantes : (1) des baisses progressives sur les pensions au-dessus de 1 800 €/mois (plafonné à 20% au-delà de 4 000 €) — ~17,7 Md€/an d’économies ; (2) abolition de l’abattement IR de 10% — ~5 Md€/an ; (3) restauration de la CSG/CRDS taux plein sur tous les retraités — ~5 Md€/an de recette fiscale. Total t=0 : ~22,7 Md€/an d’économies côté prestation + ~5 Md€/an de recette côté impôt.',
      chart1Subtitle: 'Réformer le modèle actuel : retarder (de peu) l’échéance',
      chartExplain1: 'La zone des pensions (rouge) diminue par rapport au statu quo (grisée) grâce au rééquilibrage Équinoxe. Le financement (bleu) augmente légèrement avec les recettes additionnelles de CSG/CRDS.',
      chartExplain2: 'Néanmoins, la facture reste hors de nos moyens. Ce graphique aussi s’arrête dès que la dette atteint 500% du PIB.',
      debtLabel: 'Trajectoire dette avec Équinoxe',
    },
    {
      id: 'capi_labor',
      label: 'Capi + Travail',
      title: 'Changement de modèle : capitalisation + marché du travail',
      changeHeadline: 'Bascule des moins de 50 ans en capitalisation + hausse du taux d’emploi (+10% sur 8 ans)',
      narrative: 'Les actifs âgés de 50 ans ou moins en 2027 basculent progressivement vers un régime par capitalisation (rendement réel 4,5%, voir spec §3.6). En parallèle, une réforme du marché du travail porte le taux d’emploi 15-64 de 0,69 à 0,759 (+10%) sur 8 ans, augmentant la masse salariale et donc les cotisations. À ce stade, aucun mécanisme de financement de la transition n’est encore activé : le besoin de financement double pendant la période de bascule (paiements legacy + accumulation capi), et la dette explose. Cette étape isole la nécessité d’un financement dédié à la transition.',
      chart1Subtitle: 'Changement de modèle : l’espoir sur l’horizon',
      chartExplain1: 'Si même des réformes du modèle actuel qui peuvent être considérées comme politiquement très ambitieuses ne peuvent que retarder l’échéance, il ne reste qu’à changer de modèle. Ce que nous (et beaucoup d’économistes !) proposons est, en gardant la partie plutôt sociale (AVS, etc.), à l’instar de presque tous nos voisins, de basculer sur la capitalisation. Par contre, toute seule cela ne marche pas : il y aura une période de paiement à double qui fera flamber la dette. Ce que nous présentons ici est donc l’introduction de la capitalisation avec aussi des réformes du marché du travail afin d’augmenter le nombre des cotisants.',
      chartExplain2: 'Sans financement dédié à la transition, la dette publique explose encore plus rapidement que dans le statu quo : aux dépenses legacy s’ajoutent les cotisations capitalisées qui ne sont plus disponibles pour les retraités actuels. Ce graphique s’arrête lui aussi dès que la dette atteint 500% du PIB.',
    },
    {
      id: 'hlm_cdc',
      label: 'HLM + CdC',
      title: 'Financement de la transition par cessions HLM',
      changeHeadline: 'Cessions HLM (5%/an × 20 ans) + prélèvement de transition de 30% sur les flux capi',
      narrative: 'Refonte du modèle social du logement : remplacement du parc HLM (opaque, susceptible d’abus d’attribution) par des allocations directes aux foyers les plus démunis, qu’ils choisissent leur logement sur le marché libre. 5% du parc HLM est cédé chaque année pendant 20 ans (décote plafonnée à 30%) ; les plus-values nettes sont captées par la CdC et fléchées vers le financement de la transition. En parallèle, un prélèvement de 30% sur les flux capi s’active progressivement (≈15 ans après la réforme) pour rembourser la dette accumulée pendant la bascule.',
      chart1Subtitle: 'Financement de la transition',
      chartExplain1: 'La France possède des actifs, actuellement peu performants, qui peuvent être mis à contribution. Nous proposons une refonte du modèle social de logement en transformant le système actuel — opaque et susceptible de copinage et d’autres abus — par des versements libres aux foyers les plus démunis, pour qu’ils puissent payer le loyer du bien qu’ils veulent, et non pas attendre 3 ans pour un appartement vétuste. Cela fait, nous revendons le « parc social » et mettons les bénéfices à contribution pour financer les retraites legacy pendant la transition.',
      chartExplain2: 'En vertu de l’apport additionnel du fonds au début de la transition, la dette totale baisse de manière significative. Cela devient déjà faisable.',
    },
    {
      id: 'demographie',
      label: 'Démographie',
      title: 'Réforme démographique',
      changeHeadline: 'Profil démographique réformé (TFR 1,9 + migration +120k/an)',
      narrative: `Mesures structurelles sur la natalité et l’immigration qualifiée, plus l’allongement effectif de la vie active. Le profil démographique passe du scénario réaliste au scénario réformé : ratio de dépendance ${fmtPctPP(sims[4].depRatioChange)} entre 2027 et 2070 (vs ${fmtPctPP(sims[0].depRatioChange)} au statu quo). C’est la combinaison qui rend le système soutenable : les réformes fiscales et budgétaires des étapes précédentes ne suffisent pas seules.`,
      chart1Subtitle: 'Réforme du modèle et du contexte',
      chartExplain1: 'Pour assurer notre avenir il faut aller plus loin et entamer des réformes démographiques. Les vingt dernières années ont été marquées par un fort recul du soutien de la famille. Nous suivrons la doctrine en implémentant une politique de soutien de la famille, afin d’augmenter les cotisants (ou amorcer leur baisse !).',
      chartExplain2: 'La dette se résorbe entièrement dans l’horizon. La trajectoire est désormais soutenable.',
    },
  ]

  const [currentStage, setCurrentStage] = useState(0)
  const cur = sims[currentStage]
  const prev = currentStage > 0 ? sims[currentStage - 1] : null

  // Build layered chart data + per-stage truncation + per-series activity.
  //
  // Truncation: drop years after (existingDebt + D)/GDP first crosses
  // TRUNCATION_THRESHOLD_PCT for the current stage. Applied uniformly to
  // every series rendered (current stage + ghost overlays from prior stages)
  // because they all read from the same sliced chartData.
  //
  // seriesActive[i][key]: true iff the series has at least one non-zero
  // value within the rendered slice. Used to omit zero-throughout series
  // (e.g. capiPayout in stages 1–2) from the chart and the legend.
  const { chartData, seriesActive, truncationYear } = useMemo(() => {
    // Per-stage truncation year (null → no truncation).
    const truncationYearForStage = (stageIdx) => {
      const r = sims[stageIdx].results
      for (let yi = 0; yi < r.length; yi++) {
        const ratio = (r[yi].D_ext_t + r[yi].D_t) / r[yi].GDP_t * 100
        if (ratio > TRUNCATION_THRESHOLD_PCT) return r[yi].year
      }
      return null
    }
    const truncationYear = truncationYearForStage(currentStage)
    const allRows = sims[0].results
    const lastIdx = truncationYear == null
      ? allRows.length - 1
      : allRows.findIndex(r => r.year === truncationYear)

    const data = []
    for (let yi = 0; yi <= lastIdx; yi++) {
      const point = { year: allRows[yi].year }
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
      }
      data.push(point)
    }

    const EPS = 1e-6
    const seriesKeys = ['legacyExp', 'capiPayout', 'funding',
      'existingDebt', 'transitionDebt', 'cumInterest']
    const seriesActive = {}
    for (let i = 0; i <= currentStage; i++) {
      seriesActive[i] = {}
      for (const k of seriesKeys) {
        const dk = `${k}_${i}`
        seriesActive[i][k] = data.some(p => Math.abs(p[dk]) > EPS)
      }
    }

    return { chartData: data, seriesActive, truncationYear }
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
          const unit = 'Md€'
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
          {STAGES[currentStage].chart1Subtitle && (
            <div className="tw-chart-subtitle">{STAGES[currentStage].chart1Subtitle}</div>
          )}
          <p className="tw-chart-explain">{STAGES[currentStage].chartExplain1}</p>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis width={60} tick={{ fontSize: 13 }} label={{ value: 'Md€/an', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={tooltipChart1} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              {truncationYear != null && (
                <ReferenceLine x={truncationYear} stroke="#6b7280" strokeDasharray="4 3"
                  label={{ value: 'Scénario impossible — modèle non applicable',
                    position: 'insideTopRight', fill: '#374151', fontSize: 12 }} />
              )}
              {Array.from({ length: currentStage + 1 }).flatMap((_, i) => {
                const o = stageOpacity(i, currentStage)
                const isCurrent = i === currentStage
                const elements = []
                if (seriesActive[i].legacyExp) {
                  elements.push(
                    <Area key={`le_${i}`} type="monotone" dataKey={`legacyExp_${i}`} stackId={`pensions_${i}`}
                      fill="#dc2626" fillOpacity={o * 0.35} stroke="#dc2626" strokeOpacity={o}
                      strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                      name={isCurrent ? 'Pensions legacy' : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                if (seriesActive[i].capiPayout) {
                  elements.push(
                    <Area key={`cp_${i}`} type="monotone" dataKey={`capiPayout_${i}`} stackId={`pensions_${i}`}
                      fill="#34d399" fillOpacity={o * 0.35} stroke="#059669" strokeOpacity={o}
                      strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                      name={isCurrent ? 'Pensions capi' : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                if (seriesActive[i].funding) {
                  elements.push(
                    <Line key={`fn_${i}`} type="monotone" dataKey={`funding_${i}`}
                      stroke="#2563eb" strokeOpacity={o} strokeWidth={isCurrent ? 2.5 : 1}
                      dot={false} isAnimationActive={false}
                      name={isCurrent ? 'Financement courant' : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                return elements
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
              <YAxis width={70} tick={{ fontSize: 13 }}
                label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
              <Tooltip content={tooltipChart2} />
              <Legend wrapperStyle={{ fontSize: 13 }} iconType="plainline" />
              {truncationYear != null && (
                <ReferenceLine x={truncationYear} stroke="#6b7280" strokeDasharray="4 3"
                  label={{ value: 'Scénario impossible — modèle non applicable',
                    position: 'insideTopRight', fill: '#374151', fontSize: 12 }} />
              )}
              {Array.from({ length: currentStage + 1 }).flatMap((_, i) => {
                const o = stageOpacity(i, currentStage)
                const isCurrent = i === currentStage
                const elements = []
                if (seriesActive[i].existingDebt) {
                  elements.push(
                    <Area key={`ed_${i}`} type="monotone" dataKey={`existingDebt_${i}`} stackId={`debt_${i}`}
                      fill="#1e40af" fillOpacity={o * 0.35} stroke="#1e40af" strokeOpacity={o}
                      strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                      name={isCurrent ? 'Dette préexistante (D_ext)' : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                if (seriesActive[i].transitionDebt) {
                  elements.push(
                    <Area key={`td_${i}`} type="monotone" dataKey={`transitionDebt_${i}`} stackId={`debt_${i}`}
                      fill="#60a5fa" fillOpacity={o * 0.35} stroke="#3b82f6" strokeOpacity={o}
                      strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                      name={isCurrent ? (STAGES[i].debtLabel ?? 'Dette de transition') : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                if (seriesActive[i].cumInterest) {
                  elements.push(
                    <Area key={`ci_${i}`} type="monotone" dataKey={`cumInterest_${i}`} stackId={`debt_${i}`}
                      fill="#d97706" fillOpacity={o * 0.35} stroke="#d97706" strokeOpacity={o}
                      strokeWidth={isCurrent ? 2 : 1} dot={false} isAnimationActive={false}
                      name={isCurrent ? 'Intérêts cumulés' : undefined}
                      legendType={isCurrent ? 'plainline' : 'none'} />
                  )
                }
                return elements
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
