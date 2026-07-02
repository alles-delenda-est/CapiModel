import { useState, useMemo } from 'react'
import { runSimulation } from '../simulation-engine.js'
import { REFORMS, SIMPLE_REFORM_IDS, SIMPLE_BASE } from '../reforms.js'
import { derivePerRetireePension } from '../pension.js'
import { extractSimplifiedKPIs } from '../simplified-kpis.js'
import { solveEquilibreEmployment } from '../equilibre-solver.js'
import IndividualPerspectivePanel from '../components/IndividualPerspectivePanel.jsx'
import SimplifiedChart from './SimplifiedChart.jsx'
import SimplifiedParams from './SimplifiedParams.jsx'
import './SimplifiedView.css'

const R0 = 18.0
const fmtMd = v => `${Math.round(v).toLocaleString('fr-FR')} Md€`
const fmtEurMo = v => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v)).toLocaleString('fr-FR')} €/mois`

// Map the lay UI keys to engine params. All are engine keys already, except the
// synthetic `hlmBundle` switch which expands to the HLM/CDC financing params.
function mapOverrides(o) {
  const { hlmBundle, ...rest } = o
  if (hlmBundle === undefined) return rest
  return hlmBundle
    ? { ...rest, rho: 0.05, delta: 0.3, hlmDiscount: true }
    : { ...rest, rho: 0, delta: 0, hlmDiscount: false }
}

export default function SimplifiedView({ navigateTo }) {
  const [reformId, setReformId] = useState('actuel')
  const [conditionId, setConditionId] = useState('neutre')
  const [overrides, setOverrides] = useState({})
  const [showHowItWorks, setShowHowItWorks] = useState(true)

  const selectReform = id => { setReformId(id); setOverrides({}) }
  const setOverride = (k, v) => setOverrides(p => ({ ...p, [k]: v }))

  // Pinned pension baseline: ONE actuel reference run, year 2027 (spec §10 B2) —
  // never the selected reform, so cross-reform comparison stays meaningful.
  const baseline = useMemo(() => {
    const rows = runSimulation(SIMPLE_BASE('actuel', 'neutre'))
    return derivePerRetireePension(rows.find(r => r.year === 2027), R0)
  }, [])

  const baseCfg = useMemo(
    () => ({ ...SIMPLE_BASE(reformId, conditionId), ...mapOverrides(overrides) }),
    [reformId, conditionId, overrides]
  )

  // Équilibre 2070: auto-solve employment so netFund(2070) ≈ 0 (spec §7).
  const solve = useMemo(
    () => (reformId === 'equilibre2070' ? solveEquilibreEmployment(baseCfg) : null),
    [reformId, baseCfg]
  )
  const runConfig = solve ? solve.config : baseCfg
  const infeasible = solve ? !solve.feasible : false

  const results = useMemo(() => runSimulation(runConfig), [runConfig])
  const kpis = useMemo(
    () => extractSimplifiedKPIs(results, { R0, baselinePerRetiree2027: baseline }),
    [results, baseline]
  )

  const values = {
    w_r: runConfig.w_r,
    retirementAgeBase: runConfig.retirementAgeBase,
    employmentRateTarget: runConfig.employmentRateTarget,
    retirementAgeMode: runConfig.retirementAgeMode,
    fiscalTransferMode: runConfig.fiscalTransferMode,
    hlmBundle: (runConfig.rho ?? 0) > 0,
  }
  const disabledKeys = reformId === 'equilibre2070' ? ['employmentRateTarget'] : []

  return (
    <div className="sv-app">

      {/* ---- REFORM SELECTOR ---- */}
      <section className="sv-section sv-scenarios-section">
        <h2>Choisissez une réforme</h2>
        <p className="sv-section-intro">
          Chaque chemin pour préserver les retraites françaises a un prix&nbsp;—
          payé en pensions coupées, en budget sacrifié, ou en dette. Choisissez
          une réforme et observez les quatre prix bouger.
        </p>
        <div className="sv-scenario-grid">
          {SIMPLE_REFORM_IDS.map(id => (
            <button key={id}
              className={`sv-scenario-btn ${reformId === id ? 'active' : ''}`}
              onClick={() => selectReform(id)}>
              <strong>{REFORMS[id].label}</strong>
              <span className="sv-scenario-desc">{REFORMS[id].blurb}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- FOUR PRICES (or infeasible banner) ---- */}
      <section className="sv-section">
        <h2>Les quatre prix</h2>
        {infeasible ? (
          <div className="sv-infeasible">
            <strong>Impossible d’équilibrer dans ces conditions sans autre levier.</strong>
            <p>
              Même en portant le taux d’emploi à son plafond, la répartition ne
              peut pas être équilibrée en 2070 sous ces hypothèses. C’est
              précisément le message&nbsp;: il n’y a pas de levier gratuit.
            </p>
          </div>
        ) : (
          <div className="sv-kpi-grid">
            <div className="sv-kpi-card">
              <h3>Pension moyenne 2070</h3>
              <div className={`sv-kpi-value ${kpis.pensionDelta2070 >= 0 ? 'sv-ok' : 'sv-bad'}`}>
                {fmtEurMo(kpis.pensionDelta2070)}
              </div>
              <div className="sv-kpi-year">écart de pouvoir d’achat vs aujourd’hui</div>
            </div>
            <div className="sv-kpi-card">
              <h3>Année de collapse</h3>
              <div className={`sv-kpi-value ${kpis.collapseYear ? 'sv-bad' : 'sv-ok'}`}>
                {kpis.collapseYear ?? 'Système sain'}
              </div>
              <div className="sv-kpi-year">
                {kpis.collapseYear ? 'restructuration forcée (dette > 250 % PIB)' : 'aucune restructuration'}
              </div>
            </div>
            <div className="sv-kpi-card">
              <h3>Sacrifices budgétaires</h3>
              <div className={`sv-kpi-value ${kpis.sacrificesReal > 500 ? 'sv-warn' : 'sv-ok'}`}>
                {fmtMd(kpis.sacrificesReal)}
              </div>
              <div className="sv-kpi-year">cumul, euros 2027 (écoles, justice, solidarité)</div>
            </div>
            <div className="sv-kpi-card">
              <h3>Fonds net 2070</h3>
              <div className={`sv-kpi-value ${kpis.fondsNet2070 >= 0 ? 'sv-ok' : 'sv-bad'}`}>
                {fmtMd(kpis.fondsNet2070)}
              </div>
              <div className="sv-kpi-year">épargne − dette, à l’horizon COR</div>
            </div>
          </div>
        )}
      </section>

      {/* ---- CHART ---- */}
      <section className="sv-section">
        <SimplifiedChart results={results} collapseYear={kpis.collapseYear} />
      </section>

      {/* ---- PARAMETERS ---- */}
      <section className="sv-section">
        <h2>Paramètres</h2>
        <p className="sv-section-intro">
          Un seul choix en haut (la réforme)&nbsp;; tout le reste est un paramètre.
        </p>
        <SimplifiedParams
          values={values} setOverride={setOverride}
          conditionId={conditionId} setCondition={setConditionId}
          disabledKeys={disabledKeys} />
      </section>

      {/* ---- HOW IT WORKS (retained) ---- */}
      <section className="sv-section">
        <div className="sv-collapsible" onClick={() => setShowHowItWorks(!showHowItWorks)}>
          <span className={`sv-arrow ${showHowItWorks ? 'open' : ''}`}>{'▶'}</span>
          <h2>Comment ça marche&nbsp;?</h2>
        </div>
        {showHowItWorks && (
          <div className="sv-steps">
            <div className="sv-step">
              <div className="sv-step-number">1</div>
              <h3>Aujourd'hui</h3>
              <p>
                Les actifs cotisent pour payer directement les retraites des
                retraités actuels. C'est le système par <strong>répartition</strong>&nbsp;:
                l'argent ne fait que transiter, il n'est pas épargné.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">2</div>
              <h3>La réforme</h3>
              <p>
                Selon la réforme choisie, on ajuste les prestations et l'âge, ou
                l'on redirige une partie des cotisations vers de
                l'<strong>épargne investie</strong> qui fructifie.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">3</div>
              <h3>Le défi de la transition</h3>
              <p>
                Pendant la transition, il faut continuer à payer les retraités
                actuels. Le manque se comble par la <strong>dette</strong>, par des
                <strong> sacrifices budgétaires</strong>, ou par plus de travail.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">4</div>
              <h3>À terme</h3>
              <p>
                Le système se stabilise&nbsp;— ou non. Les quatre prix ci-dessus
                montrent ce que chaque chemin coûte réellement d'ici 2070.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---- INDIVIDUAL PERSPECTIVE (retained; audited safe, spec §10 M2) ---- */}
      <section className="sv-section">
        <h2>Et pour vous&nbsp;?</h2>
        <IndividualPerspectivePanel params={runConfig} reformResults={results} />
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="sv-footer">
        <p>
          Ce simulateur utilise le même moteur de calcul (34 équations
          financières) que la{' '}
          <a href="#/simulateur" onClick={(e) => { e.preventDefault(); navigateTo('simulateur') }}>
            version experte
          </a>.
        </p>
        <p>
          Les résultats dépendent fortement des hypothèses choisies. Ce n'est pas
          une prédiction, c'est un outil d'exploration.
        </p>
        <p>
          <a href="https://github.com/alles-delenda-est/CapiModel">
            Code source sur GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
