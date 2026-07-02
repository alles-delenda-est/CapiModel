import { MACRO_CONDITIONS } from '../reforms.js'

// The material few parameters (spec §6, R4): 3 continuous sliders in one group,
// discrete controls (toggles + macro conditions) in a "Réglages" group.
// `values` carries the current effective value for each control (so a solved
// lever — e.g. Équilibre 2070's employment — displays correctly on a locked slider).
const SLIDERS = [
  { key: 'w_r', label: 'Croissance (productivité)', min: 0, max: 0.02, step: 0.001,
    format: v => `${(v * 100).toFixed(1)}%`, cor: 'COR central : 0,7 %/an',
    desc: 'De combien les salaires progressent au-delà de l’inflation chaque année.' },
  { key: 'retirementAgeBase', label: 'Âge de départ', min: 60, max: 70, step: 1,
    format: v => `${v} ans`, cor: 'COR : 64 ; 67,6 pour équilibrer en 2070',
    desc: 'L’âge légal de départ à la retraite.' },
  { key: 'employmentRateTarget', label: 'Taux d’emploi', min: 0.60, max: 0.85, step: 0.01,
    format: v => `${(v * 100).toFixed(0)}%`, cor: 'nous : 76 %',
    desc: 'Part des 15–64 ans en emploi à terme.' },
]
const TOGGLES = [
  { key: 'retirementAgeMode', label: 'L’âge suit-il l’espérance de vie ?',
    on: 'indexed', off: 'fixed', onLabel: 'Indexé', offLabel: 'Fixe',
    cor: '~67,6 ans en 2070 sous indexation' },
  { key: 'fiscalTransferMode', label: 'Sacrifices budgétaires',
    on: 'full', off: 'none', onLabel: 'Oui', offLabel: 'Non',
    cor: 'couper le budget éducation / justice / solidarité' },
  { key: 'hlmBundle', label: 'Financement HLM + CDC',
    on: true, off: false, onLabel: 'Oui', offLabel: 'Non',
    cor: 'ventes de logements sociaux + dotation CDC' },
]

export default function SimplifiedParams({ values, setOverride, conditionId, setCondition, disabledKeys = [] }) {
  return (
    <div className="sv-params">
      <div className="sv-sliders">
        {SLIDERS.map(s => {
          const locked = disabledKeys.includes(s.key)
          return (
            <div key={s.key} className={`sv-slider-card ${locked ? 'sv-locked' : ''}`}>
              <div className="sv-slider-header">
                <label>{s.label}{locked && <span className="sv-lock"> 🔒 auto</span>}</label>
                <span className="sv-slider-value">{s.format(values[s.key])}</span>
              </div>
              <input type="range" className="sv-slider"
                min={s.min} max={s.max} step={s.step} value={values[s.key]}
                disabled={locked}
                onChange={e => setOverride(s.key, parseFloat(e.target.value))} />
              <p className="sv-slider-desc">{s.desc} <em>({s.cor})</em></p>
            </div>
          )
        })}
      </div>

      <div className="sv-reglages">
        {TOGGLES.map(t => (
          <div key={t.key} className="sv-toggle-row" title={t.cor}>
            <span className="sv-toggle-label">{t.label}</span>
            <div className="sv-toggle-btns">
              <button className={values[t.key] === t.off ? 'active' : ''}
                disabled={disabledKeys.includes(t.key)}
                onClick={() => setOverride(t.key, t.off)}>{t.offLabel}</button>
              <button className={values[t.key] === t.on ? 'active' : ''}
                disabled={disabledKeys.includes(t.key)}
                onClick={() => setOverride(t.key, t.on)}>{t.onLabel}</button>
            </div>
          </div>
        ))}
        <div className="sv-toggle-row">
          <span className="sv-toggle-label">Conditions macro</span>
          <div className="sv-toggle-btns">
            {Object.entries(MACRO_CONDITIONS).map(([id, c]) => (
              <button key={id} className={conditionId === id ? 'active' : ''}
                onClick={() => setCondition(id)}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
