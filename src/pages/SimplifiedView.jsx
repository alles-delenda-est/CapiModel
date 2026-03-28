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

// === Format helpers ===
const fmtMd = (v) => {
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(v / 1000).toFixed(1)} Tn\u20AC`
  if (abs >= 1000) return `${(v / 1000).toFixed(2)} Tn\u20AC`
  return `${v.toFixed(0)} Md\u20AC`
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
        label: 'D\u00E9but de la r\u00E9forme',
        detail: 'Les cotisations salari\u00E9es commencent \u00E0 alimenter l\'\u00E9pargne retraite individuelle',
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
        detail: 'Les pensions du nouveau syst\u00E8me d\u00E9passent celles de l\'ancien',
      })
    }

    if (kpis.debtFreeYear) {
      items.push({
        year: kpis.debtFreeYear,
        label: 'Dette rembours\u00E9e',
        detail: 'La dette de transition est enti\u00E8rement sold\u00E9e',
      })
    }

    const lastYear = 2026 + params.N - 1
    items.push({
      year: lastYear,
      label: 'Fin de simulation',
      detail: `\u00C9pargne retraite accumul\u00E9e : ${fmtMd(kpis.finalCapiReal)} (en euros 2026)`,
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
        debtSentence = `L'\u00C9tat devrait emprunter jusqu'\u00E0 ${fmtMd(peakDebt)} (pic atteint en ${peakDebtYear}), mais cette dette serait enti\u00E8rement rembours\u00E9e d'ici ${debtFreeYear}\u00A0\u2014\u00A0soit en ${duration}\u00A0ans.`
      } else {
        debtSentence = `L'\u00C9tat devrait emprunter jusqu'\u00E0 ${fmtMd(peakDebt)} (pic en ${peakDebtYear}). La dette serait rembours\u00E9e d'ici ${debtFreeYear}, soit ${duration}\u00A0ans apr\u00E8s le d\u00E9but de la r\u00E9forme. C'est un d\u00E9lai long qui suppose une stabilit\u00E9 \u00E9conomique durable.`
      }
    } else {
      debtSentence = `L'\u00C9tat devrait emprunter jusqu'\u00E0 ${fmtMd(peakDebt)} (pic en ${peakDebtYear}). Attention\u00A0: la dette ne serait pas enti\u00E8rement rembours\u00E9e dans l'horizon de ${params.N}\u00A0ans simul\u00E9.`
    }

    const capiSentence = `\u00C0 terme, l'\u00E9pargne retraite collective atteindrait ${fmtMd(finalCapiReal)} en euros d'aujourd'hui (corrig\u00E9s de l'inflation).`

    let verdict, verdictType
    if (netPosition > 0 && debtFreeYear && debtFreeYear <= 2065) {
      verdict = 'Sous ces hypoth\u00E8ses, la transition est financi\u00E8rement viable\u00A0: elle cr\u00E9e nettement plus de richesse qu\'elle n\'en emprunte, et la dette est rembours\u00E9e dans un d\u00E9lai raisonnable.'
      verdictType = 'positive'
    } else if (netPosition > 0 && debtFreeYear) {
      verdict = 'Le bilan net est positif, mais la dette prend du temps \u00E0 se r\u00E9sorber. Le succ\u00E8s d\u00E9pend de la capacit\u00E9 \u00E0 maintenir des rendements financiers stables sur une longue p\u00E9riode.'
      verdictType = 'cautious'
    } else if (netPosition > 0) {
      verdict = 'Le bilan net est positif, mais la dette n\'est pas enti\u00E8rement rembours\u00E9e dans l\'horizon simul\u00E9. Des ajustements seraient n\u00E9cessaires pour acc\u00E9l\u00E9rer le remboursement.'
      verdictType = 'warning'
    } else {
      verdict = 'Attention\u00A0: sous ces hypoth\u00E8ses, la transition ne s\'autofinance pas. La dette de transition d\u00E9passe la richesse cr\u00E9\u00E9e. Ce sc\u00E9nario n\u00E9cessiterait des ajustements importants.'
      verdictType = 'negative'
    }

    let spreadWarning = ''
    if (minSpread < 0) {
      spreadWarning = 'Le fonds de transition rapporte moins que le co\u00FBt de l\'emprunt\u00A0\u2014\u00A0c\'est une zone de danger o\u00F9 la dette s\'alimente elle-m\u00EAme.'
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
          <h2>Comment \u00E7a marche\u00A0?</h2>
        </div>
        {showHowItWorks && (
          <div className="sv-steps">
            <div className="sv-step">
              <div className="sv-step-number">1</div>
              <h3>Aujourd'hui</h3>
              <p>
                Les actifs cotisent pour payer directement les retraites
                des retrait\u00E9s actuels. C'est le syst\u00E8me
                par <strong>r\u00E9partition</strong>\u00A0: l'argent ne fait
                que transiter, il n'est pas \u00E9pargn\u00E9.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">2</div>
              <h3>La r\u00E9forme</h3>
              <p>
                Les cotisations des salari\u00E9s sont redirig\u00E9es
                vers des <strong>comptes d'\u00E9pargne individuels</strong>.
                Cet argent est investi et fructifie au fil des ann\u00E9es.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">3</div>
              <h3>Le d\u00E9fi de la transition</h3>
              <p>
                Pendant la transition, il faut continuer \u00E0 payer les
                retrait\u00E9s actuels alors que les cotisations sont
                redirig\u00E9es. <strong>L'\u00C9tat emprunte</strong> pour
                combler cet \u00E9cart\u00A0\u2014\u00A0c'est la
                \u00AB\u00A0dette de transition\u00A0\u00BB.
              </p>
            </div>
            <div className="sv-step">
              <div className="sv-step-number">4</div>
              <h3>\u00C0 terme</h3>
              <p>
                Les anciens retrait\u00E9s sont progressivement remplac\u00E9s
                par des retrait\u00E9s qui vivent de <strong>leur propre
                \u00E9pargne</strong>. La dette est rembours\u00E9e. Le nouveau
                syst\u00E8me est autonome.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---- SCENARIO PICKER ---- */}
      <section className="sv-section sv-scenarios-section">
        <h2>Choisissez un sc\u00E9nario</h2>
        <p className="sv-section-intro">
          Comment l'\u00E9conomie se comporte-t-elle pendant la transition ?
          Trois visions possibles\u00A0:
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
          <h2>Ajuster les hypoth\u00E8ses</h2>
          <span className="sv-optional-badge">Optionnel</span>
        </div>
        {showAdjust && (
          <div className="sv-sliders">
            <p className="sv-sliders-intro">
              Vous pouvez modifier les hypoth\u00E8ses cl\u00E9s pour voir leur
              impact. Le mod\u00E8le complet utilise plus de 25 param\u00E8tres
              \u2014 voici les 5 les plus importants.
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
        <h2>Que se passe-t-il\u00A0?</h2>
        <p>{narrative.debtSentence}</p>
        <p>{narrative.capiSentence}</p>
        {narrative.spreadWarning && (
          <p className="sv-spread-warning">{narrative.spreadWarning}</p>
        )}
        <p className="sv-verdict"><strong>{narrative.verdict}</strong></p>
      </section>

      {/* ---- KPI CARDS ---- */}
      <section className="sv-section">
        <h2>Les chiffres cl\u00E9s</h2>
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
              Le montant maximum que l'\u00C9tat devrait emprunter pour
              financer la transition. Pour comparaison, la dette publique
              fran\u00E7aise actuelle est d'environ 3\u00A0200\u00A0Md\u20AC.
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
                soit {kpis.debtFreeYear - 2026} ans apr\u00E8s la r\u00E9forme
              </div>
            )}
            <p className="sv-kpi-explain">
              L'ann\u00E9e o\u00F9 la dette de transition serait enti\u00E8rement
              rembours\u00E9e. Plus c'est t\u00F4t, moins la r\u00E9forme
              co\u00FBte en int\u00E9r\u00EAts.
            </p>
          </div>

          <div className="sv-kpi-card">
            <h3>\u00C9pargne accumul\u00E9e</h3>
            <div className="sv-kpi-value sv-ok">{fmtMd(kpis.finalCapiReal)}</div>
            <div className="sv-kpi-year">en euros 2026</div>
            <p className="sv-kpi-explain">
              La valeur totale de l'\u00E9pargne retraite en fin de simulation,
              en pouvoir d'achat d'aujourd'hui (corrig\u00E9e de l'inflation).
            </p>
          </div>

          <div className="sv-kpi-card">
            <h3>Bilan net</h3>
            <div className={`sv-kpi-value ${kpis.netPosition > 0 ? 'sv-ok' : 'sv-bad'}`}>
              {kpis.netPosition > 0 ? '+' : ''}{fmtMd(kpis.netPosition)}
            </div>
            <div className="sv-kpi-year">\u00E9pargne \u2212 dette</div>
            <p className="sv-kpi-explain">
              \u00C9pargne accumul\u00E9e moins dette restante. Un chiffre positif
              signifie que la r\u00E9forme cr\u00E9e plus de richesse qu'elle
              n'en emprunte.
            </p>
          </div>
        </div>
      </section>

      {/* ---- CHARTS ---- */}
      <section className="sv-section">
        <h2>Visualisations</h2>

        {/* Chart 1: Pension split */}
        <div className="sv-chart-block">
          <h3>Comment les pensions \u00E9voluent au fil du temps</h3>
          <p className="sv-chart-explain">
            Les pensions de l'ancien syst\u00E8me (en rouge) diminuent \u00E0 mesure
            que les retrait\u00E9s actuels partent, tandis que le nouveau syst\u00E8me
            par capitalisation (en vert) prend le relais. La ligne pointill\u00E9e
            montre le total des pensions vers\u00E9es.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis
                label={{ value: 'Md\u20AC/an', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(1) : v} Md\u20AC`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="legacyExp" stackId="pensions"
                fill="#fca5a5" stroke="#ef4444" name="Ancien syst\u00E8me (r\u00E9partition)" />
              <Area type="monotone" dataKey="capiPayout" stackId="pensions"
                fill="#86efac" stroke="#059669" name="Nouveau syst\u00E8me (capitalisation)" />
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
            L'\u00C9tat emprunte pour financer la transition. Cette dette est
            temporaire\u00A0: elle est rembours\u00E9e progressivement gr\u00E2ce
            aux revenus du fonds, aux ventes de logements sociaux et aux cotisations
            employeur.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis
                label={{ value: 'Md\u20AC', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(0) : v} Md\u20AC`} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area type="monotone" dataKey="debt"
                fill="#fecaca" stroke="#dc2626" strokeWidth={2}
                name="Dette de transition (Md\u20AC)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 3: Capitalisation pot */}
        <div className="sv-chart-block">
          <h3>L'\u00E9pargne retraite collective</h3>
          <p className="sv-chart-explain">
            Le pot d'\u00E9pargne retraite grandit au fil du temps gr\u00E2ce aux
            cotisations et aux rendements financiers. La ligne bleue montre la
            valeur en euros d'aujourd'hui (corrig\u00E9e de l'inflation)\u00A0\u2014\u00A0c'est
            la mesure la plus honn\u00EAte du pouvoir d'achat r\u00E9el.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis
                label={{ value: 'Tn\u20AC', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip formatter={(v) => `${typeof v === 'number' ? v.toFixed(2) : v} Tn\u20AC`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="capi"
                stroke="#86efac" strokeWidth={2}
                name="Valeur nominale (euros courants)" dot={false} />
              <Line type="monotone" dataKey="capiReal"
                stroke="#2563eb" strokeWidth={3}
                name="Valeur r\u00E9elle (euros 2026)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ---- MILESTONES TIMELINE ---- */}
      <section className="sv-section">
        <h2>Les \u00E9tapes cl\u00E9s de la transition</h2>
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
