# Simulator port — integration notes

The new simulator page is ported to `src/pages/SimulatorPage.jsx` (+ `SimulatorPage.css`). It's self-contained: it reads the engine + presets + `LADDER_RUNGS` and renders the entire simulator UI (chooser, tabs, charts, params, KPIs, individual perspective).

## Wiring it into App.jsx

Two changes in `src/App.jsx`:

### 1. Add the import (near the top with the other page imports)

```jsx
import SimulatorPage from './pages/SimulatorPage.jsx'
```

### 2. Replace the inline simulator block

Currently lines **300–1251** wrap the entire inline simulator in:

```jsx
{currentPage === 'simulateur' && <>
  {/* ~950 lines of inline JSX */}
</>}
```

Replace that whole block with:

```jsx
{currentPage === 'simulateur' && <SimulatorPage navigateTo={navigateTo} />}
```

### 3. What you lose (decide whether to keep)

The inline simulator currently contains:

- **Individual perspective panel** at the top → migrated to the *Et pour vous* tab. ✅ Covered.
- **`Scénarios v1.0a` preset grid** → replaced by the 5-rung chooser at the top. ✅ Covered (less granular, more legible).
- **`Modes canoniques` section** (Diversification / Chili / Suède) → folded into the 5 rungs + into the Avancé toggles inside the Capi param group. ✅ Covered.
- **`Paramètres` mega-form** (3-tier slider tree) → replaced by the simplified Yes/No + Plus-de-détails pattern, with Simple/Avancé toggle for power users. ✅ Covered for the common cases. ⚠️ Some niche params (`taxCutStartT`, `thetaBuffer`, `tauK`, etc.) are not exposed in the new UI. Add them to `ParamsTab` if needed.
- **`Indicateurs clés` KPI grid** → migrated to the *Indicateurs* tab. ✅ Covered.
- **`Tableau de données`** → replaced by *Télécharger CSV* button. ✅ Covered.
- **`Graphiques` tabs** (with bond/ABM/κ-sweep sub-tabs) → only the four primary charts (Dette, Solde, Pension, Composition) are in the new *Graphiques* tab. ⚠️ The κ-sweep scatter, bond-redemption breakdown, and ABM diagnostics are **not** in the port. If those are important for power users, we can:
  - Add them as Avancé-only sub-tabs inside *Graphiques*, or
  - Move them to a new *Diagnostics* tab visible only in Avancé mode, or
  - Keep them as a separate hash-route (`#/simulateur/diagnostics`).

### 4. Tests / dev server

```bash
npm run dev    # verify the simulator route renders
npm test       # confirm nothing else breaks (the port doesn't touch the engine)
```

### 5. Files added

- `src/pages/SimulatorPage.jsx` (~600 lines)
- `src/pages/SimulatorPage.css`
- (already in place from the intro port) `src/pages/IntroLadderRungs.js`

### 6. Hash-route reset behaviour

The new page is stateful in-component (rungIdx, conditions, tab, tweaks, paramMode). It does **not** read or write the URL hash today. If you want URL-driven state (e.g. `#/simulateur?rung=4&conditions=stress`), it's a small `useHashNavigation`-style hook addition — let me know.

### 7. Differences from the inline simulator

| Feature                                                  | Inline simulator | New SimulatorPage |
|----------------------------------------------------------|------------------|-------------------|
| Scenario picker                                          | 6 presets + 3 canonical modes | 5 rungs (mirroring intro) |
| Macro condition selector                                 | individual sliders (r_c, w_r, demoProfile, …) | Optimist / Neutre / Stress (3-way) |
| Param form                                               | Always-on accordion, ~30 sliders | Yes/No + Plus-de-détails, ~10 visible |
| Power-user controls                                      | All visible by default | Avancé toggle (top-right) reveals them |
| Data table                                               | Inline collapsible table | Replaced by CSV download button |
| Et pour vous panel                                       | Top of page, collapsed by default | First-class tab, defaults open with birthYear slider |
| Bond / ABM / κ-sweep diagnostics                         | Sub-tabs in Graphiques  | **Not ported** — see §3 for options |

If anything in this list deviates from what you want, ping me and I'll patch the port before you wire it in.
