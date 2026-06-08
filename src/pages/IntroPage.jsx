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
  const k = {
    pension2050:    series[midIdx].perRetireeRealMo,
    solde2050:      series[midIdx].soldeExclTransfersMdE,
    transfers2050:  series[midIdx].fiscalTransferMdE,
    debtFinal:      series[lastIdx].debtMdE,
    peakDebt,
    peakDebtYear:   series.find(s => s.debtMdE === peakDebt)?.year,
    peakTransfers:  Math.max(...series.map(s => s.fiscalTransferMdE)),
    collapse,
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
        dataKey="perRetireeRealMo"
        title="Pension moyenne par retraité (€/mois, réel 2027)"
        unit="€/mois"
        fmtFn={v => fmt(Math.round(v))}
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

  // "Le point de départ" — decompose the current system's flows straight from
  // the no-reform baseline (rung 0) engine output, so the headline deficit is
  // an arithmetic result the reader can trace, not an asserted number. Also
  // surfaces the 25-year (2050) trajectory — the horizon the model can speak
  // to with some confidence — rather than leading with 2096 aggregates.
  const cadrage = useMemo(() => {
    const base = runs[0]
    if (!base) return null
    const r0  = base.rows[0]
    const i50 = Math.min(23, base.rows.length - 1)   // t=23 → 2050
    const r50 = base.rows[i50]
    const cotisations    = (r0.C_s_t ?? 0) + (r0.C_e_t ?? 0)
    const depenses       = r0.totalLegacyOutflow_t ?? r0.legacyExp_t ?? 0
    const transferts     = r0.fiscalTransfer_t ?? 0
    const besoinPrimaire = cotisations - depenses
    const soldeResiduel  = r0.netFlow_t ?? (besoinPrimaire + transferts)
    // Cumulative budget-général subsidy 2027→2050: money actually diverted
    // from the general budget (which funds justice/education/health), as
    // opposed to the borrowed portion that becomes debt.
    let cumTransferts = 0
    for (let t = 0; t <= i50; t++) cumTransferts += base.rows[t].fiscalTransfer_t ?? 0
    return {
      cotisations, depenses, transferts, besoinPrimaire, soldeResiduel,
      cumTransferts,
      depenses2050: r50.totalLegacyOutflow_t ?? 0,
      solde2050:    r50.netFlow_t ?? 0,
      debt2050:     r50.D_t ?? 0,
      year2050:     r50.year,
    }
  }, [runs])

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
            <span className="cc-deficit-label">Sous perfusion aujourd'hui</span>
            <span className="cc-deficit-amount">
              ≈ {cadrage ? fmt(Math.abs(Math.round(cadrage.besoinPrimaire))) : 46} Md€/an
            </span>
            <span className="cc-deficit-note">
              Les cotisations ne couvrent pas les pensions versées : il manque
              chaque année ce montant, comblé par vos impôts (CSG dédiée, FSV,
              TVA sociale) et par l'emprunt — pas par les cotisations.{' '}
              <a className="cc-deficit-link" href="#cadrage">Voir les comptes ↓</a>
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

      {cadrage && (
        <section className="cc-cadrage" id="cadrage">
          <div className="cc-eyebrow">Le point de départ · les flux du système</div>
          <h2 className="cc-h2">D'abord, d'où vient le trou</h2>
          <p className="cc-cadrage-lede">
            Avant toute réforme, posons les comptes du système de retraite tel
            qu'il tourne aujourd'hui (2027, tous régimes confondus). Tout le
            reste en découle.
          </p>

          <div className="cc-cadrage-ledger">
            <div className="cc-cadrage-side">
              <span className="cc-cadrage-side-label">Recettes</span>
              <div className="cc-cadrage-line">
                <span className="cc-cadrage-line-lbl">
                  Cotisations <em>salariés + employeurs</em>
                </span>
                <span className="cc-cadrage-amt">{fmt(Math.round(cadrage.cotisations))} Md€</span>
              </div>
            </div>
            <div className="cc-cadrage-side">
              <span className="cc-cadrage-side-label">Dépenses</span>
              <div className="cc-cadrage-line">
                <span className="cc-cadrage-line-lbl">Pensions versées</span>
                <span className="cc-cadrage-amt">{fmt(Math.round(cadrage.depenses))} Md€</span>
              </div>
            </div>
          </div>

          <div className="cc-cadrage-flow">
            <div className="cc-cadrage-flow-row">
              <span className="cc-cadrage-flow-op">Besoin de financement</span>
              <span className="cc-cadrage-flow-calc">
                {fmt(Math.round(cadrage.cotisations))} − {fmt(Math.round(cadrage.depenses))}
              </span>
              <span className="cc-cadrage-flow-res is-bad">
                {fmtSigned(Math.round(cadrage.besoinPrimaire))} Md€/an
              </span>
            </div>
            <div className="cc-cadrage-flow-row">
              <span className="cc-cadrage-flow-op">
                Comblé par les transferts du budget général <em>CSG, FSV, TVA sociale</em>
              </span>
              <span className="cc-cadrage-flow-calc" />
              <span className="cc-cadrage-flow-res is-plug">
                {fmtSigned(Math.round(cadrage.transferts))} Md€/an
              </span>
            </div>
            <div className="cc-cadrage-flow-row is-total">
              <span className="cc-cadrage-flow-op">
                Déficit résiduel <em>financé par la dette</em>
              </span>
              <span className="cc-cadrage-flow-calc" />
              <span className="cc-cadrage-flow-res is-bad">
                {fmtSigned(Math.round(cadrage.soldeResiduel))} Md€/an
              </span>
            </div>
          </div>

          <p className="cc-cadrage-clarif">
            <strong>Ce que masque le chiffre de {fmt(Math.round(cadrage.transferts))} Md€.</strong>{' '}
            Le système n'affiche qu'un déficit résiduel de{' '}
            {fmt(Math.abs(Math.round(cadrage.soldeResiduel)))} Md€ — mais seulement
            parce que {fmt(Math.round(cadrage.transferts))} Md€ d'impôts sont
            injectés chaque année pour combler le trou. Ce ne sont pas les
            cotisations qui équilibrent le système, ce sont vos impôts : autant
            d'argent qui ne va ni à l'école, ni à l'hôpital, ni à la justice.
          </p>

          <div className="cc-cadrage-traj">
            <div className="cc-eyebrow">
              Sans réforme · la tendance à 25 ans ({cadrage.year2050})
            </div>
            <div className="cc-cadrage-traj-grid">
              <div className="cc-cadrage-traj-kpi">
                <span className="cc-cadrage-traj-val is-bad">
                  {fmt(Math.round(cadrage.depenses2050))} Md€
                </span>
                <span className="cc-cadrage-traj-lbl">
                  Dépenses retraites en {cadrage.year2050}
                  <em>contre {fmt(Math.round(cadrage.depenses))} Md€ aujourd'hui</em>
                </span>
              </div>
              <div className="cc-cadrage-traj-kpi">
                <span className="cc-cadrage-traj-val is-bad">
                  {fmtSigned(Math.round(cadrage.solde2050))} Md€/an
                </span>
                <span className="cc-cadrage-traj-lbl">
                  Besoin de financement annuel
                  <em>le trou se creuse avec la démographie</em>
                </span>
              </div>
              <div className="cc-cadrage-traj-kpi">
                <span className="cc-cadrage-traj-val is-bad">
                  ≈ {fmt(Math.round(cadrage.debt2050))} Md€
                </span>
                <span className="cc-cadrage-traj-lbl">
                  Dette de transition accumulée
                  <em>uniquement pour payer les retraites</em>
                </span>
              </div>
            </div>
            <p className="cc-cadrage-traj-diverted">
              <strong>≈ {fmt(Math.round(cadrage.cumTransferts))} Md€</strong> de déficit
              financé par le budget général sur ces 25 ans — autant de moyens
              soustraits à la justice, à l'éducation et à la santé.
            </p>
            <p className="cc-cadrage-traj-note">
              Hypothèses macro centrales : inflation 2 %/an, démographie COR,
              salaires réels +0,4 %/an. Au-delà de {cadrage.year2050}, l'horizon
              devient trop incertain pour des chiffres précis — c'est pourquoi on
              cadre d'abord le court-moyen terme.
            </p>
          </div>
        </section>
      )}

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
