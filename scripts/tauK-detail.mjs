import { runSimulation, DEFAULT_CONFIG, fisher } from '../src/simulation-engine.js'

const base = runSimulation(DEFAULT_CONFIG)
const opt  = runSimulation({ ...DEFAULT_CONFIG, tauK: 0.025 })
const milestones = [0,5,10,15,20,25,30,35,40,45,50,55,60,65,69]

console.log('year   D_base   D_opt    K_base    K_opt  capiPay_b  capiPay_o  tauKLevy  shortfall_o')
console.log('-'.repeat(93))
for (const t of milestones) {
  const b = base[t], r = opt[t]
  console.log(
    String(r.year).padEnd(6),
    b.D_t.toFixed(0).padStart(7),
    r.D_t.toFixed(0).padStart(8),
    b.K_t.toFixed(0).padStart(9),
    r.K_t.toFixed(0).padStart(9),
    b.capiPayout_t.toFixed(1).padStart(10),
    r.capiPayout_t.toFixed(1).padStart(10),
    r.tauKLevy_t.toFixed(1).padStart(9),
    r.shortfall_t.toFixed(1).padStart(12),
  )
}

console.log()
console.log('── Baseline sweep parameter checks ──')
console.log('  fundReturn_t[0]  =', base[0].fundReturn_t.toFixed(3),
            'Md€/yr  (= F0×fisher(r_f,π) =', (DEFAULT_CONFIG.F0 * fisher(DEFAULT_CONFIG.r_f_portfolio, DEFAULT_CONFIG.pi)).toFixed(3), ')')
console.log('  r_d_t[0]         =', (base[0].r_d_t * 100).toFixed(4),
            '%  (= r_d_base=3.5%, debtRatio=115% < threshold1=150%)')
console.log('  r_d_t[t=40,2067] =', (base[40].r_d_t * 100).toFixed(4),
            '%  (premium active — debt accumulated past 150% GDP)')
console.log('  debtRatio[t=40]  =', base[40].debtRatio_t.toFixed(1), '%')
