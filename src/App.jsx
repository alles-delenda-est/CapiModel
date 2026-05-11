import { useState, useMemo, useCallback } from 'react'
import {
  LineChart, Line, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart,
  ScatterChart, Scatter, Cell,
} from 'recharts'
import { runSimulation, DEFAULT_CONFIG } from './simulation-engine.js'
import { PRESETS, extractKPIs } from './presets.js'
import useHashNavigation from './hooks/useHashNavigation.js'
import Navigation from './components/Navigation.jsx'
import EnhancedSlider from './components/EnhancedSlider.jsx'
import CollapsibleSection from './components/CollapsibleSection.jsx'
import CutoffSelector from './components/CutoffSelector.jsx'
import IndividualPerspectivePanel from './components/IndividualPerspectivePanel.jsx'
import IntroPage from './pages/IntroPage.jsx'
import SimplifiedView from './pages/SimplifiedView.jsx'
import HypothesesPage from './pages/HypothesesPage.jsx'
import TransitionWalkthrough from './pages/TransitionWalkthrough.jsx'

// --- Tooltip descriptions for each parameter (v1.0a) ---
const TIPS = {
  pi: "Le taux d'inflation annuel. Mesure la hausse générale des prix. La BCE vise 2% par an.",
  w_r: "La croissance annuelle des salaires au-delà de l'inflation (anchored sur ~0,4%/an INSEE 2014–2024).",
  r_f_portfolio: "Rendement réel du fonds legacy (CDC/FRR/Agirc-Arrco). Portefeuille institutionnel diversifié 60/40, médiane historique OCDE ~4,5% réel.",
  r_f_annuity: "Taux réel auquel l'État peut couvrir une rente indexée sur l'inflation (≈ OATi 2024–2026, ~1,5% réel). v1.0a sépare ce taux de r_f_portfolio pour résoudre l'arbitrage carry-trade.",
  r_c: "Rendement réel du pot de capitalisation. Anchored sur Norvège GPFG / Ontario Teachers' (~4,5% réel).",
  r_d_base: "Taux nominal de l'OAT 10 ans pré-réforme (~3,5% début 2026).",
  extraSpread: "Surcoût additionnel sur le taux d'emprunt, pour tester un stress financier.",
  cutoffAge: "Âge maximum en 2027 pour intégrer le régime de capitalisation. « Aucun » = bascule universelle.",
  retirementAgeBase: "Âge effectif de départ à la retraite (post-réforme 2023, France ≈ 64).",
  retirementAgeMode: "Indexation : « fixe » garde l'âge constant ; « indexé » l'augmente d'1/2 du gain d'espérance de vie à 65 ans (logique NDC suédoise/italienne).",
  useEquinoxe: "Active la réforme Équinoxe (réduction progressive des pensions élevées + restauration CSG/CRDS taux plein).",
  enableCapi: "Active le régime de capitalisation (sinon : 100% PAYG).",
  demoProfile: "Scénario démographique : COR central, réaliste (TFR ≤1,65), ou réformé (TFR 1,9 + migration).",
  employmentRateTarget: "Cible long-terme du taux d'emploi 15–64 (OCDE médiane ≈ 0,76).",
  employmentTransitionYears: "Durée de la rampe smoothstep vers la cible d'emploi.",
  constructionMultiplier: "Levier de libéralisation du foncier : >1 = libéralisation (impacte g_h et la décote HLM).",
  rho: "Fraction du parc HLM vendue chaque année (5% = ~265 000 logements/an).",
  delta: "Sensibilité du prix HLM au volume vendu.",
  hlmDiscount: "Applique une décote volume aux prix HLM.",
  lambda: "Fraction des flux de capi prélevée pour rembourser la dette de transition.",
  alpha: "Fraction du surplus annuel dirigée vers le remboursement de dette (1 = total).",
  tauK: "⚠️ Paramètre expert v1.2 — Prélèvement annuel sur le stock K_t du fonds capi → remboursement dette de transition. Fires uniquement si D_t > 0 ; s'arrête automatiquement une fois la dette remboursée. Un plancher de solvabilité empêche K_t de tomber sous le niveau nécessaire pour servir la rente garantie. Optimum empirique ≈ 3,0 % : peak debt −75 %, intérêts totaux −88 %, dette terminale ≈ 12 Md€ à t=69. Plafond de sécurité < 3,5 % : à 3,5 % K_t tombe à 0 en fin d'horizon, déclenchant la garantie d'État et un pic terminal de dette. Interaction λ : λ réduit les flux entrant dans K_t (eq 45) et tauK réduit le stock de K_t (eq 57+) — les deux sont additifs ; réduire λ si tauK > 0.",
  Tlambda: "Année à partir de laquelle le prélèvement de transition s'active (smoothing ±1 an).",
  phiF: "Plancher employeur vers la capitalisation (0 = waterfall complet vers legacy d'abord).",
  thetaBuffer: "Réserve de croissance annuelle du fonds capi : la fraction de la croissance de K_t au-delà de θ × K_t est automatiquement reversée au remboursement de la dette de transition. Agit uniquement quand K_t croît (ne touche jamais au principal). Porte D_t/PIB comme gate : inactive sous 10 % D/PIB, pleinement active au-delà de 50 %. À θ = 1 % (défaut) : pic dette −81 % (1 713 vs 9 036 Md€), quasi-extinction de la dette en 2072. Se désactive naturellement à zéro quand D_t = 0.",
  deltaTauxPatronal: "Baisse du taux de cotisation employeur, activée en année 2 de la réforme (2029). Sans compensation tauK, tout delta > 0 provoque une spirale de dette catastrophique (ex. 0,5 % seul → pic 55 000 Md€). Plage viable : 0–1 % avec tauK ≈ 1,5–5×delta. Optimum v1.3 à delta=0,5 % : tauK=2,5 % → intérêts totaux −80 %, dette terminale 17 Md€, allègement initial ≈7 Md€/an (2029), allègement éventuel ≈630 Md€/an (fin d'horizon).",
  T_hlm: "Durée du programme de cession HLM (5 ans de taper en fin).",
  capiAssetShareSteadyState: "Part actuarielle de long terme du pot capi détenue par les retraités (vs travailleurs en accumulation). Eq (53a) v1.0a remplace le partage par tête (qui exproprait les travailleurs).",
  equinoxePhasing: "Profil temporel de mise en œuvre Équinoxe : immediate, phased-5y/-10y, partial-50/-75.",
  K_debt_trigger: "Seuil K_t (Md€) de déclenchement du remboursement de dette prioritaire dans la cascade v2.0. En dessous du seuil : le surplus de rendement réel va aux retraités capi (bonus). Au-dessus : il rembourse la dette de transition en priorité. Valeur optimale ≈ 8 000 Md€ — protège la génération transitionnelle 2047–2066 (+30 % de versement) tout en assurant une dette à zéro vers 2073. Régler à 0 pour le mode dette-en-priorité constant ; 30 000 Md€ = report total (jamais remboursé).",
}

function Toggle({ label, checked, onChange, tip }) {
  return (
    <div className="toggle-row" title={tip}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <label>{label} {tip && <span className="tip-icon">?</span>}</label>
    </div>
  )
}

// --- Format helpers ---
const fmtN = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')
const fmtMd = v => `${fmtN(v)} Md`
const fmtPct = v => `${(v * 100).toFixed(2)}%`
const fmtYear = v => v ? `${v}` : 'Jamais'

// --- Detect legacy v0.11 share-URL parameters and notify (Task 3 §Routing) ---
function hasLegacyShareUrl() {
  const sp = new URLSearchParams(window.location.search)
  return sp.has('existingDebtGrowth') || sp.has('r_f') || sp.has('tauS') ||
         sp.has('tauE') || sp.has('Tpk') || sp.has('Thl') || sp.has('preset')
}

// --- v1.0a row schema → chart-friendly fields ---
function rowToChart(r) {
  return {
    year: r.year,
    // Revenues into nonEmplrNet (eq 38)
    fundReturn: r.fundReturn_t,
    hlmProceeds: r.H_t_proceeds,
    abatement: r.abatement_t,
    emplrToLeg: r.emplrToLeg_t,
    csgRevenue: r.S0_csg_revenue_t,    // v1.0a NEW chart row
    // Expenditure
    legacyExp: r.legacyExp_t,
    capiPayout: r.capiPayout_t,
    totalPensionExp: r.legacyExp_t + r.capiPayout_t,
    // Stocks & rates
    debt: r.D_t,
    r_d: r.r_d_t * 100,
    capi: r.K_t,
    capiReal: r.K_t / Math.pow(1 + 0.02, r.t),
    spread: r.spread_t * 100,
    // Flows for the bar chart
    emplC_s_toCapi: r.C_s_capi_t,
    emplC_s_toPayg: r.C_s_payg_t,
    emplrToLeg_bar: r.emplrToLeg_t,
    emplrToCap_bar: r.emplrToCap_t,
    levy: r.levy_t,
    // NPV
    pvLegacyCum: r.pvLegacyCum_t,
    pvCapiPayoutCum: r.pvCapiPayoutCum_t,
    gdp: r.GDP_t,
  }
}

// --- Table columns (v1.0a field names) ---
const TABLE_COLUMNS = [
  { key: 'year',        label: 'Année',     always: true,  render: r => r.year },
  { key: 'D_t',         label: 'Dette',     always: true,  render: r => fmtN(r.D_t) },
  { key: 'debtRatio_t', label: 'Dette/PIB', always: true,  render: r => `${r.debtRatio_t.toFixed(1)}%` },
  { key: 'legacyExp_t', label: 'Dép. legacy', always: true, render: r => r.legacyExp_t.toFixed(1) },
  { key: 'capiPayout_t', label: 'Dép. capi', always: true, render: r => r.capiPayout_t.toFixed(1) },
  { key: 'capiReal',    label: 'Capi réel', always: true,  render: r => fmtN(r.K_t / Math.pow(1.02, r.t)) },
  { key: 'r_d_t',       label: 'r_d (%)',   always: true,  render: r => (r.r_d_t * 100).toFixed(2) },
  { key: 'spread_t',    label: 'Spread',    always: true,  render: r => `${(r.spread_t * 100).toFixed(2)}%` },
  { key: 'cohIdx',      label: 'φ_t',       always: false, render: r => r.cohIdx.toFixed(3) },
  { key: 'capiAssetShare_t', label: 'Asset share', always: false, render: r => r.capiAssetShare_t.toFixed(3) },
  { key: 'fundReturn_t', label: 'Rend. fonds', always: false, render: r => r.fundReturn_t.toFixed(1) },
  { key: 'H_t_proceeds', label: 'HLM',     always: false, render: r => r.H_t_proceeds.toFixed(1) },
  { key: 'abatement_t', label: 'Abatt.',   always: false, render: r => r.abatement_t.toFixed(1) },
  { key: 'S0_csg_revenue_t', label: 'CSG (rec.)', always: false, render: r => r.S0_csg_revenue_t.toFixed(1) },
  { key: 'C_s_capi_t',  label: 'Sal.→capi', always: false, render: r => r.C_s_capi_t.toFixed(1) },
  { key: 'emplrToLeg_t', label: 'Empl.→leg', always: false, render: r => r.emplrToLeg_t.toFixed(1) },
  { key: 'emplrToCap_t', label: 'Empl.→cap', always: false, render: r => r.emplrToCap_t.toFixed(1) },
  { key: 'debtInterest_t', label: 'Int. dette', always: false, render: r => r.debtInterest_t.toFixed(1) },
  { key: 'netFlow_t',   label: 'Flux net', always: false, render: r => r.netFlow_t.toFixed(1) },
  { key: 'borrowed_t',  label: 'Emprunt',  always: false, render: r => r.borrowed_t.toFixed(1) },
  { key: 'levy_t',      label: 'Prélèv.',  always: false, render: r => r.levy_t.toFixed(1) },
  { key: 'K_t',         label: 'Capi nom.', always: false, render: r => fmtN(r.K_t) },
]

const CHART_TABS = [
  { id: 'depenses',       label: 'Dépenses' },
  { id: 'dette',          label: 'Dette & Taux' },
  { id: 'capitalisation', label: 'Capitalisation' },
  { id: 'flux',           label: 'Flux & VAN' },
]

// --- Main App ---
export default function App() {
  const { currentPage, navigateTo } = useHashNavigation('simulateur')
  // PR #18: user-facing default is the BALANCED cascade. Engine DEFAULT_CONFIG
  // keeps 'legacy' so v1.3 tests stay bit-identical; App overrides here.
  const [params, setParams] = useState({ ...DEFAULT_CONFIG, cashFlowMode: 'balanced' })
  const [activePreset, setActivePreset] = useState('v1_default')
  const [showParams, setShowParams] = useState(true)
  const [showTable, setShowTable] = useState(true)
  const [showAllRows, setShowAllRows] = useState(false)
  const [expertMode, setExpertMode] = useState(false)
  const [activeChartTab, setActiveChartTab] = useState('depenses')
  const [showAllColumns, setShowAllColumns] = useState(false)
  const [legacyUrlNoticeDismissed, setLegacyUrlNoticeDismissed] = useState(false)
  const showLegacyUrlNotice = useMemo(hasLegacyShareUrl, [])

  const setParam = useCallback((key, value) => {
    setParams(prev => ({ ...prev, [key]: value }))
    setActivePreset(null)
  }, [])

  const applyPreset = useCallback((key) => {
    setParams({ ...PRESETS[key].params })
    setActivePreset(key)
  }, [])

  const { results, kpis } = useMemo(() => {
    const results = runSimulation(params)
    const kpis = extractKPIs(results)
    return { results, kpis }
  }, [params])

  const exportCSV = useCallback(() => {
    const R0 = params.R0 ?? 18;
    const headers = [
      'Annee',
      'Dep_legacy_MdE','Dep_capi_MdE','Total_pensions_MdE',
      'Rend_fonds_MdE','HLM_MdE','Abattement_MdE','CSG_recettes_MdE',
      'Sal_capi_MdE','Empl_leg_MdE','Empl_cap_MdE',
      'Int_dette_MdE','Flux_net_MdE','Emprunt_MdE','Prelev_MdE','Dette_MdE',
      'Capi_nom_MdE','Capi_reel_MdE',
      'r_d_pct','Spread_pct',
      'Workers_active_M',
      'Retirees_total_M','Retirees_legacy_M','Retirees_transition_M','Retirees_capi_pure_M',
      'Avg_legacy_kE_pa','Avg_capi_kE_pa',
    ]
    const rows = results.map(r => {
      const workersM = 30 * (r.activePopFactor ?? 1) * (r.empFactor ?? 1);
      const retTotalM = (r.retireeIdx ?? 0) * R0;
      const retLegacyM = (r.legacyRetirees ?? 0) * R0;
      const capiRetM = (r.capiRetirees ?? 0) * R0;
      const legacyShare = r.legacyShareAvg ?? 0;
      const retTransitionM = capiRetM * legacyShare;
      const retCapiPureM = capiRetM * (1 - legacyShare);
      const avgLegacyKE = retLegacyM > 0.001 ? (r.legacyExp_t / retLegacyM) * 1000 : 0;
      const avgCapiKE = capiRetM > 0.001 ? (r.capiPayout_t / capiRetM) * 1000 : 0;
      return [
        r.year,
        r.legacyExp_t.toFixed(1), r.capiPayout_t.toFixed(1),
        (r.legacyExp_t + r.capiPayout_t).toFixed(1),
        r.fundReturn_t.toFixed(1), r.H_t_proceeds.toFixed(1), r.abatement_t.toFixed(1),
        r.S0_csg_revenue_t.toFixed(1),
        r.C_s_capi_t.toFixed(1), r.emplrToLeg_t.toFixed(1), r.emplrToCap_t.toFixed(1),
        r.debtInterest_t.toFixed(1), r.netFlow_t.toFixed(1), r.borrowed_t.toFixed(1),
        r.levy_t.toFixed(1), r.D_t.toFixed(1),
        r.K_t.toFixed(0), (r.K_t / Math.pow(1.02, r.t)).toFixed(0),
        (r.r_d_t * 100).toFixed(2), (r.spread_t * 100).toFixed(2),
        workersM.toFixed(2),
        retTotalM.toFixed(2), retLegacyM.toFixed(2), retTransitionM.toFixed(2), retCapiPureM.toFixed(2),
        avgLegacyKE.toFixed(1), avgCapiKE.toFixed(1),
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'capimodel_v1_simulation.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [results, params])

  const chartData = useMemo(() => results.map(rowToChart), [results])

  // κ–φ parameter sweep for Pareto chart (peak debt vs capi payout ratio).
  // κ = debtSweepKCap (actual binding sweep constraint), φ = annuityFloorRate.
  // These two parameters create genuine spread on both axes.
  const KAPPA_VALUES = [0.003, 0.006, 0.010, 0.018, 0.030];
  const PHI_VALUES   = [0.008, 0.010, 0.015, 0.020, 0.030];
  const KAPPA_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const sweepData = useMemo(() => {
    if (!results.length) return [];
    return KAPPA_VALUES.flatMap((kappa, ki) =>
      PHI_VALUES.map(phi => {
        const p = { ...params, debtSweepKCap: kappa, annuityFloorRate: phi };
        const rows = runSimulation(p);
        const peakDebt = Math.max(...rows.map(r => r.D_t));
        const capiRows = rows.filter(r => r.capiPayoutFloor_t > 0.1 && (r.annuityRate_t ?? 0) > 0.001);
        const avgRatio = capiRows.length > 0
          ? capiRows.reduce((sum, r) => {
              const actuarial = (r.capiPayoutFloor_t / phi) * r.annuityRate_t;
              return sum + (actuarial > 0.1 ? r.capiPayout_t / actuarial : 1);
            }, 0) / capiRows.length
          : 0;
        return { kappa, phi, peakDebt: peakDebt / 1000, avgRatio: avgRatio * 100, ki };
      })
    );
  }, [params, results.length])

  const p = params

  return (
    <div className="app">
      <header className="header">
        <h1>CapiModel v1.0a — Transition Retraites PAYG → Capitalisation</h1>
        <p className="subtitle">Simulateur — moteur v1.0a</p>
      </header>

      <Navigation currentPage={currentPage} navigateTo={navigateTo} />

      {currentPage === 'intro' && <IntroPage navigateTo={navigateTo} />}
      {currentPage === 'simple' && <SimplifiedView navigateTo={navigateTo} />}
      {currentPage === 'walkthrough' && <TransitionWalkthrough navigateTo={navigateTo} />}
      {currentPage === 'hypotheses' && <HypothesesPage />}
      {currentPage === 'simulateur' && <>

      {/* INDIVIDUAL PERSPECTIVE — top of page, collapsible */}
      <section className="section">
        <CollapsibleSection title="Et pour vous ?" level="normal" defaultOpen={false}>
          <IndividualPerspectivePanel params={params} reformResults={results} />
        </CollapsibleSection>
      </section>

      {showLegacyUrlNotice && !legacyUrlNoticeDismissed && (
        <section className="section" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }}>
          <p style={{ margin: 0 }}>
            <strong>URL legacy détectée.</strong> Cette URL contient des paramètres v0.11
            (par ex. <code>existingDebtGrowth</code>, <code>r_f</code>) qui ne sont plus
            supportés par le moteur v1.0a. Le simulateur s'est ouvert avec les valeurs par
            défaut v1.0a. Voir notes de migration dans la page « Hypothèses ».
            <button onClick={() => setLegacyUrlNoticeDismissed(true)}
              style={{ marginLeft: 12 }}>OK</button>
          </p>
        </section>
      )}

      {/* PRESETS */}
      <section className="section preset-section">
        <h2>Scénarios v1.0a</h2>
        <div className="preset-grid">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} className={`preset-btn ${activePreset === key ? 'active' : ''}`}
              onClick={() => applyPreset(key)}>
              <strong>{preset.label}</strong>
              <span className="desc">{preset.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* PARAMETERS */}
      <section className="section">
        <div className="collapsible-header" onClick={() => setShowParams(!showParams)}>
          <span className={`arrow ${showParams ? 'open' : ''}`}>▶</span>
          <h2 style={{ border: 'none', margin: 0, padding: 0 }}>Paramètres</h2>
        </div>
        {showParams && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
              <div className="mode-toggle">
                <button className={`mode-toggle-btn${!expertMode ? ' active' : ''}`} onClick={() => setExpertMode(false)}>Mode simple</button>
                <button className={`mode-toggle-btn${expertMode ? ' active' : ''}`} onClick={() => setExpertMode(true)}>Mode expert (Tier B)</button>
              </div>
            </div>
            <div className="controls-row">

              {/* ===== TIER A — visible by default ===== */}

              <CollapsibleSection title="Macroéconomie" level="critical" defaultOpen={true}>
                <EnhancedSlider id="pi" label="Inflation π" value={p.pi} onChange={v => setParam('pi', v)}
                  min={0.005} max={0.05} step={0.001} unit="" decimals={3} tip={TIPS.pi}
                  defaultValue={DEFAULT_CONFIG.pi} />
                <EnhancedSlider id="w_r" label="Croissance salariale réelle w_r" value={p.w_r} onChange={v => setParam('w_r', v)}
                  min={-0.005} max={0.015} step={0.001} unit="" decimals={3} tip={TIPS.w_r}
                  defaultValue={DEFAULT_CONFIG.w_r} />
                <EnhancedSlider id="r_d_base" label="Taux OAT r_d_base" value={p.r_d_base} onChange={v => setParam('r_d_base', v)}
                  min={0.02} max={0.06} step={0.0025} unit="" decimals={4} tip={TIPS.r_d_base}
                  defaultValue={DEFAULT_CONFIG.r_d_base} />
                <EnhancedSlider id="extraSpread" label="Spread additionnel" value={p.extraSpread} onChange={v => setParam('extraSpread', v)}
                  min={0} max={0.02} step={0.001} unit="" decimals={3} tip={TIPS.extraSpread}
                  defaultValue={DEFAULT_CONFIG.extraSpread} />
              </CollapsibleSection>

              <CollapsibleSection title="Rendements" level="critical" defaultOpen={true}>
                <EnhancedSlider id="r_f_portfolio" label="Rendement fonds legacy r_f_portfolio" value={p.r_f_portfolio}
                  onChange={v => setParam('r_f_portfolio', v)} min={0.02} max={0.06} step={0.0025} unit="" decimals={4} tip={TIPS.r_f_portfolio}
                  defaultValue={DEFAULT_CONFIG.r_f_portfolio} warningBelow={0.025} dangerBelow={0.02} />
                <EnhancedSlider id="r_c" label="Rendement capitalisation r_c" value={p.r_c}
                  onChange={v => setParam('r_c', v)} min={0.01} max={0.07} step={0.005} unit="" decimals={3} tip={TIPS.r_c}
                  defaultValue={DEFAULT_CONFIG.r_c} warningBelow={0.025} dangerBelow={0.015} />
              </CollapsibleSection>

              <CollapsibleSection title="Démographie & travail" level="critical" defaultOpen={true}>
                <div className="toggle-row" title={TIPS.demoProfile}>
                  <label style={{ minWidth: 120 }}>Scénario démographique</label>
                  <select value={p.demoProfile} onChange={e => setParam('demoProfile', e.target.value)}>
                    <option value="cor_central">COR central</option>
                    <option value="realistic">Réaliste</option>
                    <option value="reformed">Réformé</option>
                  </select>
                </div>
                <EnhancedSlider id="employmentRateTarget" label="Cible taux d'emploi" value={p.employmentRateTarget}
                  onChange={v => setParam('employmentRateTarget', v)} min={0.55} max={0.85} step={0.005} unit="" decimals={3} tip={TIPS.employmentRateTarget}
                  defaultValue={DEFAULT_CONFIG.employmentRateTarget} />
                <EnhancedSlider id="employmentTransitionYears" label="Durée transition emploi" value={p.employmentTransitionYears}
                  onChange={v => setParam('employmentTransitionYears', v)} min={3} max={25} step={1} unit="ans" decimals={0} tip={TIPS.employmentTransitionYears}
                  defaultValue={DEFAULT_CONFIG.employmentTransitionYears} />
                <EnhancedSlider id="constructionMultiplier" label="Multiplicateur construction" value={p.constructionMultiplier}
                  onChange={v => setParam('constructionMultiplier', v)} min={0.5} max={2.0} step={0.05} unit="" decimals={2} tip={TIPS.constructionMultiplier}
                  defaultValue={DEFAULT_CONFIG.constructionMultiplier} />
              </CollapsibleSection>

              <CollapsibleSection title="Âge de retraite (NEW v1.0)" level="critical" defaultOpen={true}>
                <EnhancedSlider id="retirementAgeBase" label="Âge de retraite (base)" value={p.retirementAgeBase}
                  onChange={v => setParam('retirementAgeBase', v)} min={60} max={70} step={0.5} unit="ans" decimals={1} tip={TIPS.retirementAgeBase}
                  defaultValue={DEFAULT_CONFIG.retirementAgeBase} />
                <div className="toggle-row" title={TIPS.retirementAgeMode}>
                  <label style={{ minWidth: 120 }}>Mode</label>
                  <label><input type="radio" name="retirementAgeMode"
                    checked={p.retirementAgeMode === 'fixed'}
                    onChange={() => setParam('retirementAgeMode', 'fixed')} /> fixe</label>
                  <label style={{ marginLeft: 12 }}><input type="radio" name="retirementAgeMode"
                    checked={p.retirementAgeMode === 'indexed'}
                    onChange={() => setParam('retirementAgeMode', 'indexed')} /> indexé sur LE65</label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Capitalisation" level="critical" defaultOpen={true}>
                <Toggle label="Activer capitalisation" checked={p.enableCapi}
                  onChange={v => setParam('enableCapi', v)} tip={TIPS.enableCapi} />
                <CutoffSelector
                  label="Âge limite capi (en 2027)"
                  value={p.cutoffAge}
                  onChange={v => setParam('cutoffAge', v)}
                  options={[
                    { value: null, label: 'Aucun' },
                    { value: 60, label: '60 ans' },
                    { value: 55, label: '55 ans' },
                    { value: 50, label: '50 ans' },
                    { value: 45, label: '45 ans' },
                    { value: 40, label: '40 ans' },
                    { value: 35, label: '35 ans' },
                  ]}
                  tip={TIPS.cutoffAge}
                />
              </CollapsibleSection>

              <CollapsibleSection title="HLM" level="critical" defaultOpen={true}>
                <EnhancedSlider id="rho" label="Taux liquidation ρ" value={p.rho}
                  onChange={v => setParam('rho', v)} min={0} max={0.10} step={0.005} unit="" decimals={3} tip={TIPS.rho}
                  defaultValue={DEFAULT_CONFIG.rho} warningAbove={0.07} />
                <Toggle label="Décote volume HLM" checked={p.hlmDiscount}
                  onChange={v => setParam('hlmDiscount', v)} tip={TIPS.hlmDiscount} />
                <EnhancedSlider id="delta" label="Élasticité prix δ" value={p.delta}
                  onChange={v => setParam('delta', v)} min={0} max={0.5} step={0.025} unit="" decimals={3} tip={TIPS.delta}
                  defaultValue={DEFAULT_CONFIG.delta} />
                <EnhancedSlider id="T_hlm" label="Durée programme T_hlm" value={p.T_hlm}
                  onChange={v => setParam('T_hlm', v)} min={10} max={30} step={1} unit="ans" decimals={0}
                  defaultValue={DEFAULT_CONFIG.T_hlm} />
              </CollapsibleSection>

              <CollapsibleSection title="Équinoxe" level="critical" defaultOpen={true}>
                <Toggle label="Activer Équinoxe" checked={p.useEquinoxe}
                  onChange={v => setParam('useEquinoxe', v)} tip={TIPS.useEquinoxe} />
                {p.useEquinoxe && (
                  <div className="toggle-row" title={TIPS.equinoxePhasing}>
                    <label style={{ minWidth: 120 }}>Phasage</label>
                    <select value={p.equinoxePhasing} onChange={e => setParam('equinoxePhasing', e.target.value)}>
                      <option value="immediate">Immédiat</option>
                      <option value="phased-5y">Phasé 5 ans</option>
                      <option value="phased-10y">Phasé 10 ans</option>
                      <option value="partial-50">Partiel 50%</option>
                      <option value="partial-75">Partiel 75%</option>
                    </select>
                  </div>
                )}
              </CollapsibleSection>

              {/* ===== TIER B — expert menu ===== */}

              {expertMode && (
                <CollapsibleSection title="Tier B — Cascade v2.0 (mode équilibré, PR #18)" level="advanced">
                  <div className="toggle-row">
                    <label style={{ minWidth: 140 }}>Mode cascade</label>
                    <select value={p.cashFlowMode}
                      onChange={e => setParam('cashFlowMode', e.target.value)}>
                      <option value="balanced">balanced (PR #18 — défaut)</option>
                      <option value="overlapping">overlapping (PR #17 — historique)</option>
                      <option value="legacy">legacy (v1.3 — historique)</option>
                    </select>
                  </div>
                  <div className="input-help">
                    <strong>balanced</strong> : K préservé, dette repayée uniquement par surplus
                    plafonné, capi jamais ne subventionne PAYG. <strong>overlapping</strong> : ancien
                    cascade PR #17. <strong>legacy</strong> : waterfall v1.3.
                  </div>

                  <EnhancedSlider id="annuityFloorRate" label="Plancher rente capi (annuityFloorRate)"
                    value={p.annuityFloorRate}
                    onChange={v => setParam('annuityFloorRate', v)}
                    min={0.005} max={0.030} step={0.001} unit="" decimals={3}
                    defaultValue={DEFAULT_CONFIG.annuityFloorRate} />
                  <EnhancedSlider id="debtSweepShare" label="Part rendement réel pour dette (debtSweepShare)"
                    value={p.debtSweepShare}
                    onChange={v => setParam('debtSweepShare', v)}
                    min={0} max={1} step={0.05} unit="" decimals={2}
                    defaultValue={DEFAULT_CONFIG.debtSweepShare} />
                  <EnhancedSlider id="debtSweepKCap" label="Plafond sweep / K_t (debtSweepKCap)"
                    value={p.debtSweepKCap}
                    onChange={v => setParam('debtSweepKCap', v)}
                    min={0} max={0.05} step={0.0025} unit="" decimals={4}
                    defaultValue={DEFAULT_CONFIG.debtSweepKCap} />
                  <EnhancedSlider id="debtSweepGdpCap" label="Plafond sweep / PIB (debtSweepGdpCap)"
                    value={p.debtSweepGdpCap}
                    onChange={v => setParam('debtSweepGdpCap', v)}
                    min={0} max={0.05} step={0.0025} unit="" decimals={4}
                    defaultValue={DEFAULT_CONFIG.debtSweepGdpCap} />
                  <EnhancedSlider id="capiBonusShare" label="Part surplus → bonus capi (capiBonusShare)"
                    value={p.capiBonusShare}
                    onChange={v => setParam('capiBonusShare', v)}
                    min={0} max={1} step={0.05} unit="" decimals={2}
                    defaultValue={DEFAULT_CONFIG.capiBonusShare} />
                  <EnhancedSlider id="KFloorBuffer" label="Coussin de solvabilité K (KFloorBuffer)"
                    value={p.KFloorBuffer}
                    onChange={v => setParam('KFloorBuffer', v)}
                    min={1.0} max={2.0} step={0.05} unit="x" decimals={2}
                    defaultValue={DEFAULT_CONFIG.KFloorBuffer} />

                  <EnhancedSlider id="r_f_annuity" label="Taux couverture rente r_f_annuity"
                    value={p.r_f_annuity}
                    onChange={v => setParam('r_f_annuity', v)} min={0.005} max={0.030} step={0.001} unit="" decimals={3} tip={TIPS.r_f_annuity}
                    defaultValue={DEFAULT_CONFIG.r_f_annuity} />
                  <div className="input-help">
                    annuityRate_t (≈ 5,6 % avec r_f_annuity = 1,5 %) sert de référence
                    actuarielle pour la réserve de solvabilité K_floor et la rente
                    individuelle «&nbsp;Et pour vous&nbsp;?».
                  </div>
                </CollapsibleSection>
              )}

              {expertMode && (
                <CollapsibleSection title="Tier B — Prime de risque endogène" level="advanced">
                  <EnhancedSlider id="rpThreshold1" label="Seuil 1 (% PIB)" value={p.rpThreshold1}
                    onChange={v => setParam('rpThreshold1', v)} min={100} max={250} step={10} unit="%" decimals={0}
                    defaultValue={DEFAULT_CONFIG.rpThreshold1} />
                  <EnhancedSlider id="rpSlope1" label="Pente 1 (bps/pp)" value={p.rpSlope1 * 10000}
                    onChange={v => setParam('rpSlope1', v / 10000)} min={0} max={10} step={0.5} unit="bps" decimals={1}
                    defaultValue={DEFAULT_CONFIG.rpSlope1 * 10000} />
                  <EnhancedSlider id="rpThreshold2" label="Seuil 2 (% PIB)" value={p.rpThreshold2}
                    onChange={v => setParam('rpThreshold2', v)} min={150} max={350} step={10} unit="%" decimals={0}
                    defaultValue={DEFAULT_CONFIG.rpThreshold2} />
                  <EnhancedSlider id="rpSlope2" label="Pente 2 (bps/pp)" value={p.rpSlope2 * 10000}
                    onChange={v => setParam('rpSlope2', v / 10000)} min={1} max={15} step={0.5} unit="bps" decimals={1}
                    defaultValue={DEFAULT_CONFIG.rpSlope2 * 10000} />
                  <EnhancedSlider id="rpThreshold3" label="Seuil 3 (% PIB)" value={p.rpThreshold3}
                    onChange={v => setParam('rpThreshold3', v)} min={200} max={500} step={10} unit="%" decimals={0}
                    defaultValue={DEFAULT_CONFIG.rpThreshold3} />
                  <EnhancedSlider id="rpSlope3" label="Pente 3 (bps/pp)" value={p.rpSlope3 * 10000}
                    onChange={v => setParam('rpSlope3', v / 10000)} min={5} max={30} step={1} unit="bps" decimals={0}
                    defaultValue={DEFAULT_CONFIG.rpSlope3 * 10000} />
                  <EnhancedSlider id="r_d_cap" label="Plafond r_d" value={p.r_d_cap}
                    onChange={v => setParam('r_d_cap', v)} min={0.10} max={0.30} step={0.01} unit="" decimals={2}
                    defaultValue={DEFAULT_CONFIG.r_d_cap} />
                </CollapsibleSection>
              )}

              {expertMode && (
                <CollapsibleSection title="Tier B — Pénalité GE & bornes retraite" level="advanced">
                  <EnhancedSlider id="geKneeRatio" label="Capi/PIB knee" value={p.geKneeRatio}
                    onChange={v => setParam('geKneeRatio', v)} min={0.5} max={4.0} step={0.1} unit="x" decimals={2}
                    defaultValue={DEFAULT_CONFIG.geKneeRatio} />
                  <EnhancedSlider id="geFloorRatio" label="Capi/PIB floor" value={p.geFloorRatio}
                    onChange={v => setParam('geFloorRatio', v)} min={2.0} max={8.0} step={0.1} unit="x" decimals={2}
                    defaultValue={DEFAULT_CONFIG.geFloorRatio} />
                  <EnhancedSlider id="retirementAgeFloor" label="Plancher âge retraite" value={p.retirementAgeFloor}
                    onChange={v => setParam('retirementAgeFloor', v)} min={55} max={65} step={0.5} unit="ans" decimals={1}
                    defaultValue={DEFAULT_CONFIG.retirementAgeFloor} />
                  <EnhancedSlider id="retirementAgeCeil" label="Plafond âge retraite" value={p.retirementAgeCeil}
                    onChange={v => setParam('retirementAgeCeil', v)} min={65} max={75} step={0.5} unit="ans" decimals={1}
                    defaultValue={DEFAULT_CONFIG.retirementAgeCeil} />
                </CollapsibleSection>
              )}

              {expertMode && (
                <CollapsibleSection title="Tier B — Cotisations & calibration" level="advanced">
                  <EnhancedSlider id="tau_s" label="Taux salarié τ_s" value={p.tau_s}
                    onChange={v => setParam('tau_s', v)} min={0.05} max={0.20} step={0.005} unit="" decimals={3}
                    defaultValue={DEFAULT_CONFIG.tau_s} />
                  <EnhancedSlider id="tau_e" label="Taux employeur τ_e" value={p.tau_e}
                    onChange={v => setParam('tau_e', v)} min={0.05} max={0.25} step={0.005} unit="" decimals={3}
                    defaultValue={DEFAULT_CONFIG.tau_e} />
                  <div className="toggle-row" title="Bases de calibration — modifiables pour scénarios « si Y0 = 2030 »">
                    <label style={{ minWidth: 120 }}>existingDebt (Md€)</label>
                    <input type="number" value={p.existingDebt} step={50}
                      onChange={e => setParam('existingDebt', parseFloat(e.target.value))} />
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>baseGDP (Md€)</label>
                    <input type="number" value={p.baseGDP} step={50}
                      onChange={e => setParam('baseGDP', parseFloat(e.target.value))} />
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>R0 (M)</label>
                    <input type="number" value={p.R0} step={0.5}
                      onChange={e => setParam('R0', parseFloat(e.target.value))} />
                  </div>
                  <div className="input-help">
                    Périmètre <strong>droits directs</strong> uniquement (DREES).
                    Ne pas remplacer par 19&nbsp;M (tous retraités) : cela créerait
                    un mismatch de périmètre avec les déciles. Voir spec §10.14.
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>W0 (Md€)</label>
                    <input type="number" value={p.W0} step={20}
                      onChange={e => setParam('W0', parseFloat(e.target.value))} />
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>E0 (Md€)</label>
                    <input type="number" value={p.E0} step={5}
                      onChange={e => setParam('E0', parseFloat(e.target.value))} />
                  </div>
                  <div className="input-help">
                    Périmètre <strong>tous retraités</strong> (y compris pensions
                    de réversion). Asymétrie volontaire avec R₀ : la mise à
                    l'échelle des dépenses absorbe les ~11&nbsp;% de réversion via
                    <code> legacyRetirees(t)</code>. Voir spec §10.14.
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>F0 (Md€)</label>
                    <input type="number" value={p.F0} step={10}
                      onChange={e => setParam('F0', parseFloat(e.target.value))} />
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>S0_irDeduction</label>
                    <input type="number" value={p.S0_irDeduction} step={1}
                      onChange={e => setParam('S0_irDeduction', parseFloat(e.target.value))} />
                  </div>
                  <div className="toggle-row">
                    <label style={{ minWidth: 120 }}>S0_csg</label>
                    <input type="number" value={p.S0_csg} step={1}
                      onChange={e => setParam('S0_csg', parseFloat(e.target.value))} />
                  </div>
                </CollapsibleSection>
              )}


              {expertMode && (
                <CollapsibleSection title="Tier B — Baisse des charges patronales (v1.3)" level="advanced">
                  <div className="input-help" style={{ color: 'var(--color-warning, #b45309)', marginBottom: 8 }}>
                    ⚠️ Paramètre v1.3 expérimental. Plage viable&nbsp;: Δτ_e ≤&nbsp;0,5&nbsp;% (step) avec
                    τ_K ≈&nbsp;2,5&nbsp;%. Tout incrément annuel (PA&nbsp;&gt;&nbsp;0) est catastrophique.
                    Allègement initial ≈&nbsp;7&nbsp;Md€/an&nbsp;; éventuel ≈&nbsp;630&nbsp;Md€/an (t=69).
                  </div>
                  <EnhancedSlider id="deltaTauxPatronal" label="Baisse cot. patronale Δτ_e" value={p.deltaTauxPatronal}
                    onChange={v => setParam('deltaTauxPatronal', v)} min={0} max={0.05} step={0.005} unit="" decimals={3} tip={TIPS.deltaTauxPatronal}
                    defaultValue={DEFAULT_CONFIG.deltaTauxPatronal} />
                  <EnhancedSlider id="deltaTauxPatronalPA" label="Incrément annuel Δτ_e/an" value={p.deltaTauxPatronalPA ?? 0}
                    onChange={v => setParam('deltaTauxPatronalPA', v)} min={0} max={0.01} step={0.001} unit="" decimals={3}
                    defaultValue={0} />
                </CollapsibleSection>
              )}

            </div>
          </>
        )}
      </section>

      {/* KPIs — collapsible: charts are the primary visual; KPIs are
          quantitative deep-dive for power users. */}
      <section className="section">
        <CollapsibleSection title="Indicateurs clés" level="normal" defaultOpen={false}>
        <div className="kpi-grid">
          <div className="kpi-card">
            <h3>Dette pic</h3>
            <div className={`kpi-value ${kpis.peakDebt > 5500 ? 'kpi-bad' : kpis.peakDebt > 4000 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtMd(kpis.peakDebt)} €</div>
            <div className="kpi-sub">Année {kpis.peakDebtYear}</div>
          </div>
          <div className="kpi-card">
            <h3>Année sans dette</h3>
            <div className={`kpi-value ${!kpis.debtFreeYear ? 'kpi-bad' : kpis.debtFreeYear > 2090 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtYear(kpis.debtFreeYear)}</div>
          </div>
          <div className="kpi-card">
            <h3>Intérêts cumulés</h3>
            <div className="kpi-value">{fmtMd(kpis.totalInterest)} €</div>
          </div>
          <div className="kpi-card">
            <h3>Pot capi (nominal)</h3>
            <div className="kpi-value">{fmtMd(kpis.finalCapi)} €</div>
          </div>
          <div className="kpi-card">
            <h3>Pot capi (réel 2027€)</h3>
            <div className="kpi-value">{fmtMd(kpis.finalCapiReal)} €</div>
          </div>
          <div className="kpi-card">
            <h3>Spread σ min</h3>
            <div className={`kpi-value ${kpis.minSpread <= 0 ? 'kpi-bad' : kpis.minSpread < 0.01 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtPct(kpis.minSpread)}</div>
            <div className="kpi-sub">r_f_portfolio − (r_d − π)</div>
          </div>
          <div className="kpi-card">
            <h3>Économies pension S₀</h3>
            <div className="kpi-value">{kpis.S0.toFixed(1)} Md€/an</div>
            <div className="kpi-sub">Équinoxe (brackets + IR + CSG, t=0)</div>
          </div>
          <div className="kpi-card">
            <h3>Position nette</h3>
            <div className={`kpi-value ${kpis.netPosition > 0 ? 'kpi-ok' : 'kpi-bad'}`}>
              {fmtMd(kpis.netPosition)} €</div>
          </div>
          <div className="kpi-card">
            <h3>Insuffisance capi cumulée</h3>
            <div className={`kpi-value ${kpis.totalCapiShortfall < 1 ? 'kpi-ok' : kpis.totalCapiShortfall < 100 ? 'kpi-warn' : 'kpi-bad'}`}>
              {fmtMd(kpis.totalCapiShortfall)} €</div>
            <div className="kpi-sub">
              {kpis.firstShortfallYear ? `Dès ${kpis.firstShortfallYear}` : 'Pot suffisant sur tout l\'horizon'}
            </div>
          </div>
        </div>
        </CollapsibleSection>
      </section>

      {/* DATA TABLE */}
      <section className="section">
        <div className="collapsible-header" onClick={() => setShowTable(!showTable)}>
          <span className={`arrow ${showTable ? 'open' : ''}`}>▶</span>
          <h2 style={{ border: 'none', margin: 0, padding: 0 }}>Tableau de données</h2>
        </div>
        {showTable && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.75rem 0 0.4rem' }}>
              <button className="mc-btn" onClick={() => setShowAllColumns(!showAllColumns)}>
                {showAllColumns ? 'Colonnes essentielles' : 'Toutes les colonnes'}
              </button>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.filter(c => c.always || showAllColumns).map(c => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllRows ? results : results.slice(0, 15)).map(r => (
                    <tr key={r.year}>
                      {TABLE_COLUMNS.filter(c => c.always || showAllColumns).map(c => (
                        <td key={c.key}>{c.render(r)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAllRows && results.length > 15 && (
              <button className="mc-btn" style={{ marginTop: '0.5rem', marginRight: '0.5rem' }} onClick={() => setShowAllRows(true)}>
                Afficher les {results.length} années
              </button>
            )}
            <button className="export-btn" onClick={exportCSV}>Exporter CSV</button>
          </>
        )}
      </section>

      {/* CHARTS */}
      <section className="section">
        <h2>Graphiques</h2>

        <div className="chart-tabs">
          {CHART_TABS.map(tab => (
            <button key={tab.id}
              className={`chart-tab${activeChartTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveChartTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Dépenses */}
        <div style={{ visibility: activeChartTab === 'depenses' ? 'visible' : 'hidden', height: activeChartTab === 'depenses' ? 'auto' : 0, overflow: 'hidden' }}>
          <div className="chart-container">
            <h3>Bilan du fonds legacy — Dépenses vs. Revenus (Md€)</h3>
            <p className="chart-note">
              Aire empilée = revenus du fonds. La nouvelle aire violet pâle « Recette Équinoxe CSG/CRDS »
              (v1.0a, eq 22) est la composante tax-side restaurée sur tous les retraités.
              Au-dessus de la ligne rouge = excédent (remboursement dette).
            </p>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                <Area type="monotone" dataKey="fundReturn" stackId="income" fill="#60a5fa" stroke="#3b82f6" name="Rendement fonds" />
                <Area type="monotone" dataKey="hlmProceeds" stackId="income" fill="#34d399" stroke="#10b981" name="HLM" />
                <Area type="monotone" dataKey="abatement" stackId="income" fill="#fbbf24" stroke="#f59e0b" name="Abattement fiscal" />
                {/* v1.0a NEW chart row — colour chosen from Équinoxe family (cool violet)
                    distinguishable from emplrToLeg's saturated #8b5cf6. */}
                <Area type="monotone" dataKey="csgRevenue" stackId="income" fill="#c4b5fd" stroke="#7c3aed" name="Recette Équinoxe CSG/CRDS" />
                <Area type="monotone" dataKey="emplrToLeg" stackId="income" fill="#a78bfa" stroke="#8b5cf6" name="Cotis. employeur → legacy" />
                <Line type="monotone" dataKey="legacyExp" stroke="#ef4444" strokeWidth={3} name="Dépenses legacy" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-container">
            <h3>Dépenses retraites — Legacy (PAYG) vs. Capitalisation (Md€)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                <Area type="monotone" dataKey="legacyExp" stackId="pensions" fill="#fca5a5" stroke="#ef4444" name="Pensions legacy" />
                <Area type="monotone" dataKey="capiPayout" stackId="pensions" fill="#86efac" stroke="#059669" name="Pensions capi" />
                <Line type="monotone" dataKey="totalPensionExp" stroke="#1e293b" strokeWidth={2} strokeDasharray="5 5" name="Total pensions" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tab: Dette & Taux */}
        <div style={{ visibility: activeChartTab === 'dette' ? 'visible' : 'hidden', height: activeChartTab === 'dette' ? 'auto' : 0, overflow: 'hidden' }}>
          <div className="chart-container">
            <h3>Trajectoire dette + taux d'emprunt effectif</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis yAxisId="left" width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'r_d (%)', angle: 90, position: 'insideRight' }} tick={{ fontSize: 14 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                {kpis.peakDebtYear && <ReferenceLine yAxisId="left" x={kpis.peakDebtYear} stroke="var(--color-danger)" strokeDasharray="4 4" />}
                {kpis.debtFreeYear && <ReferenceLine yAxisId="left" x={kpis.debtFreeYear} stroke="var(--color-success)" strokeDasharray="4 4" />}
                <Line yAxisId="left" type="monotone" dataKey="debt" stroke="#dc2626" strokeWidth={3} name="Dette (Md€)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="r_d" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" name="r_d effectif (%)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tab: Capitalisation */}
        <div style={{ visibility: activeChartTab === 'capitalisation' ? 'visible' : 'hidden', height: activeChartTab === 'capitalisation' ? 'auto' : 0, overflow: 'hidden' }}>
          <div className="chart-container">
            <h3>Pot de capitalisation (Md€)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${typeof v === 'number' ? fmtN(v) : v} Md€`} />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                <Line type="monotone" dataKey="capi" stroke="#059669" strokeWidth={3} name="Nominal" dot={false} />
                <Line type="monotone" dataKey="capiReal" stroke="#2563eb" strokeWidth={3} name="Réel (€ 2027)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-container">
            <h3>Spread σ = r_f_portfolio − (r_d − π) en points de %</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={50} label={{ value: '%', angle: -90, position: 'insideLeft', dx: -4 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                <ReferenceLine y={0} stroke="#dc2626" strokeWidth={2} strokeDasharray="8 4" />
                <Line type="monotone" dataKey="spread" stroke="#7c3aed" strokeWidth={2} name="Spread σ (%)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tab: Flux & VAN */}
        <div style={{ visibility: activeChartTab === 'flux' ? 'visible' : 'hidden', height: activeChartTab === 'flux' ? 'auto' : 0, overflow: 'hidden' }}>
          <div className="chart-container">
            <h3>Flux de cotisations (Md€/an)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData.filter((_, i) => i % 2 === 0)} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${v.toFixed(1)} Md€`} />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                <Bar dataKey="emplC_s_toCapi" stackId="a" fill="#3b82f6" name="Salarié → capi" />
                <Bar dataKey="emplC_s_toPayg" stackId="a" fill="#fb923c" name="Salarié → legacy" />
                <Bar dataKey="emplrToCap_bar" stackId="a" fill="#8b5cf6" name="Employeur → capi" />
                <Bar dataKey="emplrToLeg_bar" stackId="a" fill="#f97316" name="Employeur → legacy" />
                <Bar dataKey="levy" stackId="b" fill="#ef4444" name="Prélèvement transition" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-container">
            <h3>VAN cumulée — Engagements legacy vs. paiements capi (Md€)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 14 }} label={{ value: 'Année', position: 'insideBottom', offset: -8 }} />
                <YAxis width={55} label={{ value: 'Md€', angle: -90, position: 'insideLeft', dx: -8 }} tick={{ fontSize: 14 }} />
                <Tooltip formatter={(v) => `${typeof v === 'number' ? fmtN(v) : v} Md€`} />
                <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
                <Line type="monotone" dataKey="pvLegacyCum" stroke="#ef4444" strokeWidth={3} name="VAN engagements legacy" dot={false} />
                <Line type="monotone" dataKey="pvCapiPayoutCum" stroke="#059669" strokeWidth={3} name="VAN pensions capi" dot={false} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* κ–φ Pareto frontier: peak debt vs capi payout ratio */}
        <div className="chart-container" style={{ marginTop: '1.5rem' }}>
          <h3>Frontière Pareto κ–φ : dette de transition vs couverture actuarielle</h3>
          <p className="chart-note">
            κ = K-cap de balayage (debtSweepKCap, couleur) · φ = taux plancher annuité (annuityFloorRate, position X croissante).
            Axe X : dette maximale (k Md€) · Axe Y : paiement capi / rente actuarielle (%).
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 48, left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number" dataKey="peakDebt" name="Dette max"
                label={{ value: 'Dette de transition max (k Md€)', position: 'insideBottom', offset: -28, fontSize: 12 }}
                tick={{ fontSize: 12 }} tickFormatter={v => fmtN(v)}
              />
              <YAxis
                type="number" dataKey="avgRatio" name="Ratio actuariel"
                label={{ value: 'Paiement / rente actuarielle (%)', angle: -90, position: 'insideLeft', dx: -8, fontSize: 12 }}
                tick={{ fontSize: 12 }} tickFormatter={v => `${v.toFixed(0)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#f1f5f9' }}>
                      <div><b>κ (K-cap balayage)</b> = {d.kappa}</div>
                      <div><b>φ (plancher annuité)</b> = {d.phi}</div>
                      <div><b>Dette max</b> = {fmtN(d.peakDebt)} k Md€</div>
                      <div><b>Ratio actuariel</b> = {d.avgRatio.toFixed(1)}%</div>
                    </div>
                  );
                }}
              />
              <Legend
                payload={KAPPA_VALUES.map((k, i) => ({ value: `κ = ${k}`, type: 'circle', color: KAPPA_COLORS[i] }))}
                wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                verticalAlign="top"
              />
              {KAPPA_VALUES.map((kappa, ki) => (
                <Scatter
                  key={kappa}
                  name={`κ=${kappa}`}
                  data={sweepData.filter(d => d.kappa === kappa)}
                  fill={KAPPA_COLORS[ki]}
                >
                  {sweepData.filter(d => d.kappa === kappa).map((entry, idx) => (
                    <Cell key={idx} fill={KAPPA_COLORS[ki]} r={7} />
                  ))}
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      </>}

      <footer className="footer">
        CapiModel v1.0a · Spec @c466e6b ·
        <a href="https://github.com/alles-delenda-est/CapiModel" style={{ color: 'var(--color-primary-light)', marginLeft: 4 }}>Source</a>
      </footer>
    </div>
  )
}
