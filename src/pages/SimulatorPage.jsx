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
import { LADDER_RUNGS } from './IntroLadderRungs.js'
import './SimulatorPage.css'

// French number formatter
const fmt = (n, d = 0) =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n)
const fmtSigned = (n, d = 0) => (n > 0 ? '+' : '') + fmt(n, d)

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
  fill: '#6b7a8f',
  letterSpacing: '0.04em',
}
const tooltipProps = {
  contentStyle: {
    background: '#fafaf7',
    border: '1px solid rgba(14,26,43,0.1)',
    borderRadius: 0,
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    color: '#0e1a2b',
    boxShadow: 'none',
    padding: '8px 10px',
  },
  labelStyle: {
    color: '#6b7a8f',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
}

// ============================ Charts tab ============================
function ChartsTab({ rows, params }) {
  const chartData = useMemo(() => rows.map(r => {
    const totalRet = Math.max(1e-6, r.retireeIdx * params.R0)
    const totalPensionMdE = (r.legacyExp_t ?? 0) + (r.transitionalPaygExp_t ?? 0)
      + (r.ndcPaygPension_t ?? 0) + (r.capiPayout_t ?? 0)
    const perRetReal = (totalPensionMdE / totalRet) / r.I_factor_t * 1000 / 12
    return {
      year: r.year,
      debt: r.D_t,
      legacyExp: r.legacyExp_t,
      transPayg: r.transitionalPaygExp_t ?? 0,
      ndcPayg: r.ndcPaygPension_t ?? 0,
      capiPayout: r.capiPayout_t,
      soldeExclBG: (r.netFlow_t ?? 0) - (r.fiscalTransfer_t ?? 0),
      fiscalTransfer: r.fiscalTransfer_t ?? 0,
      perRetReal,
      capiPot: r.K_t,
    }
  }), [rows, params])

  return (
    <div className="sim-charts-grid">
      <div className="sim-chart-card is-wide">
        <div className="sim-chart-h">
          <h3>Dette publique cumulée</h3>
          <span className="sim-chart-h-unit">Md€</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={60} tick={axisTickStyle}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)} />
            <Tooltip {...tooltipProps}
              formatter={v => [fmt(v) + ' Md€', 'Dette']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="debt" stroke="#c9a961" strokeWidth={2.5}
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
            <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2050, 2070, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={axisTickStyle}
              tickFormatter={v => (v >= 0 ? '+' : '') + Math.round(v)} />
            <ReferenceLine y={0} stroke="#0e1a2b" strokeOpacity={0.25} strokeDasharray="2 3" />
            <Tooltip {...tooltipProps} formatter={v => [fmtSigned(Math.round(v)) + ' Md€', 'Solde']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="soldeExclBG" stroke="#0d9488" strokeWidth={2}
              dot={false} isAnimationActive={false} name="Solde" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="sim-chart-card">
        <div className="sim-chart-h">
          <h3>Pension moyenne par retraité</h3>
          <span className="sim-chart-h-unit">€/mois, réel 2027</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2050, 2070, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
              tickFormatter={v => fmt(Math.round(v))} />
            <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' €/mo', 'Pension']}
              labelFormatter={l => 'Année ' + l} />
            <Line type="monotone" dataKey="perRetReal" stroke="#b85c3c" strokeWidth={2}
              dot={false} isAnimationActive={false} name="Pension" />
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
            <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
              tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
            <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
              labelFormatter={l => 'Année ' + l} />
            <Area type="monotone" dataKey="legacyExp"  stackId="1" stroke="#ef4444" fill="#fca5a5" name="Legacy (système actuel)" />
            <Area type="monotone" dataKey="transPayg"  stackId="1" stroke="#d97706" fill="#fde68a" name="Transitionnels" />
            <Area type="monotone" dataKey="ndcPayg"    stackId="1" stroke="#7c3aed" fill="#ddd6fe" name="NDC (Suède)" />
            <Area type="monotone" dataKey="capiPayout" stackId="1" stroke="#059669" fill="#86efac" name="Capitalisation" />
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
    { label: 'PV pensions capi', value: fmt(k.pvCapiPayoutTotal, 0), unit: 'Md€', sub: 'Valeur actualisée 70 ans' },
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
        title="Rééquilibrage Équinoxe"
        description="Réduction progressive des pensions élevées, restauration CSG/CRDS, fin de l'abattement forfaitaire."
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
function PovTab({ params, rows, baselineRows }) {
  const [birthYear, setBirthYear] = useState(1985)
  const data = useMemo(() => {
    try {
      return computeIndividualPerspective(params, rows, baselineRows, birthYear)
    } catch (e) {
      return null
    }
  }, [params, rows, baselineRows, birthYear])
  if (!data) return <div className="sim-pov"><p>Impossible de calculer.</p></div>

  const gain = data.monthlyGain
  return (
    <div className="sim-pov">
      <h3>Et pour vous ?</h3>
      <p className="sim-pov-sub">
        Estimation indicative pour un cotisant médian — calculée à partir des hypothèses actives.
      </p>

      <div className="sim-pov-cohort-row">
        <div>
          <div className="sim-pov-cohort-label">Année de naissance</div>
          <div style={{ fontSize: 24, fontFamily: 'Playfair Display, serif', fontWeight: 600 }}>
            {birthYear}
            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#6b7a8f', marginLeft: 12, letterSpacing: '0.08em' }}>
              {data.ageInY0} ans en 2027
            </span>
          </div>
        </div>
        <div className="sim-pov-cohort-control">
          <input type="range" min="1960" max="2005" step="1"
            value={birthYear}
            onChange={e => setBirthYear(parseInt(e.target.value, 10))} />
        </div>
      </div>

      <div className="sim-pov-output">
        <div>
          <div className="sim-pov-out-label">Pension mensuelle (réforme)</div>
          <div>
            <span className="sim-pov-out-value">{fmt(data.monthlyPensionTotal)}</span>
            <span className="sim-pov-out-unit">€/mois</span>
          </div>
          <div className="sim-pov-out-sub">
            Dont {fmt(data.monthlyPensionLegacy)} € par répartition · {fmt(data.monthlyCapiAnnuity)} € par capitalisation
          </div>
        </div>
        <div>
          <div className="sim-pov-out-label">Pension sans réforme</div>
          <div>
            <span className="sim-pov-out-value">{fmt(data.monthlyPensionCF)}</span>
            <span className="sim-pov-out-unit">€/mois</span>
          </div>
          <div className="sim-pov-out-sub">Système par répartition seul, sans Équinoxe</div>
        </div>
        <div>
          <div className="sim-pov-out-label">Différence</div>
          <div>
            <span className={'sim-pov-out-value ' + (gain >= 0 ? '' : 'is-bad')}>{fmtSigned(gain)}</span>
            <span className="sim-pov-out-unit">€/mois</span>
          </div>
          <div className={'sim-pov-out-delta ' + (gain >= 0 ? '' : 'is-bad')}>
            {gain >= 0 ? '↑' : '↓'} {Math.abs(Math.round(gain / Math.max(data.monthlyPensionCF, 1) * 100))} % vs. statu quo
          </div>
        </div>
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
                <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
                  tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
                <YAxis tickLine={false} axisLine={false} width={60} tick={axisTickStyle}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
                <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
                  labelFormatter={l => 'Année ' + l} />
                <Area type="monotone" dataKey="bondStock" stroke="#c9a961" fill="#fef3c7" strokeWidth={2}
                  name="Stock obligations BR_t" dot={false} />
                <Line type="monotone" dataKey="cumRepayFund" stroke="#0d9488" strokeWidth={2}
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
                <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
                  tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={axisTickStyle}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
                <Tooltip {...tooltipProps} formatter={v => [fmt(Math.round(v)) + ' Md€', '']}
                  labelFormatter={l => 'Année ' + l} />
                <Bar dataKey="bondIssuance"   fill="#7c3aed" name="Émission initiale (t=0)" />
                <Bar dataKey="bondRedemption" fill="#c9a961" name="Rachat annuel" />
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
            <h3>Équilibrage automatique (ABM) — indexation effective des pensions</h3>
            <span className="sim-chart-h-unit">% · Mode Suédois</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'rgba(14,26,43,0.2)' }}
                tick={axisTickStyle} ticks={[2030, 2045, 2060, 2075, 2090]} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} width={48} tick={axisTickStyle}
                domain={[Math.floor((params.swedenABMFloor ?? 0.5) * 100), 100]}
                tickFormatter={v => v + '%'} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={56}
                tick={axisTickStyle} tickFormatter={v => Math.round(v)} />
              <ReferenceLine yAxisId="left" y={100} stroke="#0d9488" strokeDasharray="3 3" strokeOpacity={0.5}
                label={{ value: 'Sans coupe', position: 'right', fontSize: 10, fill: '#0d9488' }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} iconType="square" />
              <Tooltip {...tooltipProps}
                formatter={(v, name) => name === 'Coupe annuelle'
                  ? [fmt(Math.round(v)) + ' Md€', name]
                  : [fmt(v, 1) + ' %', name]}
                labelFormatter={l => 'Année ' + l} />
              <Area yAxisId="left" type="monotone" dataKey="abmFactorPct" stroke="#0d9488" fill="#a7f3d0"
                strokeWidth={2} name="Indexation effective (%)" dot={false} />
              <Bar yAxisId="right" dataKey="abmCut" fill="#b85c3c" name="Coupe annuelle" />
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
            <CartesianGrid stroke="rgba(14,26,43,0.06)" strokeDasharray="2 4" />
            <XAxis type="number" dataKey="peakDebt" name="Dette max"
              label={{ value: 'Dette de transition max (k Md€)', position: 'insideBottom', offset: -28, fontSize: 11, fill: '#6b7a8f' }}
              tick={axisTickStyle} tickFormatter={v => fmt(v, 1)} />
            <YAxis type="number" dataKey="avgRatio" name="Ratio actuariel"
              label={{ value: 'Paiement / rente actuarielle (%)', angle: -90, position: 'insideLeft', dx: -8, fontSize: 11, fill: '#6b7a8f' }}
              tick={axisTickStyle} tickFormatter={v => v.toFixed(0) + '%'} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ background: '#fafaf7', border: '1px solid rgba(14,26,43,0.1)', padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#0e1a2b' }}>
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
            <strong>Mode Suédois</strong> (rung 3) ajoute un graphique de l'indexation effective des pensions sous le mécanisme d'équilibrage automatique.
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

  // If the user leaves Avancé mode while the Diagnostics tab is active,
  // fall back to Graphiques.
  useEffect(() => {
    if (paramMode !== 'advanced' && tab === 'diagnostics') {
      setTab('charts')
    }
  }, [paramMode, tab])

  const params  = useMemo(() => buildParams(rungIdx, conditions, tweaks), [rungIdx, conditions, tweaks])
  const rows    = useMemo(() => runSimulation(params), [params])
  const k       = useMemo(() => extractKPIs(rows), [rows])
  const baselineRows = useMemo(() => runSimulation(buildCounterfactualParams(params)), [params])

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
          <button className={'sim-tab ' + (tab === 'params' ? 'is-on' : '')} onClick={() => setTab('params')}>Paramètres</button>
          <button className={'sim-tab ' + (tab === 'kpis' ? 'is-on' : '')}   onClick={() => setTab('kpis')}>Indicateurs</button>
          <button className={'sim-tab ' + (tab === 'pov' ? 'is-on' : '')}    onClick={() => setTab('pov')}>Et pour vous</button>
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
        {tab === 'charts' && <ChartsTab rows={rows} params={params} />}
        {tab === 'params' && <ParamsTab params={params} setTweak={setTweak} mode={paramMode} />}
        {tab === 'kpis'   && <KpisTab k={k} />}
        {tab === 'pov'    && <PovTab params={params} rows={rows} baselineRows={baselineRows} />}
        {tab === 'diagnostics' && paramMode === 'advanced' && (
          <DiagnosticsTab params={params} rows={rows} baseRows={baselineRows} />
        )}
      </main>
    </div>
  )
}
