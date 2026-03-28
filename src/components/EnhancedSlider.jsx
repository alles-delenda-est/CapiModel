import './EnhancedSlider.css'

/**
 * Enhanced slider with visual track fill, default value marker,
 * color-coded values, CSS tooltips, and mobile-friendly touch targets.
 *
 * Props:
 *   id           — unique id (required for accessibility)
 *   label        — display label
 *   value        — current value
 *   onChange      — callback(newValue)
 *   min, max, step — range config
 *   unit         — display unit suffix
 *   decimals     — display precision (default 1)
 *   tip          — tooltip text
 *   defaultValue — shows a marker on the track for the baseline value
 *   warningBelow / warningAbove — value turns yellow outside this range
 *   dangerBelow  / dangerAbove  — value turns red outside this range
 */
export default function EnhancedSlider({
  id, label, value, onChange, min, max, step,
  unit = '', decimals = 1, tip,
  defaultValue,
  warningBelow, warningAbove,
  dangerBelow, dangerAbove,
}) {
  const range = max - min
  const fillPct = range > 0 ? ((value - min) / range) * 100 : 0
  const defaultPct = defaultValue !== undefined && range > 0
    ? ((defaultValue - min) / range) * 100
    : null

  let colorClass = ''
  if (dangerBelow !== undefined && value < dangerBelow) colorClass = 'es-danger'
  else if (dangerAbove !== undefined && value > dangerAbove) colorClass = 'es-danger'
  else if (warningBelow !== undefined && value < warningBelow) colorClass = 'es-warning'
  else if (warningAbove !== undefined && value > warningAbove) colorClass = 'es-warning'

  return (
    <div className="es-control">
      <div className="es-header">
        <label htmlFor={id}>
          {label}
          {tip && (
            <span className="es-tip-icon" tabIndex={0} role="note" data-tooltip={tip}>?</span>
          )}
        </label>
        <span className={`es-value ${colorClass}`}>
          {value.toFixed(decimals)} {unit}
        </span>
      </div>
      <div className="es-track-wrapper">
        <input
          id={id}
          type="range"
          className="es-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          aria-label={label}
          style={{ '--fill': `${fillPct}%` }}
        />
        {defaultPct !== null && (
          <div
            className="es-default-marker"
            style={{ left: `${defaultPct}%` }}
            title={`Défaut : ${defaultValue}`}
          />
        )}
      </div>
    </div>
  )
}
