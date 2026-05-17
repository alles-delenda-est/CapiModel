import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { runSimulation, buildCounterfactualParams } from '../simulation-engine.js'
import { extractKPIs, PRESETS } from '../presets.js'
import './IntroPage.css'

// French number formatter
const fmt = (n, decimals = 0) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)

// Read-only parameter display — mirrors the active preset's most important knobs.
// These are not editable here; the full simulator page exposes the live controls.
const PRESET_DISPLAY = [
  { key: 'cutoffAge', label: 'Âge cutoff cohorte',     unit: 'ans', dp: 0 },
  { key: 'r_c',       label: 'Rendement capi (réel)',   unit: '%',   mul: 100, dp: 1 },
  { key: 'w_r',       label: 'Croissance salariale',    unit: '%',   mul: 100, dp: 1 },
  { key: 'rho',       label: 'Liquidation HLM / an',    unit: '%',   mul: 100, dp: 1 },
  { key: 'employmentRateTarget', label: 'Cible plein-emploi', unit: '%', mul: 100, dp: 1 },
]

const PILLARS = [
  { num: 'I',   title: 'La Justice',
    body: "Acter la justice intergénérationnelle. Chaque génération assume sa propre retraite — fini de faire payer aux actifs des promesses non provisionnées." },
  { num: 'II',  title: 'La Sobriété',
    body: "Indexation prudente, courbe Équinoxe sur les pensions élevées, fin de l'abattement forfaitaire. Le système doit redevenir soutenable." },
  { num: 'III', title: 'Le Courage',
    body: "Libéraliser le marché du travail pour générer les cotisations dont nous avons besoin — sans casser le filet social, parmi les plus complets au monde." },
  { num: 'IV',  title: 'La Prudence',
    body: "Liquider progressivement le parc HLM pour financer les droits acquis, et remplacer les logements par des subventions ciblées aux ménages qui en ont besoin." },
]

export default function IntroPage({ navigateTo }) {
  // Run baseline scenario for the hero chart and KPI strip
  const baseline = useMemo(() => {
    const params = PRESETS.v1_default.params
    const results = runSimulation(params)
    const kpis = extractKPIs(results)
    // Counterfactual debt at horizon end — for context callout
    const cfRows = runSimulation(buildCounterfactualParams(params))
    kpis.counterfactualFinalDebt = cfRows[cfRows.length - 1].D_t
    // Final-year tag for the "Pot capi (fin)" KPI subtitle. Engine Y0 = 2027,
    // horizon = 70 yrs, so this is Y0 + N - 1.
    kpis.finalYear = results[results.length - 1].year
    return { params, results, kpis }
  }, [])

  const k = baseline.kpis
  const params = baseline.params

  // Chart data: reform debt trajectory only. Counterfactual is too large
  // to co-plot on a linear axis (470 000 Md€ vs. 1 700 Md€ peak); it lives
  // as a callout below the chart instead.
  const chartData = useMemo(() => {
    return baseline.results.map(r => ({ year: r.year, capi: r.D_t }))
  }, [baseline.results])

  // Build the read-only knob list from the active preset
  const knobs = useMemo(() => {
    return PRESET_DISPLAY.map(d => {
      const raw = params[d.key]
      if (raw === undefined || raw === null) return null
      const val = d.mul ? raw * d.mul : raw
      return { ...d, display: val.toFixed(d.dp) }
    }).filter(Boolean)
  }, [params])

  return (
    <div className="cabclair">

      {/* ====== Hero ====== */}
      <section className="cc-hero">
        <div className="cc-hero-text">
          <div className="cc-eyebrow">I · Le diagnostic</div>
          <h1 className="cc-h1">
            La France peut s'en sortir.
            <span className="cc-h1-accent"> Voici comment.</span>
          </h1>
          <p className="cc-lede">
            Un simulateur de la transition vers un système de retraite par
            capitalisation — chiffré, transparent, réversible. Les chiffres
            ci-dessous proviennent du scénario central&nbsp;; ouvrez le
            simulateur pour faire varier toutes les hypothèses.
          </p>
          <div className="cc-cta-row">
            <button className="cc-btn cc-btn-primary" onClick={() => navigateTo('simulateur')}>
              Ouvrir le simulateur →
            </button>
            <button className="cc-btn cc-btn-ghost" onClick={() => navigateTo('hypotheses')}>
              Lire les hypothèses
            </button>
          </div>
        </div>

        <aside className="cc-knobs" aria-label="Paramètres du scénario central">
          <div className="cc-eyebrow cc-knobs-title">Paramètres · scénario central</div>
          {knobs.map((knob, i) => (
            <div key={knob.key} className={`cc-knob ${i === knobs.length - 1 ? 'is-last' : ''}`}>
              <div className="cc-knob-row">
                <span className="cc-knob-label">{knob.label}</span>
                <span className="cc-knob-value">
                  {knob.display}<span className="cc-knob-unit"> {knob.unit}</span>
                </span>
              </div>
            </div>
          ))}
          <button className="cc-knobs-cta" onClick={() => navigateTo('simulateur')}>
            Faire varier ces paramètres →
          </button>
        </aside>
      </section>

      {/* ====== Chart panel ====== */}
      <section className="cc-chart-section">
        <div className="cc-chart-card">
          <div className="cc-chart-header">
            <div>
              <div className="cc-eyebrow">Projection · Dette de transition</div>
              <h2 className="cc-h2">Une bosse, puis une décrue</h2>
            </div>
            <div className="cc-chart-meta">
              Md€ · scénario central v2.1
            </div>
          </div>

          <div className="cc-chart-wrap">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 16, right: 56, bottom: 32, left: 8 }}>
                <CartesianGrid stroke="rgba(14,26,43,0.08)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="year"
                  axisLine={{ stroke: 'rgba(14,26,43,0.25)' }}
                  tickLine={false}
                  tick={{ fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace', fontSize: 10, fill: '#6b7a8f', letterSpacing: '0.05em' }}
                  ticks={[2030, 2045, 2060, 2075, 2090]}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tick={{ fontFamily: 'JetBrains Mono, IBM Plex Mono, monospace', fontSize: 10, fill: '#6b7a8f', letterSpacing: '0.05em' }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)} k Md€` : `${Math.round(v)} Md€`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fafaf7',
                    border: '1px solid rgba(14,26,43,0.1)',
                    borderRadius: 0,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    color: '#0e1a2b',
                    boxShadow: 'none',
                  }}
                  labelStyle={{ color: '#6b7a8f', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}
                  formatter={(v) => [`${fmt(v)} Md€`, 'Dette']}
                  labelFormatter={l => `Année ${l}`}
                />
                {k.peakDebtYear && (
                  <ReferenceLine x={k.peakDebtYear}
                    stroke="#b85c3c" strokeDasharray="3 3" strokeWidth={1}
                    label={{ value: `Pic ${k.peakDebtYear}`, position: 'top', fontSize: 10, fill: '#b85c3c', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}
                  />
                )}
                {k.debtFreeYear && (
                  <ReferenceLine x={k.debtFreeYear}
                    stroke="#c9a961" strokeDasharray="3 3" strokeWidth={1}
                    label={{ value: `Remb. ${k.debtFreeYear}`, position: 'top', fontSize: 10, fill: '#c9a961', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}
                  />
                )}
                <Line type="monotone" dataKey="capi"
                  name="Dette de transition"
                  stroke="#c9a961" strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#c9a961', stroke: '#0e1a2b', strokeWidth: 1 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="cc-chart-footnote">
            <span className="cc-chart-footnote-dot" aria-hidden />
            Sans réforme&nbsp;: dette publique projetée à <strong>≈ {fmt(Math.round(k.counterfactualFinalDebt / 1000) * 1000)} Md€</strong> en 2096
            (×{Math.round(k.counterfactualFinalDebt / Math.max(k.peakDebt, 1))} la trajectoire ci-dessus).
          </div>
        </div>
      </section>

      {/* ====== KPI strip ====== */}
      <section className="cc-kpi-section">
        <div className="cc-eyebrow cc-kpi-title">L'essentiel sur 70 ans</div>
        <div className="cc-kpi-grid">
          <div className="cc-kpi-cell">
            <div className="cc-kpi-label">Dette pic</div>
            <div className="cc-kpi-value-row">
              <span className="cc-kpi-value">{fmt(k.peakDebt, 0)}</span>
              <span className="cc-kpi-unit">Md€</span>
            </div>
            <div className="cc-kpi-sub">Atteinte en {k.peakDebtYear}</div>
          </div>
          <div className="cc-kpi-cell">
            <div className="cc-kpi-label">Intérêts cumulés</div>
            <div className="cc-kpi-value-row">
              <span className="cc-kpi-value">{fmt(k.totalInterest, 0)}</span>
              <span className="cc-kpi-unit">Md€</span>
            </div>
            <div className="cc-kpi-sub">Coût total de la transition</div>
          </div>
          <div className="cc-kpi-cell">
            <div className="cc-kpi-label">Pot capi (fin)</div>
            <div className="cc-kpi-value-row">
              <span className="cc-kpi-value">{fmt(k.finalCapiReal, 0)}</span>
              <span className="cc-kpi-unit">Md€</span>
            </div>
            <div className="cc-kpi-sub">€ constants 2027 · en {k.finalYear}</div>
          </div>
          <div className="cc-kpi-cell">
            <div className="cc-kpi-label">Spread minimum</div>
            <div className="cc-kpi-value-row">
              <span className={`cc-kpi-value ${k.minSpread > 0 ? 'is-ok' : 'is-bad'}`}>
                {fmt(k.minSpread * 100, 2)}
              </span>
              <span className="cc-kpi-unit">%</span>
            </div>
            <div className="cc-kpi-sub">{k.minSpread > 0 ? 'Toujours positif' : 'Passe en négatif — danger'}</div>
          </div>
        </div>
      </section>

      {/* ====== Approfondir ====== */}
      <section className="cc-deep-section">
        <div className="cc-eyebrow cc-deep-title">Approfondir</div>
        <div className="cc-deep-grid">
          <a className="cc-deep-card" href="#/simple" onClick={(e) => { e.preventDefault(); navigateTo('simple') }}>
            <div className="cc-deep-inner">
              <span className="cc-deep-num">01</span>
              <div>
                <div className="cc-deep-t">Et pour moi ?</div>
                <div className="cc-deep-sub">Version simple — l'impact en trois scénarios</div>
              </div>
            </div>
            <span className="cc-deep-arrow">→</span>
          </a>
          <a className="cc-deep-card" href="#/simulateur" onClick={(e) => { e.preventDefault(); navigateTo('simulateur') }}>
            <div className="cc-deep-inner">
              <span className="cc-deep-num">02</span>
              <div>
                <div className="cc-deep-t">Je veux le tester</div>
                <div className="cc-deep-sub">Simulateur complet — toutes les hypothèses</div>
              </div>
            </div>
            <span className="cc-deep-arrow">→</span>
          </a>
          <a className="cc-deep-card" href="#/hypotheses" onClick={(e) => { e.preventDefault(); navigateTo('hypotheses') }}>
            <div className="cc-deep-inner">
              <span className="cc-deep-num">03</span>
              <div>
                <div className="cc-deep-t">Analyser les hypothèses</div>
                <div className="cc-deep-sub">Méthodologie, sources, code ouvert</div>
              </div>
            </div>
            <span className="cc-deep-arrow">→</span>
          </a>
        </div>
      </section>

      {/* ====== Pillars ====== */}
      <section className="cc-pillars-section">
        <div className="cc-eyebrow cc-pillars-title">II · Quatre vertus cardinales</div>
        <div className="cc-pillars-grid">
          {PILLARS.map((p) => (
            <div key={p.num} className="cc-pillar">
              <div className="cc-pillar-num">{p.num}</div>
              <h3 className="cc-pillar-title">{p.title}</h3>
              <p className="cc-pillar-body">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ====== Risks ====== */}
      <section className="cc-risks-section">
        <div className="cc-eyebrow">III · Les risques majeurs</div>
        <h2 className="cc-h2 cc-risks-h2">Ce que le modèle suppose, et ce qui pourrait le faire dérailler</h2>
        <div className="cc-risks-grid">
          <div className="cc-risk">
            <h3>La dette</h3>
            <p>Le modèle « cantonne » la dette de transition dans une structure lisible. Il repose sur l'hypothèse, jusqu'ici vraie, que le rendement de la capitalisation dépasse le coût de cette dette.</p>
          </div>
          <div className="cc-risk">
            <h3>Le coût d'emprunt endogène</h3>
            <p>Plus l'État emprunte, plus les marchés exigent un taux élevé. Le modèle utilise un taux endogène à 3 paliers calibré sur l'expérience française, italienne et américaine.</p>
          </div>
          <div className="cc-risk">
            <h3>La liquidation HLM</h3>
            <p>5 % du parc HLM/an alimente le fonds legacy. Le modèle applique une décote conservatrice plafonnée à 30 % pour absorber l'effet volume.</p>
          </div>
          <div className="cc-risk">
            <h3>Le rendement capi</h3>
            <p>L'hypothèse de base à 4,5 % réel est dans la fourchette historique conservatrice d'un mandat diversifié 60/40. Les fonds souverains comparables (Norvège, Singapour) affichent au-delà de 6 %.</p>
          </div>
        </div>
      </section>

      <footer className="cc-footer">
        <span>Capi · Mai 2026</span>
        <span>Sources · OCDE, INSEE, COR · cdc_legacy_fund_model.md</span>
      </footer>
    </div>
  )
}
