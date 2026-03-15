import { useState, useMemo, useCallback, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart,
} from 'recharts'
import { runSimulation, extractKPIs, PRESETS } from './simulation-engine.js'
import useHashNavigation from './hooks/useHashNavigation.js'
import Navigation from './components/Navigation.jsx'
import IntroPage from './pages/IntroPage.jsx'
import HypothesesPage from './pages/HypothesesPage.jsx'

// --- Tooltip descriptions for each parameter (layman-friendly) ---
const TIPS = {
  pi: "Le taux d'inflation annuel. Mesure la hausse générale des prix. La BCE vise 2% par an.",
  w_r: "La croissance annuelle des salaires au-delà de l'inflation. En France, historiquement ~0.5-0.7% ces dernières années.",
  N: "Le nombre d'années simulées à partir de 2026.",
  E0: "Le montant total des pensions versées aujourd'hui, toutes caisses confondues (base, complémentaire, réversion). Source : DREES.",
  r_c: "Le rendement réel (après inflation) des comptes de capitalisation individuels. Un portefeuille diversifié 60/40 rapporte historiquement ~3-3.5% réel.",
  r_f: "Le rendement réel des actifs du fonds legacy (CDC). Similaire à un portefeuille institutionnel diversifié.",
  r_d_base: "Le taux nominal auquel l'État emprunte (OAT 10 ans). La France emprunte actuellement à ~3-3.5%.",
  endogenousRd: "Si activé, le taux d'emprunt augmente automatiquement quand la dette/PIB dépasse certains seuils, reflétant la prime de risque exigée par les marchés.",
  extraSpread: "Un surcoût additionnel sur le taux d'emprunt, pour tester des scénarios de stress financier.",
  rpThreshold1: "Ratio dette/PIB en dessous duquel les marchés n'exigent aucune prime de risque. Les États-Unis et l'Italie empruntent sans crise à >100%.",
  rpSlope1: "Combien le taux d'emprunt augmente pour chaque point de % de dette/PIB au-dessus du seuil 1. En points de base (1 bp = 0.01%).",
  rpThreshold3: "Ratio dette/PIB au-delà duquel les marchés commencent à paniquer. Zone de crise souveraine.",
  rpSlope3: "Vitesse d'augmentation du taux en zone de crise. Beaucoup plus agressive qu'en zone normale.",
  rho: "La fraction du parc HLM vendue chaque année. 5% = ~265 000 logements/an sur 5.3 millions.",
  hlmDiscount: "Applique une décote aux prix HLM pour refléter l'impact sur le marché immobilier d'un volume de ventes important.",
  delta: "Sensibilité du prix HLM au volume vendu. Plus c'est élevé, plus les prix baissent quand on vend beaucoup.",
  P0: "Prix moyen de marché d'un logement social. Varie fortement entre l'Île-de-France (~250k€) et la province (~120k€).",
  g_h: "La hausse annuelle des prix immobiliers au-delà de l'inflation.",
  tauS: "Le taux de cotisation retraite prélevé sur le salaire brut des employés. Dans cette réforme, 100% va à la capitalisation.",
  tauE: "Le taux de cotisation retraite payé par l'employeur. Sert d'abord à couvrir les pensions legacy, le surplus va à la capitalisation.",
  phiF: "Part minimum des cotisations employeur réservée à la capitalisation, même pendant la phase de déficit legacy.",
  lambda: "Fraction des flux de capitalisation prélevée pour accélérer le remboursement de la dette de transition.",
  Tlambda: "Année (après la réforme) à partir de laquelle le prélèvement sur la capitalisation s'active.",
  useEquinoxe: "Courbe progressive de réduction des pensions élevées (Equinoxe) vs. réduction fixe au-dessus d'un seuil.",
  kappa: "Taux de réduction appliqué aux pensions au-dessus du seuil (mode step function uniquement).",
  threshold: "Seuil mensuel de pension brute au-dessus duquel la réduction s'applique (mode step function).",
  F0: "Valeur des actifs CDC (hors Livret A) transférés au fonds legacy le jour de la réforme.",
  Tpk: "Nombre d'années avant que les dépenses legacy atteignent leur pic. Reflète l'arrivée à la retraite de travailleurs ayant des droits PAYG partiels.",
  Thl: "Vitesse à laquelle les dépenses legacy déclinent après le pic. Plus court = transition plus rapide.",
}

// --- Slider with tooltip ---
function Slider({ label, value, onChange, min, max, step, unit, decimals = 1, tip }) {
  return (
    <div className="control" title={tip}>
      <div className="control-header">
        <label>{label} {tip && <span className="tip-icon">?</span>}</label>
        <span className="control-value">{value.toFixed(decimals)} {unit}</span>
      </div>
      <input type="range" className="slider" min={min} max={max} step={step}
        value={value} onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  )
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
const fmtTn = v => `${(v / 1000).toFixed(2)} Tn`
const fmtPct = v => `${(v * 100).toFixed(2)}%`
const fmtYear = v => v ? `${v}` : 'Jamais'

// --- URL parameter encoding/decoding ---
function paramsToURL(params) {
  const defs = PRESETS.default.params
  const diff = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== defs[k]) diff[k] = v
  }
  if (Object.keys(diff).length === 0) return ''
  return '?' + new URLSearchParams(diff).toString()
}

function paramsFromURL() {
  const sp = new URLSearchParams(window.location.search)
  if (sp.size === 0) return null
  const preset = sp.get('preset')
  if (preset && PRESETS[preset]) {
    const base = { ...PRESETS[preset].params }
    sp.delete('preset')
    for (const [k, v] of sp.entries()) {
      if (k in base) base[k] = v === 'true' ? true : v === 'false' ? false : parseFloat(v)
    }
    return base
  }
  const base = { ...PRESETS.default.params }
  for (const [k, v] of sp.entries()) {
    if (k in base) base[k] = v === 'true' ? true : v === 'false' ? false : parseFloat(v)
  }
  return base
}

// --- Main App ---
export default function App() {
  const { currentPage, navigateTo } = useHashNavigation('simulateur')
  const initialParams = paramsFromURL() || PRESETS.default.params
  const [params, setParams] = useState(initialParams)
  const [activePreset, setActivePreset] = useState(paramsFromURL() ? null : 'default')
  const [showParams, setShowParams] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [mcBands, setMcBands] = useState(null)
  const [mcRuns, setMcRuns] = useState(1000)
  const [mcRunning, setMcRunning] = useState(false)
  const [mcProgress, setMcProgress] = useState('')
  const workerRef = useRef(null)

  const setParam = useCallback((key, value) => {
    setParams(prev => ({ ...prev, [key]: value }))
    setActivePreset(null)
    setMcBands(null)
  }, [])

  const applyPreset = useCallback((key) => {
    setParams({ ...PRESETS[key].params })
    setActivePreset(key)
    setMcBands(null)
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  }, [])

  const { results, kpis } = useMemo(() => {
    const results = runSimulation(params)
    const kpis = extractKPIs(results)
    return { results, kpis }
  }, [params])

  useMemo(() => {
    const url = paramsToURL(params)
    const hash = window.location.hash
    window.history.replaceState(null, '', (url || window.location.pathname) + hash)
  }, [params])

  const runMC = useCallback(() => {
    setMcRunning(true)
    setMcProgress('Initialisation...')
    setMcBands(null)
    if (workerRef.current) workerRef.current.terminate()
    const worker = new Worker(new URL('./monte-carlo-worker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') setMcProgress(`${e.data.completed} / ${e.data.total}`)
      else if (e.data.type === 'result') {
        setMcBands(e.data.bands); setMcRunning(false); setMcProgress(''); worker.terminate()
      }
    }
    worker.postMessage({ params, runs: mcRuns })
  }, [params, mcRuns])

  const exportCSV = useCallback(() => {
    const headers = ['Année', 'Dép. legacy', 'Dép. capi', 'Total pens.', 'Rend. fonds', 'HLM',
      'Abatt.', 'Sal.→capi', 'Empl.→leg', 'Empl.→cap', 'Int. dette', 'Flux net',
      'Emprunt', 'Rembours.', 'Prélèv.', 'Dette', 'Capi nom.', 'Capi réel', 'r_d (%)', 'Spread (%)']
    const rows = results.map(r => [
      r.year, r.legacyExp.toFixed(1), r.capiPayout.toFixed(1), r.totalPensionExp.toFixed(1),
      r.fundReturn.toFixed(1), r.hlmProceeds.toFixed(1), r.abatement.toFixed(1),
      r.emplC_s.toFixed(1), r.emplrToLeg.toFixed(1), r.emplrToCap.toFixed(1),
      r.debtInterest.toFixed(1), r.netFlow.toFixed(1), r.borrowed.toFixed(1),
      r.repaid.toFixed(1), r.levy.toFixed(1), r.debt.toFixed(1),
      r.capi.toFixed(0), r.capiReal.toFixed(0), (r.r_d * 100).toFixed(2), (r.spread * 100).toFixed(2)
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'cdc_simulation.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [results])

  const chartData = useMemo(() => {
    return results.map((r, i) => {
      const mc = mcBands?.[i] || {}
      return {
        year: r.year,
        legacyExp: r.legacyExp, fundReturn: r.fundReturn, hlmProceeds: r.hlmProceeds,
        abatement: r.abatement, emplrToLeg: r.emplrToLeg,
        debt: r.debt, r_d: r.r_d * 100,
        capi: r.capi / 1000, capiReal: r.capiReal / 1000,
        spread: r.spread * 100,
        emplC_s: r.emplC_s, emplrToLeg_bar: r.emplrToLeg, emplrToCap_bar: r.emplrToCap, levy: r.levy,
        capi_p5_p95: mc.capi_p5 !== undefined ? [mc.capi_p5 / 1000, mc.capi_p95 / 1000] : undefined,
        capi_p25_p75: mc.capi_p25 !== undefined ? [mc.capi_p25 / 1000, mc.capi_p75 / 1000] : undefined,
        capi_p50: mc.capi_p50 !== undefined ? mc.capi_p50 / 1000 : undefined,
        capiReal_p5_p95: mc.capiReal_p5 !== undefined ? [mc.capiReal_p5 / 1000, mc.capiReal_p95 / 1000] : undefined,
        capiReal_p25_p75: mc.capiReal_p25 !== undefined ? [mc.capiReal_p25 / 1000, mc.capiReal_p75 / 1000] : undefined,
        debt_p5_p95: mc.debt_p5 !== undefined ? [mc.debt_p5, mc.debt_p95] : undefined,
        debt_p25_p75: mc.debt_p25 !== undefined ? [mc.debt_p25, mc.debt_p75] : undefined,
        debt_p50: mc.debt_p50,
        capiPayout: r.capiPayout, totalPensionExp: r.totalPensionExp,
        pvLegacyCum: r.pvLegacyCum / 1000, pvCapiPayoutCum: r.pvCapiPayoutCum / 1000,
      }
    })
  }, [results, mcBands])

  const p = params

  return (
    <div className="app">
      <header className="header">
        <h1>Simulateur CDC — Transition Retraites PAYG → Capitalisation</h1>
        <p className="subtitle">Proof of concept</p>
      </header>

      <Navigation currentPage={currentPage} navigateTo={navigateTo} />

      {currentPage === 'intro' && <IntroPage navigateTo={navigateTo} />}
      {currentPage === 'hypotheses' && <HypothesesPage />}
      {currentPage === 'simulateur' && <>

      {/* PRESETS */}
      <section className="section preset-section">
        <h2>Scénarios</h2>
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
          <div className="controls-row" style={{ marginTop: '0.75rem' }}>
            <div className="control-group">
              <h3>Macro</h3>
              <Slider label="Inflation π" value={p.pi} onChange={v => setParam('pi', v)}
                min={0} max={0.06} step={0.001} unit="" decimals={3} tip={TIPS.pi} />
              <Slider label="Croissance salariale réelle w_r" value={p.w_r}
                onChange={v => setParam('w_r', v)} min={0} max={0.03} step={0.001} unit="" decimals={3} tip={TIPS.w_r} />
              <Slider label="Horizon N" value={p.N} onChange={v => setParam('N', v)}
                min={20} max={80} step={1} unit="ans" decimals={0} tip={TIPS.N} />
              <Slider label="Dépenses initiales E₀" value={p.E0}
                onChange={v => setParam('E0', v)} min={280} max={400} step={5} unit="Md€" decimals={0} tip={TIPS.E0} />
            </div>

            <div className="control-group">
              <h3>Rendements</h3>
              <Slider label="Rendement capitalisation r_c" value={p.r_c}
                onChange={v => setParam('r_c', v)} min={0.01} max={0.07} step={0.005} unit="" decimals={3} tip={TIPS.r_c} />
              <Slider label="Rendement fonds legacy r_f" value={p.r_f}
                onChange={v => setParam('r_f', v)} min={0.01} max={0.06} step={0.005} unit="" decimals={3} tip={TIPS.r_f} />
            </div>

            <div className="control-group">
              <h3>Emprunt souverain</h3>
              <Slider label="Taux de base r_d" value={p.r_d_base}
                onChange={v => setParam('r_d_base', v)} min={0.01} max={0.07} step={0.001} unit="" decimals={3} tip={TIPS.r_d_base} />
              <Toggle label="Taux endogène (prime de risque)" checked={p.endogenousRd}
                onChange={v => setParam('endogenousRd', v)} tip={TIPS.endogenousRd} />
              <Slider label="Spread additionnel" value={p.extraSpread}
                onChange={v => setParam('extraSpread', v)} min={0} max={0.02} step={0.001} unit="" decimals={3} tip={TIPS.extraSpread} />
              <Slider label="Seuil 1 — pas de prime (% PIB)" value={p.rpThreshold1}
                onChange={v => setParam('rpThreshold1', v)} min={100} max={250} step={10} unit="%" decimals={0} tip={TIPS.rpThreshold1} />
              <Slider label="Pente 1 (bps/pp)" value={p.rpSlope1 * 10000}
                onChange={v => setParam('rpSlope1', v / 10000)} min={0} max={10} step={0.5} unit="bps" decimals={1} tip={TIPS.rpSlope1} />
              <Slider label="Seuil 3 — crise (% PIB)" value={p.rpThreshold3}
                onChange={v => setParam('rpThreshold3', v)} min={200} max={500} step={10} unit="%" decimals={0} tip={TIPS.rpThreshold3} />
              <Slider label="Pente 3 (bps/pp)" value={p.rpSlope3 * 10000}
                onChange={v => setParam('rpSlope3', v / 10000)} min={5} max={30} step={1} unit="bps" decimals={0} tip={TIPS.rpSlope3} />
            </div>

            <div className="control-group">
              <h3>HLM</h3>
              <Slider label="Taux de liquidation ρ" value={p.rho}
                onChange={v => setParam('rho', v)} min={0.01} max={0.15} step={0.01} unit="" decimals={2} tip={TIPS.rho} />
              <Toggle label="Décote volume HLM" checked={p.hlmDiscount}
                onChange={v => setParam('hlmDiscount', v)} tip={TIPS.hlmDiscount} />
              <Slider label="Élasticité prix δ" value={p.delta}
                onChange={v => setParam('delta', v)} min={0} max={0.5} step={0.05} unit="" decimals={2} tip={TIPS.delta} />
              <Slider label="Prix marché P₀" value={p.P0}
                onChange={v => setParam('P0', v)} min={100} max={250} step={5} unit="k€" decimals={0} tip={TIPS.P0} />
              <Slider label="Croissance prix g_h" value={p.g_h}
                onChange={v => setParam('g_h', v)} min={0} max={0.03} step={0.005} unit="" decimals={3} tip={TIPS.g_h} />
            </div>

            <div className="control-group">
              <h3>Cotisations</h3>
              <Slider label="Taux salarié τˢ" value={p.tauS}
                onChange={v => setParam('tauS', v)} min={0.05} max={0.20} step={0.005} unit="" decimals={3} tip={TIPS.tauS} />
              <Slider label="Taux employeur τᵉ" value={p.tauE}
                onChange={v => setParam('tauE', v)} min={0.05} max={0.25} step={0.005} unit="" decimals={3} tip={TIPS.tauE} />
              <Slider label="Floor employeur φ_f" value={p.phiF}
                onChange={v => setParam('phiF', v)} min={0} max={0.5} step={0.05} unit="" decimals={2} tip={TIPS.phiF} />
            </div>

            <div className="control-group">
              <h3>Prélèvement transition</h3>
              <Slider label="Taux prélèvement λ" value={p.lambda}
                onChange={v => setParam('lambda', v)} min={0} max={0.50} step={0.05} unit="" decimals={2} tip={TIPS.lambda} />
              <Slider label="Activation T_λ" value={p.Tlambda}
                onChange={v => setParam('Tlambda', v)} min={0} max={30} step={1} unit="ans" decimals={0} tip={TIPS.Tlambda} />
            </div>

            <div className="control-group">
              <h3>Réductions pensions</h3>
              <Toggle label="Courbe Equinoxe (vs. step function)"
                checked={p.useEquinoxe} onChange={v => setParam('useEquinoxe', v)} tip={TIPS.useEquinoxe} />
              {!p.useEquinoxe && (
                <>
                  <Slider label="Taux réduction κ" value={p.kappa}
                    onChange={v => setParam('kappa', v)} min={0} max={0.25} step={0.01} unit="" decimals={2} tip={TIPS.kappa} />
                  <Slider label="Seuil (€/mois)" value={p.threshold}
                    onChange={v => setParam('threshold', v)} min={1500} max={3000} step={50} unit="€" decimals={0} tip={TIPS.threshold} />
                </>
              )}
            </div>

            <div className="control-group">
              <h3>CDC / Fonds</h3>
              <Slider label="Actifs CDC F₀" value={p.F0}
                onChange={v => setParam('F0', v)} min={100} max={300} step={10} unit="Md€" decimals={0} tip={TIPS.F0} />
              <Slider label="Pic cohorte T_pk" value={p.Tpk}
                onChange={v => setParam('Tpk', v)} min={3} max={15} step={1} unit="ans" decimals={0} tip={TIPS.Tpk} />
              <Slider label="Demi-vie cohorte T_hl" value={p.Thl}
                onChange={v => setParam('Thl', v)} min={10} max={40} step={1} unit="ans" decimals={0} tip={TIPS.Thl} />
            </div>
          </div>
        )}

        <div className="mc-controls">
          <button className="mc-btn" onClick={runMC} disabled={mcRunning}>
            {mcRunning ? 'Simulation en cours...' : 'Lancer Monte Carlo'}
          </button>
          <select className="mc-select" value={mcRuns} onChange={e => setMcRuns(parseInt(e.target.value))}>
            <option value={100}>100 runs</option>
            <option value={500}>500 runs</option>
            <option value={1000}>1 000 runs</option>
          </select>
          {mcProgress && <span className="mc-progress">{mcProgress}</span>}
          {mcBands && <span className="mc-progress" style={{ color: 'var(--color-success)' }}>Monte Carlo affich&eacute;</span>}
        </div>
      </section>

      {/* KPIs */}
      <section className="section">
        <h2>Indicateurs cl&eacute;s</h2>
        <div className="kpi-grid">
          <div className="kpi-card">
            <h3>Dette pic</h3>
            <div className={`kpi-value ${kpis.peakDebt > 2000 ? 'kpi-bad' : kpis.peakDebt > 1500 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtTn(kpis.peakDebt)} &euro;</div>
            <div className="kpi-sub">Ann&eacute;e {kpis.peakDebtYear}</div>
          </div>
          <div className="kpi-card">
            <h3>Ann&eacute;e sans dette</h3>
            <div className={`kpi-value ${!kpis.debtFreeYear ? 'kpi-bad' : kpis.debtFreeYear > 2070 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtYear(kpis.debtFreeYear)}</div>
          </div>
          <div className="kpi-card">
            <h3>Int&eacute;r&ecirc;ts cumul&eacute;s</h3>
            <div className="kpi-value">{fmtTn(kpis.totalInterest)} &euro;</div>
          </div>
          <div className="kpi-card">
            <h3>Pot capi (nominal)</h3>
            <div className="kpi-value">{fmtTn(kpis.finalCapi)} &euro;</div>
          </div>
          <div className="kpi-card">
            <h3>Pot capi (r&eacute;el 2026&euro;)</h3>
            <div className="kpi-value">{fmtTn(kpis.finalCapiReal)} &euro;</div>
          </div>
          <div className="kpi-card">
            <h3>Spread &sigma; min</h3>
            <div className={`kpi-value ${kpis.minSpread <= 0 ? 'kpi-bad' : kpis.minSpread < 0.01 ? 'kpi-warn' : 'kpi-ok'}`}>
              {fmtPct(kpis.minSpread)}</div>
          </div>
          <div className="kpi-card">
            <h3>&Eacute;conomies pension S&sub;0</h3>
            <div className="kpi-value">{kpis.S0.toFixed(1)} Md&euro;/an</div>
            <div className="kpi-sub">{p.useEquinoxe ? 'Equinoxe' : 'Step function'}</div>
          </div>
          <div className="kpi-card">
            <h3>Position nette</h3>
            <div className={`kpi-value ${kpis.netPosition > 0 ? 'kpi-ok' : 'kpi-bad'}`}>
              {fmtTn(kpis.netPosition)} &euro;</div>
          </div>
        </div>
      </section>

      {/* CHARTS */}
      <section className="section">
        <h2>Graphiques</h2>

        <div className="chart-container">
          <h3>Bilan du fonds legacy — D&eacute;penses vs. Revenus (Md&euro;)</h3>
          <p className="chart-note">Aire empil&eacute;e = revenus du fonds. Au-dessus de la ligne rouge = exc&eacute;dent (remboursement dette).</p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Md€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v.toFixed(1)} Md€`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="fundReturn" stackId="income" fill="#60a5fa" stroke="#3b82f6" name="Rendement fonds" />
              <Area type="monotone" dataKey="hlmProceeds" stackId="income" fill="#34d399" stroke="#10b981" name="HLM" />
              <Area type="monotone" dataKey="abatement" stackId="income" fill="#fbbf24" stroke="#f59e0b" name="Abattement fiscal" />
              <Area type="monotone" dataKey="emplrToLeg" stackId="income" fill="#a78bfa" stroke="#8b5cf6" name="Cotis. employeur → legacy" />
              <Line type="monotone" dataKey="legacyExp" stroke="#ef4444" strokeWidth={3} name="Dépenses legacy" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>D&eacute;penses retraites — Legacy (PAYG) vs. Capitalisation (Md&euro;)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Md€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="legacyExp" stackId="pensions" fill="#fca5a5" stroke="#ef4444" name="Pensions legacy (PAYG)" />
              <Area type="monotone" dataKey="capiPayout" stackId="pensions" fill="#86efac" stroke="#059669" name="Pensions capitalisation" />
              <Line type="monotone" dataKey="totalPensionExp" stroke="#1e293b" strokeWidth={2} strokeDasharray="5 5" name="Total pensions" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Trajectoire dette souveraine (Md&euro;) + taux d'emprunt effectif</h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" label={{ value: 'Md€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: 'r_d (%)', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {mcBands && (
                <>
                  <Area yAxisId="left" type="monotone" dataKey="debt_p5_p95" fill="#fecaca" stroke="none" name="IC 90%" opacity={0.4} />
                  <Area yAxisId="left" type="monotone" dataKey="debt_p25_p75" fill="#fca5a5" stroke="none" name="IC 50%" opacity={0.4} />
                </>
              )}
              <Line yAxisId="left" type="monotone" dataKey="debt" stroke="#dc2626" strokeWidth={3} name="Dette (Md€)" dot={false} />
              {mcBands && <Line yAxisId="left" type="monotone" dataKey="debt_p50" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" name="Médiane MC" dot={false} />}
              <Line yAxisId="right" type="monotone" dataKey="r_d" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" name="r_d effectif (%)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Pot de capitalisation (Tn&euro;)</h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Tn€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => {
                if (Array.isArray(v)) return `[${v[0].toFixed(1)}, ${v[1].toFixed(1)}] Tn€`
                return `${typeof v === 'number' ? v.toFixed(2) : v} Tn€`
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {mcBands && (
                <>
                  <Area type="monotone" dataKey="capi_p5_p95" fill="#bbf7d0" stroke="none" name="IC 90% nom." opacity={0.3} />
                  <Area type="monotone" dataKey="capi_p25_p75" fill="#86efac" stroke="none" name="IC 50% nom." opacity={0.3} />
                  <Area type="monotone" dataKey="capiReal_p5_p95" fill="#bfdbfe" stroke="none" name="IC 90% réel" opacity={0.3} />
                  <Area type="monotone" dataKey="capiReal_p25_p75" fill="#93c5fd" stroke="none" name="IC 50% réel" opacity={0.3} />
                </>
              )}
              <Line type="monotone" dataKey="capi" stroke="#059669" strokeWidth={3} name="Nominal" dot={false} />
              <Line type="monotone" dataKey="capiReal" stroke="#2563eb" strokeWidth={3} name="Réel (€ 2026)" dot={false} />
              {mcBands && <Line type="monotone" dataKey="capi_p50" stroke="#059669" strokeWidth={1} strokeDasharray="4 4" name="Médiane MC" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Spread &sigma; = r_f − (r_d − &pi;) en points de %</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
              <ReferenceLine y={0} stroke="#dc2626" strokeWidth={2} strokeDasharray="8 4" label={{ value: 'σ=0', fill: '#dc2626', fontSize: 11 }} />
              <Line type="monotone" dataKey="spread" stroke="#7c3aed" strokeWidth={2} name="Spread σ (%)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Flux de cotisations (Md&euro;/an)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData.filter((_, i) => i % 2 === 0)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Md€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v.toFixed(1)} Md€`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="emplC_s" stackId="a" fill="#3b82f6" name="Salarié → capi" />
              <Bar dataKey="emplrToCap_bar" stackId="a" fill="#8b5cf6" name="Employeur → capi" />
              <Bar dataKey="emplrToLeg_bar" stackId="a" fill="#f97316" name="Employeur → legacy" />
              <Bar dataKey="levy" stackId="b" fill="#ef4444" name="Prélèvement transition" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>VAN cumul&eacute;e — Engagements legacy vs. paiements capitalisation (Tn&euro;, actualis&eacute;s &agrave; r_d)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis label={{ value: 'Tn€', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(2) : v} Tn€`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="pvLegacyCum" stroke="#ef4444" strokeWidth={3} name="VAN engagements legacy" dot={false} />
              <Line type="monotone" dataKey="pvCapiPayoutCum" stroke="#059669" strokeWidth={3} name="VAN pensions capi" dot={false} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* DATA TABLE */}
      <section className="section">
        <div className="collapsible-header" onClick={() => setShowTable(!showTable)}>
          <span className={`arrow ${showTable ? 'open' : ''}`}>▶</span>
          <h2 style={{ border: 'none', margin: 0, padding: 0 }}>Tableau de donn&eacute;es</h2>
        </div>
        {showTable && (
          <>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ann&eacute;e</th><th>&phi;_t</th><th>D&eacute;p. legacy</th><th>D&eacute;p. capi</th>
                    <th>Total pens.</th><th>Rend. fonds</th><th>HLM</th><th>Abatt.</th>
                    <th>Sal.→capi</th><th>Empl.→leg</th><th>Empl.→cap</th>
                    <th>Int. dette</th><th>Flux net</th><th>Emprunt</th><th>Rembours.</th>
                    <th>Pr&eacute;l&egrave;v.</th><th>Dette</th><th>r_d (%)</th><th>Dette/PIB</th>
                    <th>Capi nom.</th><th>Capi r&eacute;el</th><th>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.year}>
                      <td>{r.year}</td>
                      <td>{r.cohIdx.toFixed(3)}</td>
                      <td>{r.legacyExp.toFixed(1)}</td>
                      <td>{r.capiPayout.toFixed(1)}</td>
                      <td>{r.totalPensionExp.toFixed(1)}</td>
                      <td>{r.fundReturn.toFixed(1)}</td>
                      <td>{r.hlmProceeds.toFixed(1)}</td>
                      <td>{r.abatement.toFixed(1)}</td>
                      <td>{r.emplC_s.toFixed(1)}</td>
                      <td>{r.emplrToLeg.toFixed(1)}</td>
                      <td>{r.emplrToCap.toFixed(1)}</td>
                      <td>{r.debtInterest.toFixed(1)}</td>
                      <td>{r.netFlow.toFixed(1)}</td>
                      <td>{r.borrowed.toFixed(1)}</td>
                      <td>{r.repaid.toFixed(1)}</td>
                      <td>{r.levy.toFixed(1)}</td>
                      <td>{r.debt.toFixed(0)}</td>
                      <td>{(r.r_d * 100).toFixed(2)}</td>
                      <td>{r.debtRatio.toFixed(1)}%</td>
                      <td>{(r.capi / 1000).toFixed(2)} Tn</td>
                      <td>{(r.capiReal / 1000).toFixed(2)} Tn</td>
                      <td>{(r.spread * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="export-btn" onClick={exportCSV}>Exporter CSV</button>
          </>
        )}
      </section>

      </>}

      <footer className="footer">
        &Eacute;quations 1–34 &middot; cdc_legacy_fund_model.md v5 &middot;
        <a href="https://github.com/alles-delenda-est/cdc-pension-simulator" style={{ color: 'var(--color-primary-light)', marginLeft: 4 }}>Source</a>
      </footer>
    </div>
  )
}
