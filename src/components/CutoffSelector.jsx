import './CutoffSelector.css'

export default function CutoffSelector({ label, value, onChange, options, tip }) {
  return (
    <div className="cutoff-selector" title={tip}>
      <div className="cutoff-header">
        <label>{label} {tip && <span className="tip-icon">?</span>}</label>
      </div>
      <div className="cutoff-buttons">
        {options.map(opt => {
          const active = opt.value === value
          const key = opt.value == null ? 'null' : String(opt.value)
          return (
            <button
              key={key}
              type="button"
              className={`cutoff-btn ${active ? 'active' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
