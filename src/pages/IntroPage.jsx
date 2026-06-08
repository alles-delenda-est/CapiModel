import { useState, useMemo, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { runSimulation, DEFAULT_CONFIG } from '../simulation-engine.js'
import { LADDER_RUNGS, FOOTNOTES, applyGreekCollapseOverlay } from './IntroLadderRungs.js'
import './IntroPage.css'

// French number formatter
const fmt = (n, d = 0) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n)
const fmtSigned = (n, d = 0) => (n > 0 ? '+' : '') + fmt(n, d)

// Footnote tooltip component — shown on hover, stays open while hovered.
function Footnote({ id }) {
  const [open, setOpen] = useState(false)
  const fn = FOOTNOTES[id]
  if (!fn) return null
  return (
    <span
      className="fn-ref"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <sup className="fn-sup">{fn.num}</sup>
      {open && (
        <span className="fn-tooltip" role="tooltip">
          {fn.text}
          {fn.url && (
            <a
              className="fn-tooltip-link"
              href={fn.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              Wikipedia →
            </a>
          )}
        </span>
      )}
    </span>
  )
}

// Renders a rung summary — either a plain string or a mixed array
// containing strings and { fn: 'fn_1' } footnote markers.
function RungSummary({ summary, className }) {
  if (typeof summary === 'string') {
    return <p className={className}>{summary}</p>
  }
  return (
    <p className={className}>
      {summary.map((part, i) =>
        typeof part === 'string'
          ? <span key={i}>{part}</span>
          : <Footnote key={i} id={part.fn} />
      )}
    </p>
  )
}

// Mirror of UI_CONFIG from src/presets.js — we don't import it directly
// because the engine DEFAULT_CONFIG is already complete; UI_CONFIG only
// overrides cashFlowMode and GE knee/floor to keep the ladder's
// counterfactual + capi modes co-calibrated with the rest of the UI.
const UI_BASE = {
  ...DEFAULT_CONFIG,
  cashFlowMode: 'balanced',
  geKneeRatio: 3.0,
  geFloorRatio: 8.0,
}

// ------------------------------------------------------------------
// runRung — runs the engine for one rung and derives the chart series
// + headline KPIs. Applies the optional "Grèce-style" pedagogical
// collapse overlay if rung.greekCollapse is set.
// ------------------------------------------------------------------
function runRung(rung) {
  const params = { ...UI_BASE, ...rung.paramOverrides }
  const rows = runSimulation(params)

  let series = rows.map(r => {
    const totalRetireesM = r.retireeIdx * params.R0
    const totalPensionMdE =
      (r.legacyExp_t ?? 0)
      + (r.transitionalPaygExp_t ?? 0)
      + (r.ndcPaygPension_t ?? 0)
      + (r.capiPayout_t ?? 0)
    const perRetireeRealMo = totalRetireesM > 1e-6
      ? (totalPensionMdE / totalRetireesM) / r.I_factor_t * 1000 / 12
      : 0
    const soldeExclTransfersMdE = (r.netFlow_t ?? 0) - (r.fiscalTransfer_t ?? 0)
    return {
      year: r.year,
      perRetireeRealMo,
      soldeExclTransfersMdE,
      debtMdE: r.D_t,
      debtTotalMdE: (r.D_t ?? 0) + (r.D_ext_t ?? 0),
      gdpMdE: r.GDP_t,
      debtRatioPct: r.debtRatio_t,
      rDeffective: r.r_d_t,
      fiscalTransferMdE: r.fiscalTransfer_t ?? 0,
      borrowedMdE: r.borrowed_t ?? 0,
      depensesMdE: (r.totalLegacyOutflow_t ?? r.legacyExp_t ?? 0),
    }
  })

  // Pedagogical overlay (see IntroLadderRungs.js → applyGreekCollapseOverlay).
  // Only étape 1 is at risk of crossing the GE/collapse thresholds in practice;
  // the other rungs carry greekCollapse:true defensively but their debt
  // trajectories stay well below 150 % GDP under their reform params.
  let collapse = null
  if (rung.greekCollapse) {
    const result = applyGreekCollapseOverlay(series, {
      debt: 'debtMdE',
      debtRatio: 'debtRatioPct',
      rDeff: 'rDeffective',
      pension: 'perRetireeRealMo',
      solde: 'soldeExclTransfersMdE',
    })
    // Also propagate the debt mutation into debtTotalMdE (= D_t + D_ext_t).
    // The overlay only knows about the main debt field; we keep D_ext_t intact
    // and just scale the total proportionally for chart consistency.
    if (result) {
      collapse = {
        year: result.collapseYear,
        idx: result.collapseIdx,
        debtRatioPct: result.debtRatioAtCollapse,
      }
    }
  }

  // Year-2050 snapshot (t=23) for the headline KPI strip
  const midIdx  = Math.min(23, series.length - 1)
  const lastIdx = series.length - 1
  const peakDebt = Math.max(...series.map(s => s.debtMdE))
  const r50 = rows[midIdx]
  const k = {
    pension2050:    series[midIdx].perRetireeRealMo,
    solde2050:      series[midIdx].soldeExclTransfersMdE,
    transfers2050:  series[midIdx].fiscalTransferMdE,
    debtFinal:      series[lastIdx].debtMdE,
    peakDebt,
    peakDebtYear:   series.find(s => s.debtMdE === peakDebt)?.year,
    peakTransfers:  Math.max(...series.map(s => s.fiscalTransferMdE)),
    collapse,
    // Raw 2050 flow metrics for per-reform impact comparison
    depenses_2050:  r50.totalLegacyOutflow_t ?? r50.legacyExp_t ?? 0,
    netFlow_2050:   r50.netFlow_t ?? 0,
    debt_2050:      r50.D_t ?? 0,
  }
  return { rung, params, rows, series, k }
}

// ------------------------------------------------------------------
// MultiPanel — one stacked chart panel, with all rungs as ghost lines
// up to `activeIdx`; the active rung is emphasised.
// ------------------------------------------------------------------
function MultiPanel({ runs, activeIdx, dataKey, title, unit, fmtFn, height = 130, refLine }) {
  const merged = useMemo(() => {
    if (!runs[0]) return []
    return runs[0].series.map((r, i) => {
      const out = { year: r.year }
      runs.forEach((run, j) => { out['rung' + j] = run.series[i][dataKey] })
      return out
    })
  }, [runs, dataKey])

  return (
    <div className="cc-chart-block">
      <div className="cc-chart-block-h">
        <span className="cc-chart-block-title">{title}</span>
        <span className="cc-chart-block-unit">{unit}</span>
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={merged} margin={{ top: 6, right: 12, bottom: 16, left: 38 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year"
              axisLine={{ stroke: 'rgba(5,193,173,0.25)' }} tickLine={false}
              tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: '#7a8898', letterSpacing: '0.04em' }}
              ticks={[2030, 2050, 2070, 2090]}
            />
            <YAxis axisLine={false} tickLine={false} width={44}
              tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: '#7a8898', letterSpacing: '0.04em' }}
              tickFormatter={fmtFn}
            />
            {refLine !== undefined && (
              <ReferenceLine y={refLine} stroke="#e8edf5" strokeOpacity={0.25} strokeDasharray="2 3" />
            )}
            <Tooltip
              contentStyle={{ background: '#12182a', border: '1px solid rgba(5,193,173,0.2)', borderRadius: 0, fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#f2f5fb', boxShadow: 'none', padding: '8px 10px' }}
              labelStyle={{ color: '#c8d2e2', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}
              formatter={(v, name, payload) => {
                const idx = parseInt(payload.dataKey.replace('rung', ''), 10)
                return [fmtFn ? fmtFn(v) : fmt(v, 0), runs[idx].rung.short]
              }}
              labelFormatter={l => 'Année ' + l}
            />
            {runs.map((run, j) => {
              if (j > activeIdx) return null
              const isActive = j === activeIdx
              return (
                <Line key={j} type="monotone" dataKey={'rung' + j}
                  stroke={run.rung.color}
                  strokeWidth={isActive ? 2.5 : 1.2}
                  strokeOpacity={isActive ? 1 : 0.35}
                  dot={false}
                  activeDot={isActive ? { r: 4, fill: run.rung.color, stroke: '#f2f5fb', strokeWidth: 1 } : false}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Three-panel chart group, shared between Stepper and Scrolly modes
function ChartGroup({ runs, activeIdx }) {
  return (
    <>
      <MultiPanel runs={runs} activeIdx={activeIdx}
        dataKey="depensesMdE"
        title="Dépenses retraites totales"
        unit="Md€/an"
        fmtFn={v => Math.abs(v) >= 1000 ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") : Math.round(v).toString()}
        height={130}
      />
      <MultiPanel runs={runs} activeIdx={activeIdx}
        dataKey="soldeExclTransfersMdE"
        title="Solde du système (hors transferts du budget général)"
        unit="Md€/an"
        fmtFn={v => (v >= 0 ? '+' : '') + Math.round(v)}
        height={130}
        refLine={0}
      />
      <MultiPanel runs={runs} activeIdx={activeIdx}
        dataKey="debtMdE"
        title="Dette publique cumulée (régime retraites)"
        unit="Md€"
        fmtFn={v => Math.abs(v) >= 1000 ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") : Math.round(v).toString()}
        height={130}
      />
    </>
  )
}

// ------------------------------------------------------------------
// ImpactDelta — per-reform "ce que ça change en 2050" comparison panel.
// Shows dépenses, transferts, solde net, and dette at the 25-year horizon,
// before and after, with signed delta, coloured by direction.
// Skipped for the no-reform baseline (rung 0) since it IS the reference.
// ------------------------------------------------------------------
function ImpactDelta({ baseline, active }) {
  const bk = baseline.k
  const k  = active.k
  if (active.rung.id === baseline.rung.id) return null

  const isTransitionRung = k.debt_2050 > bk.debt_2050 + 50

  const metrics = [
    {
      id: 'dep',
      label: 'Dépenses retraites',
      base: bk.depenses_2050,
      val:  k.depenses_2050,
      unit: 'Md€/an',
      lowerBetter: true,
      note: v => v < bk.depenses_2050 - 1
        ? 'moins de pensions à financer collectivement'
        : 'dépenses inchangées',
    },
    {
      id: 'tr',
      label: 'Subvention du budget général',
      base: bk.transfers2050,
      val:  k.transfers2050,
      unit: 'Md€/an',
      lowerBetter: true,
      note: v => v < 1 ? 'système autonome, zéro perfusion fiscale' : 'transferts réduits',
    },
    {
      id: 'sol',
      label: 'Solde annuel (besoin de financement)',
      base: bk.netFlow_2050,
      val:  k.netFlow_2050,
      unit: 'Md€/an',
      lowerBetter: false,
      note: v => v > -5 ? "système à l'équilibre" : v > bk.netFlow_2050 + 1 ? 'déficit réduit' : 'transition : charge temporaire',
    },
    {
      id: 'det',
      label: 'Dette de transition accumulée',
      base: bk.debt_2050,
      val:  k.debt_2050,
      unit: 'Md€',
      lowerBetter: true,
      note: () => isTransitionRung
        ? 'dette explicite, remboursée par les rendements du fonds'
        : 'dette évitée vs. trajectoire actuelle',
    },
  ]

  return (
    <div className="cc-impact">
      <div className="cc-impact-eyebrow">Ce que ça change · en 2050 vs. trajectoire actuelle</div>
      <div className="cc-impact-grid">
        {metrics.map(m => {
          const delta  = m.val - m.base
          const isGood = m.lowerBetter ? delta < -0.5 : delta > 0.5
          const isNeutral = Math.abs(delta) <= 0.5
          const cls = isNeutral ? '' : (isGood ? 'is-good' : 'is-bad')
          return (
            <div key={m.id} className="cc-impact-card">
              <div className="cc-impact-lbl">{m.label}</div>
              <div className="cc-impact-row">
                <span className="cc-impact-base">{fmt(Math.round(m.base))}</span>
                <span className="cc-impact-arrow">→</span>
                <span className={'cc-impact-val ' + cls}>{fmt(Math.round(m.val))}</span>
                <span className="cc-impact-unit">{m.unit}</span>
              </div>
              <div className={'cc-impact-delta ' + cls}>
                {isNeutral ? '—' : fmtSigned(Math.round(delta)) + ' Md€'}
                {!isNeutral && <span className="cc-impact-note"> · {m.note(m.val)}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {isTransitionRung && (
        <p className="cc-impact-transition-note">
          La dette de transition est le coût visible et explicite de la bascule vers la
          capitalisation. Elle se résorbe à mesure que le fonds mûrit — voir la trajectoire
          complète dans le Simulateur.
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// LadderStepper — interactive 5-button rail at the top, one panel
// with the active rung's commentary + KPI strip + chart group.
// ------------------------------------------------------------------
function LadderStepper({ runs, activeIdx, setActiveIdx }) {
  const active = runs[activeIdx]
  const k = active.k

  return (
    <section className="cc-ladder cc-ladder--stepper">
      <div className="cc-ladder-rail">
        {runs.map((run, j) => (
          <button
            key={run.rung.id}
            className={'cc-rung-btn ' + (j === activeIdx ? 'is-active' : '')}
            onClick={() => setActiveIdx(j)}
            style={{
              borderBottom: j === activeIdx ? `3px solid ${run.rung.color}` : '3px solid transparent',
            }}
          >
            <span className="cc-rung-btn-num">{String(run.rung.num).padStart(2, '0')}</span>
            <span className="cc-rung-btn-label">{run.rung.label}</span>
          </button>
        ))}
      </div>

      <div className="cc-ladder-stage">
        <div className="cc-stage-side">
          <div className="cc-eyebrow" style={{ color: active.rung.color }}>
            Étape {active.rung.num} sur 6
          </div>
          <h2>{active.rung.headline}</h2>
          <RungSummary summary={active.rung.summary} className="cc-stage-summary" />

          <div className="cc-stage-kpis">
            <div className="cc-stage-kpi">
              <div className="cc-stage-kpi-label">Transferts du budget général en 2050</div>
              <div>
                <span className="cc-stage-kpi-value">{fmt(Math.round(k.transfers2050))}</span>
                <span className="cc-stage-kpi-unit">Md€/an</span>
              </div>
              <div className="cc-stage-kpi-sub">
                {k.transfers2050 > 1
                  ? 'Le budget général comble encore le déficit'
                  : (k.peakDebt > 500
                      ? 'Le déficit bascule vers la dette plutôt que le budget général'
                      : 'Le système est autonome')}
              </div>
            </div>
            <div className="cc-stage-kpi">
              <div className="cc-stage-kpi-label">Solde hors transferts en 2050</div>
              <div>
                <span className="cc-stage-kpi-value">{fmtSigned(Math.round(k.solde2050))}</span>
                <span className="cc-stage-kpi-unit">Md€/an</span>
              </div>
              <div className="cc-stage-kpi-sub">
                Recettes propres − dépenses (hors dotations du budget général)
              </div>
            </div>
            <div className="cc-stage-kpi">
              <div className="cc-stage-kpi-label">
                {k.peakDebt > 2 * Math.max(k.debtFinal, 1) ? "Dette au pic" : "Dette en fin d'horizon"}
              </div>
              <div>
                <span className="cc-stage-kpi-value">
                  {fmt(Math.round(k.peakDebt > 2 * Math.max(k.debtFinal, 1) ? k.peakDebt : k.debtFinal))}
                </span>
                <span className="cc-stage-kpi-unit">Md€</span>
              </div>
              <div className="cc-stage-kpi-sub">
                {k.collapse
                  ? `Restructuration forcée en ${k.collapse.year} (dette à ${Math.round(k.collapse.debtRatioPct)} % du PIB)`
                  : (k.peakDebt > 100
                      ? `Pic ${fmt(Math.round(k.peakDebt))} Md€ en ${k.peakDebtYear} · fin ${fmt(Math.round(k.debtFinal))} Md€`
                      : 'Dette de transition négligeable')}
              </div>
            </div>
          </div>
          <ImpactDelta baseline={runs[0]} active={active} />
        </div>

        <div className="cc-stage-charts">
          <ChartGroup runs={runs} activeIdx={activeIdx} />
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------
// LadderScrolly — 5 stacked text steps + sticky chart group.
// IntersectionObserver drives activeIdx as the user scrolls.
// ------------------------------------------------------------------
function LadderScrolly({ runs, activeIdx, setActiveIdx }) {
  const stepRefs = useRef([])

  useEffect(() => {
    const observers = []
    stepRefs.current.forEach((el, idx) => {
      if (!el) return
      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
              setActiveIdx(idx)
            }
          })
        },
        { threshold: [0.3, 0.5, 0.7], rootMargin: '-20% 0% -40% 0%' },
      )
      observer.observe(el)
      observers.push(observer)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [setActiveIdx])

  return (
    <section className="cc-ladder cc-ladder--scrolly">
      <div className="cc-scrolly-text">
        {runs.map((run, j) => (
          <div
            key={run.rung.id}
            ref={el => (stepRefs.current[j] = el)}
            className={'cc-scrolly-step ' + (j === activeIdx ? 'is-active' : '')}
            style={{ borderLeftColor: j === activeIdx ? run.rung.color : undefined }}
          >
            <div className="cc-scrolly-step-num" style={{ color: j === activeIdx ? run.rung.color : undefined }}>
              {String(run.rung.num).padStart(2, '0')} · {run.rung.label}
            </div>
            <h2>{run.rung.headline}</h2>
            <RungSummary summary={run.rung.summary} />

            <div className="cc-scrolly-step-kpis">
              <div>
                <div className="cc-scrolly-step-kpi-label">Transferts du budget général / 2050</div>
                <div>
                  <span className="cc-scrolly-step-kpi-value">{fmt(Math.round(run.k.transfers2050))}</span>
                  <span className="cc-scrolly-step-kpi-unit">Md€</span>
                </div>
              </div>
              <div>
                <div className="cc-scrolly-step-kpi-label">Solde hors transferts / 2050</div>
                <div>
                  <span className="cc-scrolly-step-kpi-value">{fmtSigned(Math.round(run.k.solde2050))}</span>
                  <span className="cc-scrolly-step-kpi-unit">Md€</span>
                </div>
              </div>
              <div>
                <div className="cc-scrolly-step-kpi-label">
                  {run.k.collapse ? 'Dette au choc' : (run.k.peakDebt > 2 * Math.max(run.k.debtFinal, 1) ? 'Dette au pic' : 'Dette finale')}
                </div>
                <div>
                  <span className="cc-scrolly-step-kpi-value">
                    {fmt(Math.round(run.k.peakDebt > 2 * Math.max(run.k.debtFinal, 1) ? run.k.peakDebt : run.k.debtFinal))}
                  </span>
                  <span className="cc-scrolly-step-kpi-unit">Md€</span>
                </div>
              </div>
            </div>
            <ImpactDelta baseline={runs[0]} active={run} />
          </div>
        ))}
      </div>

      <div className="cc-scrolly-sticky">
        <ChartGroup runs={runs} activeIdx={activeIdx} />
      </div>
    </section>
  )
}

const PILLARS = [
  { num: 'I',   title: 'La Justice',
    body: "Acter la justice intergénérationnelle. Chaque génération assume sa propre retraite — fini de faire payer aux actifs des promesses non provisionnées." },
  { num: 'II',  title: 'La Sobriété',
    body: "Indexation prudente, courbe Équinoxe sur les retraites élevées, fin de l'abattement forfaitaire. Le système doit redevenir soutenable." },
  { num: 'III', title: 'Le Courage',
    body: "Libéraliser le marché du travail pour générer les cotisations dont nous avons besoin — sans casser le filet social, parmi les plus complets au monde." },
  { num: 'IV',  title: 'La Prudence',
    body: "Liquider progressivement le parc HLM pour financer les droits acquis, et remplacer les logements par des subventions ciblées aux ménages qui en ont besoin." },
]

const RISKS = [
  { t: 'La dette',
    b: "Le modèle « cantonne » la dette de transition dans une structure lisible. Il repose sur l'hypothèse, jusqu'ici vraie, que le rendement de la capitalisation dépasse le coût de cette dette." },
  { t: "Le coût d'emprunt endogène",
    b: "Plus l'État emprunte, plus les marchés exigent un taux élevé. Le modèle utilise un taux endogène à 3 paliers calibré sur l'expérience française, italienne et américaine." },
  { t: 'La liquidation HLM',
    b: "5 % du parc HLM/an alimente le fonds de transition (la structure qui porte les droits acquis pendant la bascule). Le modèle applique une décote conservatrice plafonnée à 30 % pour absorber l'effet volume." },
  { t: 'Le rendement capi',
    b: "L'hypothèse de base à 3 % réel est dans la fourchette historique conservatrice. Les fonds souverains comparables (Norvège, Singapour) affichent au-delà de 6 %." },
  { t: 'Le changement de régime ~2069',
    b: "Les graphiques montrent une inflexion vers 2069 : c'est la fin de la période de transition. Le dernier cotisant avec des droits PAYG partiels (né en 2005, entré dans le marché du travail en 2027) part à la retraite à 64 ans. Après cette date, tous les nouveaux retraités sont en capitalisation pure." },
]

// ------------------------------------------------------------------
// IntroPage — top-level page component. Hero + mode switch + ladder
// + pillars + risks + footer.
// ------------------------------------------------------------------
export default function IntroPage({ navigateTo }) {
  const runs = useMemo(() => LADDER_RUNGS.map(runRung), [])
  const [mode, setMode] = useState('scrolly') // 'stepper' | 'scrolly'
  const [activeIdx, setActiveIdx] = useState(0)

  // Allow ?mode=stepper|scrolly in the hash to pre-select a view
  // (lets external embedders pin one mode per iframe).
  useEffect(() => {
    const m = new URLSearchParams(window.location.hash.slice(1)).get('mode')
    if (m === 'stepper' || m === 'scrolly') setMode(m)
  }, [])

  return (
    <div className="cabclair">
      <section className="cc-hero">
        <div>
          <div className="cc-eyebrow">Le diagnostic · en cinq étapes</div>
          <h1 className="cc-h1">
            La France peut s'en sortir.
            <span className="cc-h1-accent"> Voici l'échelle.</span>
          </h1>
          <p className="cc-lede">
            Cinq scénarios pour comprendre comment sortir le système de retraite
            de sa dépendance au budget général. À chaque étape, on ajoute un
            levier — et on voit ce qu'il coûte, ce qu'il rapporte, et où la
            dette atterrit.
          </p>
          <div className="cc-deficit-callout">
            <span className="cc-deficit-label">Le déficit aujourd'hui</span>
            <span className="cc-deficit-amount">≈ 40 Md€/an</span>
            <span className="cc-deficit-note">
              Le système de retraite reçoit chaque année une subvention directe du
              budget de l'État (CSG dédiée, FSV, TVA sociale). Ce sont vos impôts
              qui comblent le trou — pas seulement les cotisations.
            </span>
          </div>
          <div className="cc-mode-switch">
            <button
              className={mode === 'stepper' ? 'is-active' : ''}
              onClick={() => setMode('stepper')}
            >Lecture pas-à-pas</button>
            <button
              className={mode === 'scrolly' ? 'is-active' : ''}
              onClick={() => setMode('scrolly')}
            >Lecture en scroll</button>
          </div>
        </div>

        <aside className="cc-hero-aside">
          <div className="cc-eyebrow">Les cinq étapes</div>
          <ol>
            {LADDER_RUNGS.map(r => (
              <li key={r.id}><strong>{r.label}</strong> — {r.short === 'Sans réforme' ? 'le système par répartition actuel, sous perfusion'
                : r.short === 'Équinoxe' ? 'rééquilibrer côté prestations'
                : r.short === 'Suède' ? 'compte notionnel + équilibrage automatique + petit pilier capi'
                : r.short === 'Chili' ? 'capitalisation totale, dette de transition explicite'
                : 'capitalisation totale, transition financée sans dette'}</li>
            ))}
          </ol>
        </aside>
      </section>

      {mode === 'stepper'
        ? <LadderStepper runs={runs} activeIdx={activeIdx} setActiveIdx={setActiveIdx} />
        : <LadderScrolly runs={runs} activeIdx={activeIdx} setActiveIdx={setActiveIdx} />
      }

      <section className="cc-pillars-section">
        <div className="cc-eyebrow">Quatre vertus cardinales</div>
        <h2 className="cc-h2">Ce qui guide la réforme</h2>
        <div className="cc-pillars-grid">
          {PILLARS.map(p => (
            <div key={p.num} className="cc-pillar">
              <div className="cc-pillar-num">{p.num}</div>
              <h3 className="cc-pillar-title">{p.title}</h3>
              <p className="cc-pillar-body">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cc-risks-section">
        <div className="cc-eyebrow">Les risques majeurs</div>
        <h2 className="cc-h2">Ce que le modèle suppose, et ce qui pourrait le faire dérailler</h2>
        <div className="cc-risks-grid">
          {RISKS.map((r, i) => (
            <div key={i} className="cc-risk">
              <h3>{r.t}</h3>
              <p>{r.b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="cc-footer">
        <span>Capi · Mai 2026</span>
        <span>Sources · OCDE, INSEE, COR · v1.2 engine</span>
      </footer>
    </div>
  )
}
