// diff-trace.mjs — compare two engine reference traces field-by-field and
// print the top-N row × field deltas by relative magnitude.
//
// Usage:
//   node scripts/diff-trace.mjs path/to/old.json path/to/new.json [topN]
//
// Useful for fixture review when the engine changes intentionally (e.g.
// v1.0a → v1.1 transition): concentrates reviewer attention on the largest
// deltas rather than scrolling through 70 × ~80 fields of raw JSON diff.

import { readFileSync } from 'node:fs'

const [, , oldPath, newPath, topNArg] = process.argv
const topN = topNArg ? parseInt(topNArg, 10) : 20

if (!oldPath || !newPath) {
  console.error('Usage: node scripts/diff-trace.mjs <old.json> <new.json> [topN]')
  process.exit(1)
}

const oldRows = JSON.parse(readFileSync(oldPath, 'utf8'))
const newRows = JSON.parse(readFileSync(newPath, 'utf8'))

if (oldRows.length !== newRows.length) {
  console.warn(
    `Row count differs: old=${oldRows.length} new=${newRows.length}. ` +
    `Comparing aligned indices only.`,
  )
}

const oldFields = new Set(Object.keys(oldRows[0] ?? {}))
const newFields = new Set(Object.keys(newRows[0] ?? {}))
const onlyOld = [...oldFields].filter(k => !newFields.has(k))
const onlyNew = [...newFields].filter(k => !oldFields.has(k))
if (onlyOld.length) console.log(`Fields only in old: ${onlyOld.join(', ')}`)
if (onlyNew.length) console.log(`Fields only in new: ${onlyNew.join(', ')}`)

const deltas = []
const len = Math.min(oldRows.length, newRows.length)
for (let i = 0; i < len; i++) {
  for (const k of newFields) {
    const v0 = oldRows[i]?.[k]
    const v1 = newRows[i]?.[k]
    if (typeof v0 !== 'number' || typeof v1 !== 'number') continue
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue
    const abs = v1 - v0
    const denom = Math.max(Math.abs(v0), Math.abs(v1), 1e-12)
    const rel = abs / denom
    if (Math.abs(abs) < 1e-9 && Math.abs(rel) < 1e-9) continue
    deltas.push({ t: i, key: k, old: v0, new: v1, abs, rel })
  }
}

deltas.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))

console.log(`\nTotal non-trivial deltas: ${deltas.length}`)
console.log(`Top ${Math.min(topN, deltas.length)} by |relative delta|:\n`)
console.log('  t  field                         old              new              abs              rel%')
console.log('-'.repeat(100))
for (const d of deltas.slice(0, topN)) {
  const fmt = v => v.toExponential(4).padStart(15)
  console.log(
    String(d.t).padStart(3),
    d.key.padEnd(28),
    fmt(d.old),
    fmt(d.new),
    fmt(d.abs),
    (d.rel * 100).toFixed(4).padStart(10) + ' %',
  )
}
