import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, ComposedChart, BarChart, Bar,
  ScatterChart, Scatter, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import {
  runSimulation, DEFAULT_CONFIG, buildCounterfactualParams,
  computeIndividualPerspective,
} from '../simulation-engine.js'
import { extractKPIs } from '../presets.js'
import {
  LADDER_RUNGS, applyGreekCollapseOverlay,
  GREEK_GE_THRESHOLD_PCT_GDP, GREEK_GE_ACCEL_PER_YEAR,
  GREEK_COLLAPSE_TRIGGER_PCT, GREEK_R_D_RESTRUCTURE_TRIGGER,
} from './IntroLadderRungs.js'
import useSimulatorHashState from '../hooks/useSimulatorHashState.js'
import './SimulatorPage.css'

// French number formatter
const fmt = (n, d = 0) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n)
const fmtSigned = (n, d = 0) => (n > 0 ? '+' : '') + fmt(n, d)

// Axis tick formatter: uses apostrophe thousands separator instead of "k"
// e.g. 1500 → "1'500", 500 → "500"
const fmtAxis = v => Math.abs(v) >= 1000
  ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  : Math.round(v)

// Inline citation with hover tooltip
function Cite({ children, tooltip }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="sim-cite"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      {children}
      {open && <span className="sim-cite-tooltip" role="tooltip">{tooltip}</span>}
    </span>
  )
}

// Mirror of UI_CONFIG from src/presets.js
const UI_BASE = {
  ...DEFAULT_CONFIG,
  cashFlowMode: 'balanced',
  geKneeRatio: 3.0,
  geFloorRatio: 8.0,
}

// === Conditions slider — maps optimist/neutral/stress onto macro knobs ===
// Calibrated from src/presets.js (v1_optimiste / v1_stress).
const CONDITIONS = {
  optimist: {
    label: 'Optimiste',
    desc: 'Marchés porteurs, démographie réformée',
    overrides: { r_c: 0.05, r_f_portfolio: 0.05, w_r: 0.008, demoProfile: 'reformed' },
  },
  neutral: {
    label: 'Neutre',
    desc: 'Hypothèses centrales du modèle',
    overrides: {},
  },
  stress: {
    label: 'Stress test',
    desc: 'Marchés baissiers, démographie pessimiste',
    overrides: { r_c: 0.025, r_f_portfolio: 0.025, w_r: 0.001, r_d_base: 0.045, extraSpread: 0.005, demoProfile: 'realistic' },
  },
}

function buildParams(rungIdx, conditionsKey, tweaks) {
  const rung = LADDER_RUNGS[rungIdx]
  return {
    ...UI_BASE,
    ...rung.paramOverrides,
    ...CONDITIONS[conditionsKey].overrides,
    ...tweaks,
  }
}

// ============================ Chart styles ============================
const axisTickStyle = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  fill: '#c8d2e2',
  letterSpacing: '0.04em',
}
const tooltipProps = {
  contentStyle: {
    background: '#12182a',
    border: '1px solid rgba(5,193,173,0.2)',
    borderRadius: 0,
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    color: '#f2f5fb',
    boxShadow: 'none',
    padding: '8px 10px',
  },
  labelStyle: {
    color: '#c8d2e2',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
}

// ============================ Charts tab ============================
function ChartsTab({ rows, params, rung }) {
  const { chartData, collapse } = useMemo(() => {
    const data = rows.map(r => {
      const totalRet = Math.max(1e-6, r.retireeIdx * params.R0)
      const totalPensionMdE = (r.legacyExp_t ?? 0) + (r.transitionalPaygExp_t ?? 0)
        + (r.ndcPaygPension_t ?? 0) + (r.capiPayout_t ?? 0)
      const perRetReal = (totalPensionMdE / totalRet) / r.I_factor_t * 1000 / 12
      return {
        year: r.year,
        debt: r.D_t,
        debtRatio: r.debtRatio_t,
        rDeff: r.r_d_t,
        legacyExp: r.legacyExp_t,
        transPayg: r.transitionalPaygExp_t ?? 0,
        ndcPayg: r.ndcPaygPension_t ?? 0,
        capiPayout: r.capiPayout_t,
        soldeExclBG: (r.netFlow_t ?? 0) - (r.fiscalTransfer_t ?? 0),
        fiscalTransfer: r.fiscalTransfer_t ?? 0,
        perRetReal,
        capiPot: r.K_t,
      }
    })
    // Greek-collapse pedagogical overlay — mirrors IntroPage rung 1. Per the
    // PR #34 review (point F), only the no-reform scenario (rung 'actuel')
    // gets the overlay; reform rungs show pure engine output.
    const c = rung?.greekCollapse
      ? applyGreekCollapseOverlay(data, {
          debt: 'debt', debtRatio: 'debtRatio', rDeff: 'rDeff',
          pension: 'perRetReal', solde: 'soldeExclBG',
        })
      : null
    return { chartData: data, collapse: c }
  }, [rows, params, rung])

  // Average fiscal transfer over the horizon (rounded). Used by the per-rung
  // caption below the solde chart.
  const avgFiscalTransfer = useMemo(() => {
    if (chartData.length === 0) return 0
    const sum = chartData.reduce((s, r) => s + (r.fiscalTransfer ?? 0), 0)
    return Math.round(sum / chartData.length)
  }, [chartData])
  const transferMode = params?.fiscalTransferMode ?? 'none'

  return (
    <div className="sim-charts-grid">
      {rung?.greekCollapse && (
        <div className="sim-callout sim-callout-warn is-wide">
          <strong>Scénario sans réforme — présentation pédagogique :</strong>{' '}
          au-delà de 150 % du PIB, et dans l'absence de réforme crédible engagée,
          les taux d'intérêt grimpent de 4 %/an. À 300 % du PIB, un événement de{' '}
          <em>restructuration forcée</em> plafonne la dette et déclenche une coupe nominale
          de 50 % des retraites, étalée sur 3 ans.{' '}
          <strong>Aucun pays n'a soutenu une dette supérieure à 300 % du PIB sans
          restructuration</strong>
          <Cite tooltip="Reinhart, Carmen M. & Rogoff, Kenneth S. — This Time Is Different: Eight Centuries of Financial Folly (2009). Étude empirique de 800 ans de crises de dette souveraine dans 66 pays. Conclusion centrale : les pays qui laissent leur dette dépasser 90 % du PIB connaissent systématiquement une compression de croissance ; aucun n'a évité une restructuration ou un défaut au-delà de 300 %.">
            <sup className="fn-sup">1</sup>
          </Cite>.{' '}
          Cela est, évidemment, sans tenir compte de toutes les autres parties de la société
          sacrifiées pour financer les retraites que nous ne pouvons plus nous permettre :
          des profs encore plus sous-payés et encore plus en sous-effectif, la justice encore
          plus lente faute de moyens, les routes encore moins bien entretenues, et encore.
          {collapse && (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              Restructuration déclenchée, au plus tard, en {collapse.collapseYear}
              {' '}(vraisemblablement bien avant) — dette à {Math.round(collapse.debtRatioAtCollapse)} % du PIB.
            </div>
          )}
        </div>
      )}

      <div className="sim-chart-card is-wide">
        <div className="sim-chart-h">
          <h3>Dette publique cumulée</h3>
          <span className="sim-chart-h-unit">Md€ · nominal, €courants</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={60} tick={axisTickStyle}
              tickFormatter={fmtAxis} />
            <Tooltip {...tooltipProps}
              formatter={v => [fmt(v) + ' Md€', 'Dette']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="debt" stroke="#e9c53d" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="Dette" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="sim-chart-card">
        <div className="sim-chart-h">
          <h3>Solde du système</h3>
          <span className="sim-chart-h-unit">Md€/an · hors transferts du budget général</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2050, 2070, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={axisTickStyle}
              tickFormatter={v => (v >= 0 ? '+' : '') + Math.round(v)} />
            <ReferenceLine y={0} stroke="#e8edf5" strokeOpacity={0.25} strokeDasharray="2 3" />
            <Tooltip {...tooltipProps} formatter={v => [fmtSigned(Math.round(v)) + ' Md€', 'Solde']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="soldeExclBG" stroke="#05c1ad" strokeWidth={2}
              dot={false} isAnimationActive={false} name="Solde" />
          </LineChart>
        </ResponsiveContainer>
        <p className="sim-chart-caption">
          {transferMode === 'none'
            ? <>≈ <strong>40 Md€/an</strong> du budget général libérés pour dépenser sur l'éducation et la santé (transferts CSG/FSV/État supprimés sous cette réforme).</>
            : <>≈ <strong>{avgFiscalTransfer} Md€/an</strong> en moyenne du budget général alloués aux retraites pendant la transition (transferts CSG/FSV/État maintenus).</>}
        </p>
      </div>

      <div className="sim-chart-card">
        <div className="sim-chart-h">
          <h3>Retraite moyenne par retraité</h3>
          <span className="sim-chart-h-unit">€/mois, réel 2027</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2050, 2070, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
              tickFormatter={v => fmt(Math.round(v))} />
            <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' €/mo', 'Retraite']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="perRetReal" stroke="#e9c53d" strokeWidth={2}
              dot={false} isAnimationActive={false} name="Retraite" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="sim-chart-card is-wide">
        <div className="sim-chart-h">
          <h3>Composition des dépenses retraites</h3>
          <span className="sim-chart-h-unit">Md€/an · pile</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
              tickFormatter={fmtAxis} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
            <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
              labelFormatter={l => 'Année ' + l} />
            <Area type="monotone" dataKey="legacyExp"  stackId="1" stroke="#e05c4e" fill="rgba(224,92,78,0.30)" name="Legacy (système actuel)" />
            <Area type="monotone" dataKey="transPayg"  stackId="1" stroke="#e9c53d" fill="rgba(233,197,61,0.30)" name="Transitionnels" />
            <Area type="monotone" dataKey="ndcPayg"    stackId="1" stroke="#9b72f0" fill="rgba(155,114,240,0.30)" name="NDC (Suède)" />
            <Area type="monotone" dataKey="capiPayout" stackId="1" stroke="#05c1ad" fill="rgba(5,193,173,0.30)" name="Capitalisation" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ============================ KPIs tab ============================
function KpisTab({ k }) {
  const cards = [
    { label: 'Dette pic', value: fmt(k.peakDebt, 0), unit: 'Md€', sub: 'Atteinte en ' + k.peakDebtYear },
    { label: 'Intérêts cumulés', value: fmt(k.totalInterest, 0), unit: 'Md€', sub: 'Coût total de la transition' },
    { label: 'Pot capi (final, réel)', value: fmt(k.finalCapiReal, 0), unit: 'Md€', sub: '€ constants 2027' },
    {
      label: 'Spread minimum', value: fmt(k.minSpread * 100, 2), unit: '%',
      cls: k.minSpread > 0 ? 'is-ok' : 'is-bad',
      sub: k.minSpread > 0 ? 'Toujours positif' : 'Passe en négatif',
    },
    {
      label: 'Position nette finale', value: fmtSigned(k.netPosition, 0), unit: 'Md€',
      cls: k.netPosition > 0 ? 'is-ok' : 'is-bad',
      sub: 'Pot capi − dette de transition',
    },
    { label: 'Économies Équinoxe (t=0)', value: fmt(k.S0, 0), unit: 'Md€/an', sub: 'Effet annuel à régime' },
    { label: 'PV dépenses legacy', value: fmt(k.pvLegacyTotal, 0), unit: 'Md€', sub: 'Valeur actualisée 70 ans' },
    { label: 'PV retraites capi', value: fmt(k.pvCapiPayoutTotal, 0), unit: 'Md€', sub: 'Valeur actualisée 70 ans' },
  ]
  return (
    <div className="sim-kpis">
      {cards.map((c, i) => (
        <div key={i} className="sim-kpi">
          <span className="sim-kpi-label">{c.label}</span>
          <div className="sim-kpi-row">
            <span className={'sim-kpi-value ' + (c.cls || '')}>{c.value}</span>
            <span className="sim-kpi-unit">{c.unit}</span>
          </div>
          <div className="sim-kpi-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ============================ Parameters tab ============================

function YesNo({ value, onChange }) {
  return (
    <div className="sim-param-yesno">
      <button className={value ? 'is-on is-yes' : ''} onClick={() => onChange(true)}>Oui</button>
      <button className={value ? '' : 'is-on is-no'} onClick={() => onChange(false)}>Non</button>
    </div>
  )
}

function Seg({ value, onChange, options }) {
  return (
    <div className="sim-param-seg">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function NumInput({ value, onChange, step = 0.01, unit, min, max, mul = 1, dp = 2 }) {
  return (
    <div className="sim-param-input">
      <input type="number"
        value={(value * mul).toFixed(dp)}
        step={step}
        min={min} max={max}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (isFinite(v)) onChange(v / mul)
        }} />
      <span className="unit">{unit}</span>
    </div>
  )
}

function SliderInput({ value, onChange, min = 0, max = 300, step = 10, unit = 'Md€/an' }) {
  return (
    <div className="sim-slider-input">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="sim-slider-value">{Math.round(value)} <span className="unit">{unit}</span></span>
    </div>
  )
}

function ParamGroup({ title, description, enabled, onToggle, children, alwaysOn }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sim-param-group">
      <h3>{title}</h3>
      <p className="sim-param-group-sub">{description}</p>
      {!alwaysOn && <YesNo value={enabled} onChange={onToggle} />}
      {(enabled || alwaysOn) && children && (
        <div className="sim-param-expand">
          <button className="sim-param-expand-toggle" onClick={() => setOpen(!open)}>
            <span>{open ? '▼' : '▶'}</span>
            <span>Plus de détails</span>
          </button>
          {open && <div className="sim-param-expand-body">{children}</div>}
        </div>
      )}
    </div>
  )
}

function ParamsTab({ params, setTweak, mode }) {
  const getEff = key => params[key]

  return (
    <div className="sim-params">
      <ParamGroup
        title="Âge de départ à la retraite"
        description="Le levier central du débat français (réforme 2023 : 64 ans ; gel LFSS 2026). Relever l'âge réduit le nombre de retraités — et donc le coût du système."
        alwaysOn
      >
        <div className="sim-param-row">
          <label>
            Âge de base
            <span className="sim-param-row-tip">Âge effectif de départ, 60–70 ans</span>
          </label>
          <NumInput value={getEff('retirementAgeBase')} onChange={v => setTweak('retirementAgeBase', v)}
            unit="ans" dp={1} step={0.5} min={60} max={70} />
        </div>
        <div className="sim-param-row">
          <label>
            Indexation sur l'espérance de vie
            <span className="sim-param-row-tip">« indexé » relève l'âge de ½ du gain d'espérance de vie à 65 ans (logique NDC suédoise/italienne)</span>
          </label>
          <Seg value={getEff('retirementAgeMode')} onChange={v => setTweak('retirementAgeMode', v)}
            options={[{ value: 'fixed', label: 'Fixe' }, { value: 'indexed', label: 'Indexé' }]} />
        </div>
      </ParamGroup>

      <ParamGroup
        title="Rééquilibrage Équinoxe"
        description="Réduction progressive des retraites élevées, restauration CSG/CRDS, fin de l'abattement forfaitaire."
        enabled={getEff('useEquinoxe')}
        onToggle={v => setTweak('useEquinoxe', v)}
      >
        <div className="sim-param-row">
          <label>
            Phasing
            <span className="sim-param-row-tip">Comment la mesure entre en vigueur</span>
          </label>
          <Seg value={getEff('equinoxePhasing')}
            onChange={v => setTweak('equinoxePhasing', v)}
            options={[
              { value: 'immediate', label: 'Immédiat' },
              { value: 'phased-5y', label: '5 ans' },
              { value: 'phased-10y', label: '10 ans' },
            ]} />
        </div>
        {mode === 'advanced' && (
          <div className="sim-param-row">
            <label>
              Réduction CSG (par retraité)
              <span className="sim-param-row-tip">k€/an · effet à régime</span>
            </label>
            <NumInput value={getEff('S0_csg')} onChange={v => setTweak('S0_csg', v)} unit="k€" dp={1} step={0.5} />
          </div>
        )}
      </ParamGroup>

      <ParamGroup
        title="Pilier de capitalisation"
        description="Bascule progressive des cotisations vers un fonds capitalisé par cohorte."
        enabled={getEff('enableCapi')}
        onToggle={v => setTweak('enableCapi', v)}
      >
        <div className="sim-param-row">
          <label>
            Âge maximum d'entrée
            <span className="sim-param-row-tip">Cohortes plus âgées restent dans le système actuel</span>
          </label>
          <NumInput value={getEff('cutoffAge')} onChange={v => setTweak('cutoffAge', v)} unit="ans" dp={0} step={1} />
        </div>
        <div className="sim-param-row">
          <label>
            Rendement réel attendu
            <span className="sim-param-row-tip">% par an, net d'inflation</span>
          </label>
          <NumInput value={getEff('r_c')} onChange={v => setTweak('r_c', v)} unit="%" mul={100} dp={1} step={0.1} />
        </div>
        {mode === 'advanced' && (
          <>
            <div className="sim-param-row">
              <label>
                Mode Suédois (NDC + équilibrage automatique)
                <span className="sim-param-row-tip">Pilier capi limité, comptes notionnels sur le reste</span>
              </label>
              <YesNo value={!!getEff('swedenMode')}
                onChange={v => { setTweak('swedenMode', v); if (v) setTweak('chileMode', false) }} />
            </div>
            <div className="sim-param-row">
              <label>
                Mode Chilien (obligations de reconnaissance)
                <span className="sim-param-row-tip">100% des cotisations vers la capi, droits acquis = bonds</span>
              </label>
              <YesNo value={!!getEff('chileMode')}
                onChange={v => { setTweak('chileMode', v); if (v) setTweak('swedenMode', false) }} />
            </div>
          </>
        )}
      </ParamGroup>

      <ParamGroup
        title="Liquidation du parc HLM"
        description="5 %/an du parc cédé pour alimenter le fonds legacy. Décote conservatrice plafonnée."
        enabled={getEff('hlmDiscount') || getEff('rho') > 0}
        onToggle={v => {
          setTweak('hlmDiscount', v)
          setTweak('rho', v ? 0.05 : 0)
          setTweak('delta', v ? 0.3 : 0)
        }}
      >
        <div className="sim-param-row">
          <label>
            Taux de cession annuel
            <span className="sim-param-row-tip">% du parc cédé / an</span>
          </label>
          <NumInput value={getEff('rho')} onChange={v => setTweak('rho', v)} unit="%" mul={100} dp={1} step={0.5} />
        </div>
        {mode === 'advanced' && (
          <div className="sim-param-row">
            <label>
              Décote maximale
              <span className="sim-param-row-tip">Plafonnée pour absorber l'effet volume</span>
            </label>
            <NumInput value={getEff('delta')} onChange={v => setTweak('delta', v)} unit="%" mul={100} dp={0} step={5} />
          </div>
        )}
      </ParamGroup>

      <ParamGroup
        title="Réforme du marché du travail"
        description="Cible un taux d'emploi plus élevé pour générer les cotisations nécessaires."
        enabled={getEff('employmentRateTarget') > 0.70}
        onToggle={v => setTweak('employmentRateTarget', v ? 0.759 : 0.69)}
      >
        <div className="sim-param-row">
          <label>
            Cible plein-emploi
            <span className="sim-param-row-tip">% d'emploi (15-64 ans)</span>
          </label>
          <NumInput value={getEff('employmentRateTarget')} onChange={v => setTweak('employmentRateTarget', v)}
            unit="%" mul={100} dp={1} step={0.5} />
        </div>
        {mode === 'advanced' && (
          <div className="sim-param-row">
            <label>
              Durée de transition
              <span className="sim-param-row-tip">Années pour atteindre la cible</span>
            </label>
            <NumInput value={getEff('employmentTransitionYears')} onChange={v => setTweak('employmentTransitionYears', v)}
              unit="ans" dp={0} step={1} />
          </div>
        )}
      </ParamGroup>

      <ParamGroup
        title="Transferts du budget général"
        description="CSG, FSV, TVA qui complètent les cotisations. S'éteignent à mesure que le pilier capi devient autonome."
        alwaysOn
      >
        <div className="sim-param-row">
          <label>
            Régime de transferts
            <span className="sim-param-row-tip">Comment l'État finance le solde négatif</span>
          </label>
          <Seg value={getEff('fiscalTransferMode')}
            onChange={v => setTweak('fiscalTransferMode', v)}
            options={[
              { value: 'full', label: 'Oui, comme ajd' },
              { value: 'no-debt', label: 'Sans dette' },
              { value: 'none', label: 'Non' },
            ]} />
        </div>
      </ParamGroup>

      {getEff('chileMode') && !(getEff('tauK') > 0) && (
        <ParamGroup
          title="Injection de capital emprunté"
          description="L'État emprunte ce montant chaque année et l'investit directement dans le fonds capitalisé. La dette et le fonds augmentent simultanément — le pari est que le rendement du fonds dépasse le taux d'emprunt sur la durée."
          enabled={(getEff('leveragedInjection') ?? 0) > 0}
          onToggle={v => setTweak('leveragedInjection', v ? 50 : 0)}
        >
          <div className="sim-param-row">
            <label>
              Injection annuelle
              <span className="sim-param-row-tip">empruntés et investis dans le fonds</span>
            </label>
            <SliderInput
              value={getEff('leveragedInjection') ?? 0}
              onChange={v => setTweak('leveragedInjection', v)}
              min={0} max={300} step={10} unit="Md€/an"
            />
          </div>
        </ParamGroup>
      )}

      {mode === 'advanced' && (
        <ParamGroup
          title="Démographie"
          description="Scénario de natalité, migration, mortalité."
          alwaysOn
        >
          <div className="sim-param-row">
            <label>
              Profil
              <span className="sim-param-row-tip">cor_central = projections COR. realistic = ratio de dépendance plus sévère.</span>
            </label>
            <Seg value={getEff('demoProfile')}
              onChange={v => setTweak('demoProfile', v)}
              options={[
                { value: 'cor_central', label: 'COR central' },
                { value: 'realistic',   label: 'Réaliste' },
                { value: 'reformed',    label: 'Réformée' },
              ]} />
          </div>
        </ParamGroup>
      )}
    </div>
  )
}

// ============================ Et pour vous tab ============================
function PovTab({ params, rows, cfRows, collapse, rung }) {
  const [birthYear, setBirthYear] = useState(1985)
  const [nominal, setNominal] = useState(false)
  const raw = useMemo(() => {
    try {
      // cfRows = rung 1 (status quo) rows, used as the universal "sans réforme"
      // baseline so the comparison is always against the actual no-reform path.
      return computeIndividualPerspective(params, rows, cfRows, birthYear)
    } catch (e) {
      return null
    }
  }, [params, rows, cfRows, birthYear])
  if (!raw) return <div className="sim-pov"><p>Impossible de calculer.</p></div>

  // Reform-side haircut: only on rung 1 where the "reform" IS the status quo.
  const reformHaircutActive = rung?.greekCollapse && collapse && raw.retirementYear >= collapse.collapseYear
  // CF-side haircut: on ALL rungs — the no-reform path leads to collapse.
  const cfHaircutActive = collapse && raw.retirementYear >= collapse.collapseYear

  const data = useMemo(() => {
    if (!reformHaircutActive && !cfHaircutActive) return raw
    const tSince   = raw.retirementYear - collapse.collapseYear
    const factor   = 1 - 0.5 * Math.min(1, tSince / 3)
    let { monthlyPensionLegacy, monthlyCapiAnnuity, monthlyPensionTotal, monthlyPensionCF } = raw
    if (reformHaircutActive) {
      monthlyPensionLegacy = Math.round(monthlyPensionLegacy * factor)
      monthlyCapiAnnuity   = Math.round(monthlyCapiAnnuity   * factor)
      monthlyPensionTotal  = Math.round(monthlyPensionTotal   * factor)
    }
    if (cfHaircutActive) {
      monthlyPensionCF = Math.round(monthlyPensionCF * factor)
    }
    return { ...raw, monthlyPensionLegacy, monthlyCapiAnnuity, monthlyPensionTotal,
             monthlyPensionCF, monthlyGain: monthlyPensionTotal - monthlyPensionCF }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, reformHaircutActive, cfHaircutActive])

  const gain = data.monthlyGain

  // Nominal/real display helpers
  const Y0 = params.Y0 ?? 2027
  const retT = Math.max(0, data.retirementYear - Y0)
  const inflFactor = Math.pow(1 + (params.pi ?? 0.02), retT)
  const disp = val => nominal ? Math.round(val * inflFactor) : val
  const unitSuffix = nominal ? `€ courants ${data.retirementYear}` : '€ constants 2027'

  // Representative worker monthly salary at retirement (real 2027 €), growing at real wage rate.
  // W0 = total wage bill in Md€; /30 = per-worker k€/year; ×1000/12 = €/month.
  const realMonthlyWage = Math.round(
    (params.W0 ?? 1320) / 30 * Math.pow(1 + (params.w_r ?? 0.004), retT) * 1000 / 12,
  )
  const dispWage = disp(realMonthlyWage)

  return (
    <div className="sim-pov">
      <h3>Et pour vous ?</h3>
      <p className="sim-pov-sub">
        Estimation indicative pour un cotisant médian — calculée à partir des hypothèses actives.
      </p>

      {reformHaircutActive && (
        <div className="sim-callout sim-callout-warn" style={{ marginBottom: 16 }}>
          <strong>Retraite après la restructuration ({collapse.collapseYear}) :</strong>{' '}
          en l'absence de réforme, vous subiriez la coupe de 50 % des retraites appliquée
          sur 3 ans. Les chiffres ci-dessous en tiennent compte.
        </div>
      )}
      {cfHaircutActive && !reformHaircutActive && (
        <div className="sim-callout sim-callout-warn" style={{ marginBottom: 16 }}>
          <strong>Comparaison honnête — sans réforme, restructuration vers {collapse.collapseYear} :</strong>{' '}
          la retraite « sans réforme » ci-dessous inclut la coupe de 50 % que le scénario
          du statu quo entraînerait pour votre génération. Votre gain net réel est donc{' '}
          <strong>{fmtSigned(gain)} €/mois</strong>.
        </div>
      )}
      {collapse && !cfHaircutActive && (
        <div className="sim-callout" style={{ marginBottom: 16, background: 'var(--bg-soft)', borderLeft: '3px solid var(--ink-3)' }}>
          <strong>Sans réforme, restructuration prévue vers {collapse.collapseYear}.</strong>{' '}
          Faites glisser le curseur au-delà de {collapse.collapseYear - (params.retirementAgeBase ?? 64)} pour
          voir l'impact sur les générations concernées par la coupe de 50 %.
        </div>
      )}

      <div className="sim-pov-cohort-row">
        <div>
          <div className="sim-pov-cohort-label">Année de naissance</div>
          <div style={{ fontSize: 24, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
            {birthYear}
            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#c8d2e2', marginLeft: 12, letterSpacing: '0.08em' }}>
              {data.ageInY0} ans en 2027
            </span>
          </div>
        </div>
        <div className="sim-pov-cohort-control">
          <input type="range" min="1960" max="2012" step="1"
            value={birthYear}
            onChange={e => setBirthYear(parseInt(e.target.value, 10))} />
        </div>
      </div>

      <div className="sim-pov-toggle-row">
        <span className="sim-pov-toggle-label">Afficher en</span>
        <div className="sim-pov-toggle">
          <button className={!nominal ? 'is-on' : ''} onClick={() => setNominal(false)}>€ constants 2027</button>
          <button className={nominal ? 'is-on' : ''} onClick={() => setNominal(true)}>€ courants</button>
        </div>
      </div>

      <div className="sim-pov-output">
        <div>
          <div className="sim-pov-out-label">Retraite mensuelle (réforme)</div>
          <div>
            <span className="sim-pov-out-value">{fmt(disp(data.monthlyPensionTotal))}</span>
            <span className="sim-pov-out-unit">{unitSuffix}/mois</span>
          </div>
          <div className="sim-pov-out-sub">
            {data.monthlyCapiAnnuity > 0
              ? <>Dont {fmt(disp(data.monthlyPensionLegacy))} € répartition · {fmt(disp(data.monthlyCapiAnnuity))} € capitalisation</>
              : <>Intégralement par répartition</>}
          </div>
        </div>
        <div>
          <div className="sim-pov-out-label">Retraite sans réforme</div>
          <div>
            <span className="sim-pov-out-value">{fmt(disp(data.monthlyPensionCF))}</span>
            <span className="sim-pov-out-unit">{unitSuffix}/mois</span>
          </div>
          <div className="sim-pov-out-sub">Système par répartition seul, sans Équinoxe</div>
        </div>
        <div>
          <div className="sim-pov-out-label">Différence</div>
          <div>
            <span className={'sim-pov-out-value ' + (gain >= 0 ? '' : 'is-bad')}>{fmtSigned(disp(gain))}</span>
            <span className="sim-pov-out-unit">{unitSuffix}/mois</span>
          </div>
          <div className={'sim-pov-out-delta ' + (gain >= 0 ? '' : 'is-bad')}>
            {gain >= 0 ? '↑' : '↓'} {Math.abs(Math.round(gain / Math.max(data.monthlyPensionCF, 1) * 100))} % vs. statu quo
          </div>
        </div>
      </div>

      <div className="sim-pov-wage-row">
        <span className="sim-pov-wage-label">Salaire médian estimé en {data.retirementYear}</span>
        <span className="sim-pov-wage-value">
          {fmt(dispWage)}
          <span className="sim-pov-out-unit"> {unitSuffix}/mois</span>
        </span>
        <span className="sim-pov-wage-rate">
          Taux de remplacement : {Math.round(disp(data.monthlyPensionTotal) / Math.max(dispWage, 1) * 100)} %
        </span>
      </div>
    </div>
  )
}

// ============================ Diagnostics tab (Avancé only) ============================
// Three diagnostic visualisations migrated from the inline simulator:
//   1. Stock obligations vs fonds de remboursement (Chili mode only)
//   2. Rachats annuels d'obligations (Chili mode only)
//   3. Coupe d'indexation ABM dans le temps (Suède + ABM only)
//   4. Frontière Pareto κ–φ (always available — runs 25 simulations)
function DiagnosticsTab({ params, rows, baseRows }) {
  const isChile  = !!params.chileMode
  const isSweden = !!params.swedenMode && !!params.swedenABM

  const chartData = useMemo(() => rows.map(r => ({
    year: r.year,
    bondStock:        r.BR_t ?? 0,
    cumRepayFund:     r.cumRepayFund_t ?? 0,
    bondRedemption:   r.bondRedemption_t ?? 0,
    bondIssuance:     r.bondIssuance_t ?? 0,
    abmFactorPct:     ((r.abmFactor_t ?? 1) * 100),
    abmCut:           r.abmCut_t ?? 0,
  })), [rows])

  // κ–φ sweep: 5 × 5 = 25 runs. Computed eagerly when this tab mounts.
  // Each point shows the trade-off between transition debt and the share of
  // the actuarial benchmark annuity actually paid out.
  const KAPPA_VALUES = [0.003, 0.006, 0.010, 0.018, 0.030]
  const PHI_VALUES   = [0.008, 0.010, 0.015, 0.020, 0.030]
  const KAPPA_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  const sweepData = useMemo(() => {
    return KAPPA_VALUES.flatMap((kappa) =>
      PHI_VALUES.map(phi => {
        const p = { ...params, debtSweepKCap: kappa, annuityFloorRate: phi }
        const sweepRows = runSimulation(p)
        const peakDebt = Math.max(...sweepRows.map(r => r.D_t))
        const capiRows = sweepRows.filter(r => (r.capiRetirees ?? 0) > 0.01)
        const avgRatio = capiRows.length
          ? capiRows.reduce((s, r) => {
              const denom = (r.K_t ?? 0) * (r.annuityRate_t ?? 0) * (r.capiAssetShare_t ?? 0)
              return s + (denom > 1e-6 ? (r.capiPayout_t ?? 0) / denom : 0)
            }, 0) / capiRows.length
          : 0
        return { kappa, phi, peakDebt: peakDebt / 1000, avgRatio: avgRatio * 100 }
      }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <div className="sim-charts-grid">

      {isChile && (
        <>
          <div className="sim-chart-card is-wide">
            <div className="sim-chart-h">
              <h3>Obligations en circulation vs fonds de remboursement</h3>
              <span className="sim-chart-h-unit">Md€ · Mode Chilien</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
                  tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
                <YAxis tickLine={false} axisLine={false} width={60} tick={axisTickStyle}
                  tickFormatter={fmtAxis} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
                <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
                  labelFormatter={l => 'Année ' + l} />
                <Area type="monotone" dataKey="bondStock" stroke="#e9c53d" fill="rgba(233,197,61,0.20)" strokeWidth={2}
                  name="Stock obligations BR_t" dot={false} />
                <Line type="monotone" dataKey="cumRepayFund" stroke="#05c1ad" strokeWidth={2}
                  name="Fonds de remboursement cumulé" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="sim-chart-card-foot">
              L'écart entre les deux séries = obligation nette résiduelle de l'État
            </div>
          </div>

          <div className="sim-chart-card is-wide">
            <div className="sim-chart-h">
              <h3>Émissions et rachats annuels d'obligations</h3>
              <span className="sim-chart-h-unit">Md€/an · Mode Chilien</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
                  tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
                  tickFormatter={fmtAxis} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
                <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
                  labelFormatter={l => 'Année ' + l} />
                <Bar dataKey="bondIssuance"   fill="#9b72f0" name="Émission initiale (t=0)" />
                <Bar dataKey="bondRedemption" fill="#e9c53d" name="Rachat annuel" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="sim-chart-card-foot">
              Pic d'émission à t=0 (NPV total des droits acquis), puis rachats échelonnés selon les départs en retraite
            </div>
          </div>
        </>
      )}

      {isSweden && (
        <div className="sim-chart-card is-wide">
          <div className="sim-chart-h">
            <h3>Équilibrage automatique (ABM) — indexation effective des retraites</h3>
            <span className="sim-chart-h-unit">% · Mode Suédois</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(5,193,173,0.2)' }}
                tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} width={48} tick={axisTickStyle}
                domain={[Math.floor((params.swedenABMFloor ?? 0.5) * 100), 100]}
                tickFormatter={v => v + '%'} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={56}
                tick={axisTickStyle} tickFormatter={v => Math.round(v)} />
              <ReferenceLine yAxisId="left" y={100} stroke="#05c1ad" strokeDasharray="3 3" strokeOpacity={0.5}
                label={{ value: 'Sans coupe', position: 'right', fontSize: 10, fill: '#05c1ad' }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
              <Tooltip {...tooltipProps}
                formatter={(v, name) => name === 'Coupe annuelle'
                  ? [fmt(Math.round(v)) + ' Md€', name]
                  : [fmt(v, 1) + ' %', name]}
                labelFormatter={l => 'Année ' + l} />
              <Area yAxisId="left" type="monotone" dataKey="abmFactorPct" stroke="#05c1ad" fill="rgba(5,193,173,0.25)"
                strokeWidth={2} name="Indexation effective (%)" dot={false} />
              <Bar yAxisId="right" dataKey="abmCut" fill="#e05c4e" name="Coupe annuelle" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="sim-chart-card-foot">
            Coupe d'indexation = ressources PAYG &lt; décaissements. Plancher de sécurité à {Math.round((params.swedenABMFloor ?? 0.5) * 100)} %.
          </div>
        </div>
      )}

      <div className="sim-chart-card is-wide">
        <div className="sim-chart-h">
          <h3>Frontière Pareto κ–φ · dette de transition vs couverture actuarielle</h3>
          <span className="sim-chart-h-unit">25 simulations · κ × φ</span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 48, left: 24 }}>
            <CartesianGrid stroke="rgba(5,193,173,0.08)" strokeDasharray="2 4" />
            <XAxis type="number" dataKey="peakDebt" name="Dette max"
              label={{ value: 'Dette de transition max (k Md€)', position: 'insideBottom', offset: -28, fontSize: 11, fill: '#c8d2e2' }}
              tick={axisTickStyle} tickFormatter={v => fmt(v, 1)} />
            <YAxis type="number" dataKey="avgRatio" name="Ratio actuariel"
              label={{ value: 'Paiement / rente actuarielle (%)', angle: -90, position: 'insideLeft', dx: -8, fontSize: 11, fill: '#c8d2e2' }}
              tick={axisTickStyle} tickFormatter={v => v.toFixed(0) + '%'} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ background: '#12182a', border: '1px solid rgba(5,193,173,0.2)', padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#f2f5fb' }}>
                    <div><b>κ (K-cap balayage)</b> = {d.kappa}</div>
                    <div><b>φ (plancher annuité)</b> = {d.phi}</div>
                    <div><b>Dette max</b> = {fmt(d.peakDebt, 1)} k Md€</div>
                    <div><b>Ratio actuariel</b> = {d.avgRatio.toFixed(1)}%</div>
                  </div>
                )
              }} />
            <Legend payload={KAPPA_VALUES.map((k, i) => ({ value: `κ = ${k}`, type: 'circle', color: KAPPA_COLORS[i] }))}
              wrapperStyle={{ fontSize: 11, paddingTop: 4, fontFamily: 'Inter, sans-serif' }} verticalAlign="top" />
            {KAPPA_VALUES.map((kappa, ki) => (
              <Scatter key={kappa} name={`κ=${kappa}`}
                data={sweepData.filter(d => d.kappa === kappa)}
                fill={KAPPA_COLORS[ki]}>
                {sweepData.filter(d => d.kappa === kappa).map((entry, idx) => (
                  <Cell key={idx} fill={KAPPA_COLORS[ki]} r={7} />
                ))}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        <div className="sim-chart-card-foot">
          Chaque point = une simulation paramétrée (κ = K-cap de balayage de dette, φ = plancher d'annuité capi). Vise le coin nord-ouest : peu de dette, paiement proche de l'optimum actuariel.
        </div>
      </div>

      {!isChile && !isSweden && (
        <div className="sim-chart-card is-wide" style={{ background: 'var(--bg-soft)', borderStyle: 'dashed' }}>
          <div className="sim-chart-h">
            <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500 }}>
              Diagnostics additionnels disponibles avec d'autres scénarios
            </h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0', lineHeight: 1.55 }}>
            <strong>Mode Chilien</strong> (rung 4 ou 5) ajoute deux graphiques : stock d'obligations vs fonds de remboursement et émissions/rachats annuels.<br/>
            <strong>Mode Suédois</strong> (rung 3) ajoute un graphique de l'indexation effective des retraites sous le mécanisme d'équilibrage automatique.
          </p>
        </div>
      )}

    </div>
  )
}

// ============================ Top-level page ============================
export default function SimulatorPage({ navigateTo }) {
  const [rungIdx, setRungIdx] = useState(4)            // default: étape 5 (Chili financé)
  const [conditions, setConditions] = useState('neutral')
  const [tab, setTab] = useState('charts')
  const [paramMode, setParamMode] = useState('simple') // 'simple' | 'advanced'
  const [tweaks, setTweaks] = useState({})

  const setTweak = useCallback((key, value) => {
    setTweaks(prev => ({ ...prev, [key]: value }))
  }, [])
  const resetTweaks = useCallback(() => setTweaks({}), [])

  // Round-trip rung/conditions/tab/mode through the URL hash so links like
  // #/simulateur?rung=4&conditions=stress&tab=kpis are shareable and survive
  // reload. Tweaks are intentionally NOT encoded (free-form bag of engine
  // overrides; would bloat the URL).
  useSimulatorHashState(
    { rungIdx, conditions, tab, paramMode },
    { setRungIdx, setConditions, setTab, setParamMode },
  )

  // In simple mode only Graphiques and Et pour vous tabs exist; fall back from
  // any hidden tab to Graphiques. In advanced mode the only extra guard is the
  // Diagnostics tab (shown only in Avancé).
  useEffect(() => {
    if (paramMode === 'simple' && tab !== 'charts' && tab !== 'pov') {
      setTab('charts')
    } else if (paramMode !== 'advanced' && tab === 'diagnostics') {
      setTab('charts')
    }
  }, [paramMode, tab])

  const params  = useMemo(() => buildParams(rungIdx, conditions, tweaks), [rungIdx, conditions, tweaks])
  const rows    = useMemo(() => runSimulation(params), [params])
  const k       = useMemo(() => extractKPIs(rows), [rows])
  const baselineRows = useMemo(() => runSimulation(buildCounterfactualParams(params)), [params])

  // Rung 1 (status quo) rows — used as the universal "sans réforme" baseline
  // in Et pour vous across ALL rungs, so the CF pension always reflects the
  // actual no-reform trajectory (including the Greek collapse).
  // Recomputes only when conditions change, not on rung/tweak changes.
  const statusQuoParams = useMemo(() => buildParams(0, conditions, {}), [conditions])
  const statusQuoRows   = useMemo(() => runSimulation(statusQuoParams), [statusQuoParams])

  // Collapse detection on the status quo trajectory. Serves two roles:
  //   • PovTab CF side (all rungs): haircut monthlyPensionCF when individual
  //     retires after the collapse year → honest comparison for reform rungs.
  //   • PovTab reform side (rung 1 only, via rung.greekCollapse flag): same
  //     haircut on monthlyPensionTotal since the "reform" IS the status quo.
  const statusQuoCollapse = useMemo(() => {
    let accel = 1
    for (const r of statusQuoRows) {
      if (r.debtRatio_t > GREEK_GE_THRESHOLD_PCT_GDP) accel *= (1 + GREEK_GE_ACCEL_PER_YEAR)
      const adjustedRatio = r.debtRatio_t * accel
      if (adjustedRatio > GREEK_COLLAPSE_TRIGGER_PCT || r.r_d_t >= GREEK_R_D_RESTRUCTURE_TRIGGER) {
        return { collapseYear: r.year, debtRatioAtCollapse: Math.round(adjustedRatio) }
      }
    }
    return null
  }, [statusQuoRows])

  const downloadCsv = () => {
    const header = Object.keys(rows[0]).join(',')
    const lines = rows.map(r =>
      Object.values(r).map(v => typeof v === 'number' ? v.toFixed(4) : (v ?? '')).join(','),
    )
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `capi-sim-${LADDER_RUNGS[rungIdx].id}-${conditions}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeRung = LADDER_RUNGS[rungIdx]
  const hasTweaks  = Object.keys(tweaks).length > 0

  return (
    <div className="sim-shell sim-var-a">
      <div className="sim-chooser">
        <div className="sim-rung-row">
          {LADDER_RUNGS.map((r, j) => (
            <button key={r.id}
              className={'sim-rung-pill ' + (j === rungIdx ? 'is-on' : '')}
              onClick={() => { setRungIdx(j); resetTweaks() }}>
              <span className="sim-rung-num">{String(r.num).padStart(2, '0')}</span>
              <span className="sim-rung-name">{r.label}</span>
            </button>
          ))}
        </div>
        <div className="sim-chooser-right">
          <div className="sim-conditions">
            <div className="sim-conditions-row">
              <span>Conditions macro</span>
              <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 'normal', color: '#98a4b7', fontSize: 10 }}>
                {CONDITIONS[conditions].desc}
              </span>
            </div>
            <div className="sim-conditions-track">
              {Object.entries(CONDITIONS).map(([key, c]) => (
                <button key={key}
                  className={(conditions === key ? 'is-on cond-' + key : '')}
                  onClick={() => setConditions(key)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="sim-brand-toggle">
            <button className={paramMode === 'simple' ? 'is-on' : ''} onClick={() => setParamMode('simple')}>Simple</button>
            <button className={paramMode === 'advanced' ? 'is-on' : ''} onClick={() => setParamMode('advanced')}>Avancé</button>
          </div>
        </div>
      </div>

      <div className="sim-tabs-wrap">
        <div className="sim-tabs">
          <button className={'sim-tab ' + (tab === 'charts' ? 'is-on' : '')} onClick={() => setTab('charts')}>Graphiques</button>
          {paramMode === 'advanced' && (
            <button className={'sim-tab ' + (tab === 'params' ? 'is-on' : '')} onClick={() => setTab('params')}>Paramètres</button>
          )}
          {paramMode === 'advanced' && (
            <button className={'sim-tab ' + (tab === 'kpis' ? 'is-on' : '')} onClick={() => setTab('kpis')}>Indicateurs</button>
          )}
          <button className={'sim-tab sim-tab-pov ' + (tab === 'pov' ? 'is-on' : '')} onClick={() => setTab('pov')}>Et pour vous</button>
          {paramMode === 'advanced' && (
            <button className={'sim-tab ' + (tab === 'diagnostics' ? 'is-on' : '')} onClick={() => setTab('diagnostics')}>
              Diagnostics
            </button>
          )}
        </div>
        <div className="sim-tabs-meta">
          <span>{activeRung.label} · {CONDITIONS[conditions].label}{hasTweaks ? ' · tweaked' : ''}</span>
          <button onClick={downloadCsv}>Télécharger CSV</button>
          {hasTweaks && <button onClick={resetTweaks}>Réinitialiser</button>}
        </div>
      </div>

      <main className="sim-content">
        {tab === 'charts' && paramMode === 'simple' && (
          <div className="sim-inline-section">
            <ParamsTab params={params} setTweak={setTweak} mode="simple" />
          </div>
        )}
        {tab === 'charts' && paramMode === 'simple' && (
          <div className="sim-inline-section sim-inline-kpis">
            <div className="sim-inline-section-header">Indicateurs clés</div>
            <KpisTab k={k} />
          </div>
        )}
        {tab === 'charts' && <ChartsTab rows={rows} params={params} rung={activeRung} />}
        {tab === 'params' && <ParamsTab params={params} setTweak={setTweak} mode={paramMode} />}
        {tab === 'kpis'   && <KpisTab k={k} />}
        {tab === 'pov'    && <PovTab params={params} rows={rows} cfRows={statusQuoRows} collapse={statusQuoCollapse} rung={activeRung} />}
        {tab === 'diagnostics' && paramMode === 'advanced' && (
          <DiagnosticsTab params={params} rows={rows} baseRows={baselineRows} />
        )}
      </main>
    </div>
  )
}
