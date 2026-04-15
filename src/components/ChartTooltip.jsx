import './ChartTooltip.css'

const fmt = (v) => {
  if (typeof v !== 'number') return v
  if (Math.abs(v) >= 100) return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2019')
  return v.toFixed(2)
}

export default function ChartTooltip({ active, payload, label, unit = 'Md€', annotations = {} }) {
  if (!active || !payload?.length) return null
  const note = annotations[label]
  return (
    <div className="ct-box">
      <div className="ct-year">Année {label}</div>
      {note && <div className="ct-annotation">{note}</div>}
      {payload.map((e, i) => (
        <div key={i} className="ct-row">
          <span className="ct-dot" style={{ background: e.color }} />
          <span className="ct-name">{e.name}</span>
          <span className="ct-value">{fmt(Array.isArray(e.value) ? e.value[1] : e.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}
