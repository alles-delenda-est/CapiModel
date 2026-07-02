import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import ChartTooltip from '../components/ChartTooltip.jsx'
import { applyGreekCollapseOverlay } from './IntroLadderRungs.js'

// Chart for the SimplifiedView (spec §5): where the money comes from —
// cotisations vs dette vs sacrifices budgétaires (annual budget transfers).
export default function SimplifiedChart({ results, collapseYear }) {
  const data = results.map(r => ({
    year: r.year,
    cotisations: (r.C_s_t ?? 0) + (r.C_e_t ?? 0),
    dette: r.D_t,
    // debtRatio_t = TOTAL sovereign debt % GDP — same field the collapse KPI uses.
    debtRatio: r.debtRatio_t,
    rDeff: r.r_d_t,
    pension: 0, solde: 0,
    sacrifices: r.fiscalTransfer_t ?? 0,
  }))
  // Cap the debt line at the 250 % restructuring point for readability (no-op
  // for solvent reforms). Same overlay the intro/simulator use.
  applyGreekCollapseOverlay(data, {
    debt: 'dette', debtRatio: 'debtRatio', rDeff: 'rDeff',
    pension: 'pension', solde: 'solde',
  })
  return (
    <div className="sv-chart-block">
      <h3>D'où vient l'argent&nbsp;: cotisations, dette, sacrifices budgétaires</h3>
      <p className="sv-chart-explain">
        Les <strong>cotisations</strong> financent le système. Quand elles ne
        suffisent pas, on comble par la <strong>dette</strong> (emprunt) ou par
        les <strong>sacrifices budgétaires</strong>&nbsp;— de l'argent pris au
        budget de l'État (écoles, justice, solidarité).
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" tick={{ fontSize: 14 }}
            label={{ value: 'Année', position: 'insideBottom', offset: -8, style: { fontSize: 13, fill: 'var(--text-secondary)' } }} />
          <YAxis width={55} tick={{ fontSize: 14 }}
            label={{ value: 'Md€/an', angle: -90, position: 'insideLeft', dx: -8, style: { fontSize: 12, fill: 'var(--text-secondary)' } }} />
          <Tooltip content={<ChartTooltip unit="Md€" />} />
          <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" />
          {collapseYear && (
            <ReferenceLine x={collapseYear} stroke="var(--color-danger)" strokeDasharray="4 4"
              label={{ value: 'Restructuration', position: 'top', fontSize: 11, fill: 'var(--color-danger)' }} />
          )}
          <Area type="monotone" dataKey="dette" fill="#fecaca" stroke="#dc2626" strokeWidth={2} name="Dette de transition" />
          <Line type="monotone" dataKey="cotisations" stroke="#2563eb" strokeWidth={2} dot={false} name="Cotisations" />
          <Line type="monotone" dataKey="sacrifices" stroke="#b45309" strokeWidth={2} dot={false} name="Sacrifices budgétaires" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
