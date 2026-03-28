import { useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { runSimulation, extractKPIs, PRESETS } from '../simulation-engine.js'
import './SimplifiedView.css'

// === Simplified scenario definitions — same engine params, friendly labels ===
const SCENARIOS = {
  prudent: {
    label: 'Prudent',
    tagline: 'Hypothèses conservatrices',
    description: 'Rendements modestes, emprunt plus cher, ventes de logements sociaux plus lentes. Que se passe-t-il si les conditions économiques sont difficiles ?',
    color: '#e11d48',
    params: { ...PRESETS.stress.params },
  },
  central: {
    label: 'Central',
    tagline: 'Hypothèses réalistes',
    description: 'Basé sur les tendances économiques récentes en France. C\'est le scénario de référence, ni optimiste ni pessimiste.',
    color: '#2563eb',
    params: { ...PRESETS.default.params },
  },
  optimiste: {
    label: 'Optimiste',
    tagline: 'Conjoncture favorable',
    description: 'Bons rendements financiers, salaires en hausse plus rapide. Que se passe-t-il si l\'économie se porte bien ?',
    color: '#059669',
    params: { ...PRESETS.optimiste.params },
  },
}

// === Simplified slider config — the 5 most impactful parameters ===
const ADJUSTABLE_PARAMS = [
  {
    key: 'r_c',
    label: 'Rendement de l\'épargne retraite',
    description: 'Combien les placements rapportent chaque année, après inflation. Un portefeuille diversifié rapporte historiquement 3-4% par an.',
    min: 0.015, max: 0.055, step: 0.005,
    format: v => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'w_r',
    label: 'Croissance des salaires',
    description: 'De combien les salaires augmentent au-delà de l\'inflation chaque année. En France, c\'est environ 0.5-1% ces dernières années.',
    min: 0, max: 0.02, step: 0.001,
    format: v => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'r_d_base',
    label: 'Coût d\'emprunt de l\'État',
    description: 'Le taux auquel la France emprunte sur les marchés (OAT 10 ans). Actuellement environ 3-3.5%. Plus c\'est élevé, plus la transition coûte cher.',
    min: 0.02, max: 0.06, step: 0.005,
    format: v => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'rho',
    label: 'Vitesse de vente des logements sociaux',
    description: 'Quelle part des 5.3 millions de logements sociaux (HLM) est vendue chaque année pour financer la transition. 5% = environ 265 000 logements/an.',
    min: 0.01, max: 0.12, step: 0.01,
    format: v => `${(v * 100).toFixed(0)}% par an`,
  },
  {
    key: 'lambda',
    label: 'Prélèvement de transition',
    description: 'Part des cotisations retraite temporairement prélevée pour rembourser la dette plus vite. Ce prélèvement s\'active 15 ans après la réforme.',
    min: 0, max: 0.50, step: 0.05,
    format: v => `${(v * 100).toFixed(0)}%`,
  },
]

const MILESTONE_YEARS = [2026, 2030, 2035, 2040, 2050, 2060, 2070, 2080, 2096]

// === Format helpers ===
const fmtMd = (v) => {
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(v / 1000).toFixed(1)} Tn€`
  if (abs >= 1000) return `${(v / 1000).toFixed(2)} Tn€`
  return `${v.toFixed(0)} Md€`
}

// === Main component ===
export default function SimplifiedView({ navigateTo }) {
  const [scenario, setScenario] = useState('central')
  const [overrides, setOverrides] = useState({})
  const [showHowItWorks, setShowHowItWorks] = useState(true)
  const [showAdjust, setShowAdjust] = useState(false)

  // Merge scenario params with any user overrides
  const params = useMemo(() => ({
    ...SCENARIOS[scenario].params,
    ...overrides,
  }), [scenario, overrides])

  // Run the full simulation (same engine as expert view)
  const { results, kpis } = useMemo(() => {
    const results = runSimulation(params)
    const kpis = extractKPIs(results)
    return { results, kpis }
  }, [params])

  const handleScenarioChange = (key) => {
    setScenario(key)
    setOverrides({})
  }

  const setOverride = (key, value) => {
    setOverrides(prev => ({ ...prev, [key]: value }))
  }

  // --- Compute key milestones ---
  const milestones = useMemo(() => {
    const items = [
      {
        year: 2026,
        label: 'Début de la réforme',
        detail: 'Les cotisations salariées commencent à alimenter l\'épargne retraite individuelle',
      },
    ]

    if (kpis.peakDebtYear) {
      items.push({
        year: kpis.peakDebtYear,
        label: `Pic de dette : ${fmtMd(kpis.peakDebt)}`,
        detail: 'Le besoin de financement de la transition atteint son maximum',
      })
    }

    // Crossover: when capitalisation pensions surpass legacy pensions
    const crossover = results.find(r => r.capiPayout > r.legacyExp && r.t > 5)
    if (crossover) {
      items.push({
        year: crossover.year,
        label: 'Bascule des pensions',
        detail: 'Les pensions du nouveau système dépassent celles de l\'ancien',
      })
    }

    if (kpis.debtFreeYear) {
      items.push({
        year: kpis.debtFreeYear,
        label: 'Dette remboursée',
        detail: 'La dette de transition est entièrement soldée',
      })
    }

    const lastYear = 2026 + params.N - 1
    items.push({
      year: lastYear,
      label: 'Fin de simulation',
      detail: `Épargne retraite accumulée : ${fmtMd(kpis.finalCapiReal)} (en euros 2026)`,
    })

    return items.sort((a, b) => a.year - b.year)
  }, [results, kpis, params.N])

  // --- Chart data (simplified — fewer fields than expert view) ---
  const chartData = useMemo(() => {
    return results.map(r => ({
      year: r.year,
      legacyExp: r.legacyExp,
      capiPayout: r.capiPayout,
      totalPensionExp: r.totalPensionExp,
      debt: r.debt,
      capi: r.capi / 1000,
      capiReal: r.capiReal / 1000,
    }))
  }, [results])

  // --- Dynamic narrative based on results ---
  const narrative = useMemo(() => {
    const { peakDebt, peakDebtYear, debtFreeYear, finalCapiReal, netPosition, minSpread } = kpis

    let debtSentence
    if (debtFreeYear) {
      const duration = debtFreeYear - 2026
      if (debtFreeYear <= 2060) {
        debtSentence = `L'État devrait emprunter jusqu'à ${fmtMd(peakDebt)} (pic atteint en ${peakDebtYear}), mais cette dette serait entièrement remboursée d'ici ${debtFreeYear}—soit en ${duration}ans.`
      } else {
        debtSentence = `L'État devrait emprunter jusqu'à ${fmtMd(peakDebt)} (pic en ${peakDebtYear}). La dette serait remboursée d'ici ${debtFreeYear}, soit ${duration}ans après le début de la réforme. C'est un délai long qui suppose une stabilité économique durable.`
      }
    } else {
      debtSentence = `L'État devrait emprunter jusqu'à ${fmtMd(peakDebt)} (pic en ${peakDebtYear}). Attention: la dette ne serait pas entièrement remboursée dans l'horizon de ${params.N}ans simulé.`
    }

    const capiSentence = `À terme, l'épargne retraite collective atteindrait ${fmtMd(finalCapiReal)} en euros d'aujourd'hui (corrigés de l'inflation).`

    let verdict, verdictType
    if (netPosition > 0 && debtFreeYear && debtFreeYear <= 2065) {
      verdict = 'Sous ces hypothèses, la transition est financièrement viable: elle crée nettement plus de richesse qu\'elle n\'en emprunte, et la dette est remboursée dans un délai raisonnable.'
      verdictType = 'positive'
    } else if (netPosition > 0 && debtFreeYear) {
      verdict = 'Le bilan net est positif, mais la dette prend du temps à se résorber. Le succès dépend de la capacité à maintenir des rendements financiers stables sur une longue période.'
      verdictType = 'cautious'
    } else if (netPosition > 0) {
      verdict = 'Le bilan net est positif, mais la dette n\'est pas entièrement remboursée dans l\'horizon simulé. Des ajustements seraient nécessaires pour accélérer le remboursement.'
      verdictType = 'warning'
    } else {
      verdict = 'Attention: sous ces hypothèses, la transition ne s\'autofinance pas. La dette de transition dépasse la richesse créée. Ce scénario nécessiterait des ajustements importants.'
      verdictType = 'negative'
    }

    let spreadWarning = ''
    if (minSpread < 0) {
      spreadWarning = 'Le fonds de transition rapporte moins que le coût de l\'emprunt—c\'est une zone de danger où la dette s\'alimente elle-même.'
    }

    return { debtSentence, capiSentence, verdict, verdictType, spreadWarning }
  }, [kpis, params.N])

  // ================================================================
  // RENDER
  // ================================================================
  return (
    <div className="sv-app">

      {/* ---- HOW IT WORKS ---- */}
      <section className="sv-section">
        <div className="sv-collapsible" onClick={() => setShowHowItWorks(!showHowItWorks)}>
          <span className={`sv-arrow ${showHowItWorks ? 'open' : ''}`}>{'\u25B6'}</span>
          <h2>Comment ça marche?</h2>
        </div>
        {showHowItWorks && (
          <div className="sv-steps">
            <div className="sv-step">
              <div className="sv-step-number">1</div>
              <h3>Aujourd'hui</h3>
              <p>
                Les actifs cotisent pour payer directement les retraites
                des retraités actuels. C'est le système
                par <strong>répartition</strong>: l'argent ne fait
                que transiter, il n'est pas épargné.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">2</div>
              <h3>La réforme</h3>
              <p>
                Les cotisations des salariés sont redirigées
                vers des <strong>comptes d'épargne individuels</strong>.
                Cet argent est investi et fructifie au fil des années.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">3</div>
              <h3>Le défi de la transition</h3>
              <p>
                Pendant la transition, il faut continuer à payer les
                retraités actuels alors que les cotisations sont
                redirigées. <strong>L'État emprunte</strong> pour
                combler cet écart—c'est la
                «dette de transition».
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">4</div>
              <h3>À terme</h3>
              <p>
                Les anciens retraités sont progressivement remplacés
                par des retraités qui vivent de <strong>leur propre
                épargne</strong>. La dette est remboursée. Le nouveau
                système est autonome.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---- SCENARIO PICKER ---- */}
      <section className="sv-section sv-scenarios-section">
        <h2>Choisissez un scénario</h2>
        <p className="sv-section-intro">
          Comment l'économie se comporte-t-elle pendant la transition ?
          Trois visions possibles:
        </p>
        <div className="sv-scenario-grid">
          {Object.entries(SCENARIOS).map(([key, s]) => (
            <button
              key={key}
              className={`sv-scenario-btn ${scenario === key ? 'active' : ''}`}
              onClick={() => handleScenarioChange(key)}
              style={{ '--accent': s.color }}
            >
              <strong>{s.label}</strong>
              <span className="sv-scenario-tagline">{s.tagline}</span>
              <span className="sv-scenario-desc">{s.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- OPTIONAL ADJUSTMENTS ---- */}
      <section className="sv-section">
        <div className="sv-collapsible" onClick={() => setShowAdjust(!showAdjust)}>
          <span className={`sv-arrow ${showAdjust ? 'open' : ''}`}>{'\u25B6'}</span>
          <h2>Ajuster les hypothèses</h2>
          <span className="sv-optional-badge">Optionnel</span>
        </div>
        {showAdjust && (
          <div className="sv-sliders">
            <p className="sv-sliders-intro">
              Vous pouvez modifier les hypothèses clés pour voir leur
              impact. Le modèle complet utilise plus de 25 paramètres
              — voici les 5 les plus importants.
            </p>
            {ADJUSTABLE_PARAMS.map(cfg => (
              <div key={cfg.key} className="sv-slider-card">
                <div className="sv-slider-header">
                  <label>{cfg.label}</label>
                  <span className="sv-slider-value">{cfg.format(params[cfg.key])}</span>
                </div>
                <input
                  type="range"
                  className="sv-slider"
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  value={params[cfg.key]}
                  onChange={e => setOverride(cfg.key, parseFloat(e.target.value))}
                />
                <p className="sv-slider-desc">{cfg.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- NARRATIVE SUMMARY ---- */}
      <section className={`sv-section sv-narrative sv-narrative-${narrative.verdictType}`}>
        <h2>Que se passe-t-il?</h2>
        <p>{narrative.debtSentence}</p>
        <p>{narrative.capiSentence}</p>
        {narrative.spreadWarning && (
          <p className="sv-spread-warning">{narrative.spreadWarning}</p>
        )}
        <p className="sv-verdict"><strong>{narrative.verdict}</strong></p>
      </section>

      {/* ---- KPI CARDS ---- */}
      <section className="sv-section">
        <h2>Les chiffres clés</h2>
        <div className="sv-kpi-grid">
          <div className="sv-kpi-card">
            <h3>Pic d'emprunt</h3>
            <div className={`sv-kpi-value ${
              kpis.peakDebt > 2000 ? 'sv-bad' : kpis.peakDebt > 1500 ? 'sv-warn' : 'sv-ok'
            }`}>
              {fmtMd(kpis.peakDebt)}
            </div>
            <div className="sv-kpi-year">atteint en {kpis.peakDebtYear}</div>
            <p className="sv-kpi-explain">
              Le montant maximum que l'État devrait emprunter pour
              financer la transition. Pour comparaison, la dette publique
              française actuelle est d'environ 3200Md€.
            </p>
          </div>

          <div className="sv-kpi-card">
            <h3>Date de remboursement</h3>
            <div className={`sv-kpi-value ${
              !kpis.debtFreeYear ? 'sv-bad' : kpis.debtFreeYear > 2070 ? 'sv-warn' : 'sv-ok'
            }`}>
              {kpis.debtFreeYear || 'Pas dans l\'horizon'}
            </div>
            {kpis.debtFreeYear && (
              <div className="sv-kpi-year">
                soit {kpis.debtFreeYear - 2026} ans après la réforme
              </div>
            )}
            <p className="sv-kpi-explain">
              L'année où la dette de transition serait entièrement
              remboursée. Plus c'est tôt, moins la réforme
              coûte en intérêts.
            </p>
          </div>

          <div className="sv-kpi-card">
            <h3>Épargne accumulée</h3>
            <div className="sv-kpi-value sv-ok">{fmtMd(kpis.finalCapiReal)}</div>
            <div className="sv-kpi-year">en euros 2026</div>
            <p className="sv-kpi-explain">
              La valeur totale de l'épargne retraite en fin de simulation,
              en pouvoir d'achat d'aujourd'hui (corrigée de l'inflation).
            </p>
          </div>

          <div className="sv-kpi-card">
            <h3>Bilan net</h3>
            <div className={`sv-kpi-value ${kpis.netPosition > 0 ? 'sv-ok' : 'sv-bad'}`}>
              {kpis.netPosition > 0 ? '+' : ''}{fmtMd(kpis.netPosition)}
            </div>
            <div className="sv-kpi-year">épargne − dette</div>
            <p className="sv-kpi-explain">
              Épargne accumulée moins dette restante. Un chiffre positif
              signifie que la réforme crée plus de richesse qu'elle
              n'en emprunte.
            </p>
          </div>
        </div>
      </section>

      {/* ---- SUMMARY TABLE ---- */}
      <section className="sv-section">
        <h2>Résumé par décennie</h2>
        <p className="sv-section-intro">
          Évolution des principaux indicateurs aux dates clés de la transition.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="sv-summary-table">
            <thead>
              <tr>
                <th>Année</th>
                <th>Pensions ancien système (Md€)</th>
                <th>Pensions nouveau système (Md€)</th>
                <th>Dette de transition (Md€)</th>
                <th>Épargne retraite réelle (Tn€)</th>
              </tr>
            </thead>
            <tbody>
              {results
                .filter(r => MILESTONE_YEARS.includes(r.year))
                .map(r => (
                  <tr key={r.year}>
                    <td>{r.year}</td>
                    <td>{r.legacyExp.toFixed(1)}</td>
                    <td>{r.capiPayout.toFixed(1)}</td>
                    <td>{r.debt.toFixed(0)}</td>
                    <td>{(r.capiReal / 1000).toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- CHARTS ---- */}
      <section className="sv-section">
        <h2>Visualisations</h2>

        {/* Chart 1: Pension split */}
        <div className="sv-chart-block">
          <h3>Comment les pensions évoluent au fil du temps</h3>
          <p className="sv-chart-explain">
            Les pensions de l'ancien système (en rouge) diminuent à mesure
            que les retraités actuels partent, tandis que le nouveau système
            par capitalisation (en vert) prend le relais. La ligne pointillée
            montre le total des pensions versées.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis
                label={{ value: 'Md€/an', angle: -90, position: 'insideLeft', style: { fontSize: 13 } }}
                tick={{ fontSize: 13 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v} Md€`} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Area type="monotone" dataKey="legacyExp" stackId="pensions"
                fill="#fca5a5" stroke="#ef4444" name="Ancien système (répartition)" />
              <Area type="monotone" dataKey="capiPayout" stackId="pensions"
                fill="#86efac" stroke="#059669" name="Nouveau système (capitalisation)" />
              <Line type="monotone" dataKey="totalPensionExp"
                stroke="#1e293b" strokeWidth={2} strokeDasharray="5 5"
                name="Total des pensions" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Debt trajectory */}
        <div className="sv-chart-block">
          <h3>La dette temporaire de transition</h3>
          <p className="sv-chart-explain">
            L'État emprunte pour financer la transition. Cette dette est
            temporaire: elle est remboursée progressivement grâce
            aux revenus du fonds, aux ventes de logements sociaux et aux cotisations
            employeur.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis
                label={{ value: 'Md€', angle: -90, position: 'insideLeft', style: { fontSize: 13 } }}
                tick={{ fontSize: 13 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(0) : v} Md€`} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area type="monotone" dataKey="debt"
                fill="#fecaca" stroke="#dc2626" strokeWidth={2}
                name="Dette de transition (Md€)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 3: Capitalisation pot */}
        <div className="sv-chart-block">
          <h3>L'épargne retraite collective</h3>
          <p className="sv-chart-explain">
            Le pot d'épargne retraite grandit au fil du temps grâce aux
            cotisations et aux rendements financiers. La ligne bleue montre la
            valeur en euros d'aujourd'hui (corrigée de l'inflation)—c'est
            la mesure la plus honnête du pouvoir d'achat réel.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 13 }} />
              <YAxis
                label={{ value: 'Tn€', angle: -90, position: 'insideLeft', style: { fontSize: 13 } }}
                tick={{ fontSize: 13 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(2) : v} Tn€`} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="capi"
                stroke="#86efac" strokeWidth={2}
                name="Valeur nominale (euros courants)" dot={false} />
              <Line type="monotone" dataKey="capiReal"
                stroke="#2563eb" strokeWidth={3}
                name="Valeur réelle (euros 2026)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ---- MILESTONES TIMELINE ---- */}
      <section className="sv-section">
        <h2>Les étapes clés de la transition</h2>
        <div className="sv-timeline">
          {milestones.map((m, i) => (
            <div key={i} className="sv-timeline-item">
              <div className="sv-timeline-marker">
                <div className="sv-timeline-dot" />
                {i < milestones.length - 1 && <div className="sv-timeline-line" />}
              </div>
              <div className="sv-timeline-content">
                <div className="sv-timeline-year">{m.year}</div>
                <div className="sv-timeline-label">{m.label}</div>
                <div className="sv-timeline-detail">{m.detail}</div>
              </div>
            </div>
          ))}
        </div>
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
          Les résultats dépendent fortement des hypothèses choisies.
          Ce n'est pas une prédiction, c'est un outil d'exploration.
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
