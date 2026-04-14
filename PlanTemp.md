# CapiModel UX Improvements — Implementation Plan

## Context

Three parallel UX improvements to make CapiModel more engaging and less intimidating:
1. **Scrollytelling on IntroPage** — transform the static 4 Horsemen and Reform Mechanics sections into a sticky-chart narrative that updates as you scroll
2. **Better chart typography** — standardise axis labels, font sizes, tooltips, and reference lines across all 11 Recharts charts
3. **Expert Simulateur density reduction** — Simple/Expert mode toggle, tabbed charts, and collapsed table columns

No new runtime libraries required. Uses native IntersectionObserver, CSS animations, and existing Recharts.

---

## Implementation Order (lowest risk first)

### Phase 1 — Simulateur Density Reduction (`src/App.jsx` + `src/App.css`)

#### 1a. Simple/Expert mode toggle
- Add `const [expertMode, setExpertMode] = useState(false)` to App component
- Add pill toggle button (`Mode simple` / `Mode expert`) above the parameter sections
- Wrap the 6 non-critical `CollapsibleSection` components (level `"normal"` and `"advanced"`) in `{expertMode && ...}` — the 3 `level="critical"` sections always render
- Also wrap `<div className="mc-controls">` in `{expertMode && ...}`
- CSS: `.mode-toggle` (pill container), `.mode-toggle-btn`, `.mode-toggle-btn.active` (primary blue fill)

#### 1b. Tabbed charts
- Add `const [activeChartTab, setActiveChartTab] = useState('depenses')` to App
- Define `CHART_TABS = [{ id: 'depenses', label: 'Dépenses' }, { id: 'dette', label: 'Dette & Taux' }, { id: 'capitalisation', label: 'Capitalisation' }, { id: 'flux', label: 'Flux & VAN' }]`
- Replace the 8-chart scroll section with a tab bar + 4 `<div style={{ display: activeChartTab === id ? 'block' : 'none' }}>` wrappers
  - **Dépenses**: Chart 1 (bilan fonds legacy) + Chart 2 (legacy vs capi pensions)
  - **Dette & Taux**: Chart 3 (debt + rate trajectory)
  - **Capitalisation**: Chart 4 (capi pot + MC bands) + Chart 5 (spread σ)
  - **Flux & VAN**: Chart 6 (contribution flows) + Chart 7 (NPV)
- Use `display:none` not conditional rendering — keeps Recharts instances mounted, avoids ResponsiveContainer width-recalculation jank
- CSS: `.chart-tabs` (flex row, border-bottom), `.chart-tab`, `.chart-tab.active` (underline, primary blue) — mirror `Navigation.jsx` style

#### 1c. Collapsed table columns
- Add `const [showAllColumns, setShowAllColumns] = useState(false)` to App
- Replace the hardcoded `<th>/<td>` columns with a `TABLE_COLUMNS` array:
  - `always: true` (8 cols): Year, Dette (Md€), Dette/PIB (%), Dép. legacy, Dép. capi, Capi réel, r_d (%), Spread
  - `always: false` (14 cols): remaining columns (cohIdx, fundReturn, hlmProceeds, abatement, emplC_s, emplrToLeg, emplrToCap, debtInterest, netFlow, borrowed, repaid, levy, capi nominal, totalPensionExp)
- Derive `visibleColumns = TABLE_COLUMNS.filter(c => c.always || showAllColumns)` and map once for headers, once for rows
- Add "Toutes les colonnes" / "Colonnes essentielles" toggle button above table (reuse `mc-btn` class)
- Row slicing (`showAllRows`) is unchanged — orthogonal to column filtering

---

### Phase 2 — Chart Typography (`src/components/ChartTooltip.jsx` [new] + `SimplifiedView.jsx` + `App.jsx`)

#### 2a. Create `src/components/ChartTooltip.jsx` + `ChartTooltip.css`
A pure presentational component:
```jsx
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
          <span className="ct-value">{fmt(e.value)} {unit}</span>
        </div>
      ))}
    </div>
  )
}
```
`annotations` is `{ [year]: 'label string' }` — e.g. `{ [kpis.peakDebtYear]: 'Pic dette', [kpis.debtFreeYear]: 'Remboursé' }`.

CSS: white card, 1px border, 6px radius, box-shadow, `.ct-year` as bold header, `.ct-dot` as colored circle, `.ct-value` as tabular-nums font.

#### 2b. Apply to `SimplifiedView.jsx` (3 charts) and `App.jsx` (8 charts)
For every `<XAxis>`: `tick={{ fontSize: 14 }}` + `label={{ value: 'Année', position: 'insideBottom', offset: -5 }}`
For every `<YAxis>`: `tick={{ fontSize: 14 }}`, `width={55}`, fix `label` with explicit `dx` offset to prevent clipping
For every `<Tooltip>`: replace with `<Tooltip content={<ChartTooltip unit="Md€" annotations={...} />} />`
For every `<Legend>`: `wrapperStyle={{ fontSize: 14 }}` + `iconType="circle"`
Add `<ReferenceLine>` at `peakDebtYear` and `debtFreeYear` on debt charts with `label={{ value: 'Pic dette' / 'Remboursé', position: 'top', fontSize: 11 }}`

---

### Phase 3 — Scrollytelling IntroPage (`IntroPage.jsx` + `IntroPage.css`)

#### 3a. Data preparation (top of IntroPage function body)
`baseline.results` is already available. Derive:
```js
const chartDataFull = useMemo(() => results.map(r => ({
  year: r.year, debt: r.debt, shareWorkersCapi: r.shareWorkersCapi,
  hlmProceeds: r.hlmProceeds, legacyExp: r.legacyExp, capiPayout: r.capiPayout,
  levy: r.levy, repaid: r.repaid,
})), [results])

const DEMOGRAPHIC_DATA = [
  { year: 1960, ratio: 4.0 }, { year: 1970, ratio: 3.5 }, { year: 1980, ratio: 3.0 },
  { year: 1990, ratio: 2.7 }, { year: 2000, ratio: 2.4 }, { year: 2010, ratio: 2.0 },
  { year: 2020, ratio: 1.7 }, { year: 2030, ratio: 1.5 }, { year: 2040, ratio: 1.3 },
  { year: 2050, ratio: 1.2 },
]
```

`k.S0` is confirmed in `extractKPIs` at `simulation-engine.js:552` — no change needed.

#### 3b. Scroll card config
```js
const SCROLL_CARDS = [
  { id: 'horse-demo',    chartKey: 'demographie' },
  { id: 'horse-debt',    chartKey: 'dette-traj' },
  { id: 'horse-travail', chartKey: 'shift' },
  { id: 'horse-immo',   chartKey: 'hlm' },
  { id: 'reform-1',     chartKey: 'shift' },
  { id: 'reform-2',     chartKey: 'legacy-capi' },
  { id: 'reform-3',     chartKey: 'dette-peak' },
  { id: 'reform-4',     chartKey: 'levy' },
]
```

#### 3c. IntersectionObserver
```js
const [activeCard, setActiveCard] = useState('horse-demo')
const cardRefs = useRef({})

useEffect(() => {
  const observers = []
  SCROLL_CARDS.forEach(({ id }) => {
    const el = cardRefs.current[id]
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setActiveCard(id) },
      { root: null, rootMargin: '-5% 0px -40% 0px', threshold: 0 }
    )
    obs.observe(el)
    observers.push(obs)
  })
  return () => observers.forEach(o => o.disconnect())
}, [])
```

Use opacity-based fade (not `key=` remount) to avoid ResponsiveContainer thrashing on fast scrolling:
```js
const [displayedKey, setDisplayedKey] = useState('horse-demo')
const [fading, setFading] = useState(false)
useEffect(() => {
  setFading(true)
  const t = setTimeout(() => { setDisplayedKey(activeCard); setFading(false) }, 150)
  return () => clearTimeout(t)
}, [activeCard])
```

#### 3d. `ScrollChart` local component (inside IntroPage.jsx)
8 cases: `demographie` (LineChart of DEMOGRAPHIC_DATA, ReferenceLine at y=1), `dette-traj` (AreaChart of debt, ReferenceLine at peakDebtYear), `shift` (LineChart of shareWorkersCapi 0→1), `hlm` (BarChart of hlmProceeds), `legacy-capi` (ComposedChart stacked areas legacyExp+capiPayout), `dette-peak` (same as dette-traj but highlighted), `levy` (ComposedChart levy+repaid bars).

Recharts imports to add to IntroPage: `LineChart, Line, ComposedChart, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer`

#### 3e. Section restructure
Wrap both "Quatre Cavaliers" and "Clés de la Réforme" sections in one `.scrolly-container`:
```jsx
<div className="scrolly-container">
  <div className="scrolly-narrative">
    <h2>Les Quatre Cavaliers</h2>
    <div className="scroll-card mechanism-card" ref={el => cardRefs.current['horse-demo'] = el}>...</div>
    {/* 3 more horsemen cards */}
    <h2>Les Clés de la Réforme</h2>
    {/* 4 reform step cards */}
  </div>
  <div className="scrolly-sticky">
    <div className="scrolly-chart-fade" style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.15s' }}>
      <ScrollChart chartKey={SCROLL_CARDS.find(c => c.id === displayedKey)?.chartKey} ... />
    </div>
  </div>
</div>
```

#### 3f. CSS additions to `IntroPage.css`
```css
.scrolly-container { display: flex; gap: 2rem; align-items: flex-start; }
.scrolly-narrative { flex: 0 0 57%; min-width: 0; }
.scrolly-sticky {
  flex: 0 0 40%;
  position: sticky;
  top: 2rem;
  height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}
.scroll-card { margin-bottom: 1.25rem; min-height: 100px; }
@media (max-width: 768px) {
  .scrolly-container { flex-direction: column; }
  .scrolly-sticky { position: static; height: auto; min-height: 280px; width: 100%; }
}
```

Note: `.intro-page` has `max-width: 960px`. At that width, 57%/40% gives ~547px / ~384px — sufficient for Recharts charts.

---

## Files Modified

| File | Action |
|------|--------|
| `src/App.jsx` | Add `expertMode`, `activeChartTab`, `showAllColumns` state; `TABLE_COLUMNS` constant; mode toggle button; chart tab bar; column-filtered table |
| `src/App.css` | Add `.mode-toggle`, `.mode-toggle-btn`, `.chart-tabs`, `.chart-tab` styles |
| `src/pages/SimplifiedView.jsx` | Typography fixes + ChartTooltip on 3 charts |
| `src/pages/IntroPage.jsx` | Add Recharts imports, `activeCard`/`displayedKey` state, IntersectionObserver effect, `ScrollChart` component, restructure 2 sections into `.scrolly-container` |
| `src/pages/IntroPage.css` | Add scrolly layout + animation CSS |
| `src/components/ChartTooltip.jsx` | **New** — shared tooltip component |
| `src/components/ChartTooltip.css` | **New** — tooltip styles |

## Verification

1. `npx vite` from repo root — check dev server starts cleanly
2. **Simulateur**: toggle Simple/Expert mode, confirm 6 sections hide/show; click all 4 chart tabs; toggle table columns
3. **Charts**: hover over chart series and confirm custom tooltip shows year header + series names + units + annotations at peak debt year
4. **IntroPage**: scroll slowly through the page, confirm sticky chart panel updates for each of the 8 scroll cards; check opacity fade transition; test on mobile width (≤768px) that layout collapses to stacked
5. `npx vite build` — no build errors
