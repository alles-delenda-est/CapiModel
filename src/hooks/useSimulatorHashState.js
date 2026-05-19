import { useState, useEffect, useCallback, useRef } from 'react'

// Encode/decode the simulator's UI state in the URL hash query string so deep
// links like `#/simulateur?rung=4&conditions=stress&tab=kpis` survive reload
// and can be shared.  Tweaks are intentionally NOT encoded — they're a free-
// form bag of engine overrides and would balloon the URL.

const KEYS = ['rung', 'conditions', 'tab', 'mode']

function parseSearch() {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q < 0) return {}
  const params = new URLSearchParams(hash.slice(q + 1))
  const out = {}
  for (const k of KEYS) {
    const v = params.get(k)
    if (v !== null) out[k] = v
  }
  return out
}

function writeSearch(state) {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  const path = q < 0 ? hash : hash.slice(0, q)
  const params = new URLSearchParams()
  for (const k of KEYS) {
    if (state[k] != null && state[k] !== '') params.set(k, String(state[k]))
  }
  const search = params.toString()
  const next = search ? `${path}?${search}` : path
  if (next !== hash) {
    // Use replaceState to avoid littering history with every toggle.
    history.replaceState(null, '', next)
  }
}

export default function useSimulatorHashState({ rungIdx, conditions, tab, paramMode },
                                              { setRungIdx, setConditions, setTab, setParamMode }) {
  // Apply URL → state on mount.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const s = parseSearch()
    if (s.rung != null) {
      const n = Number(s.rung)
      if (Number.isInteger(n) && n >= 0 && n < 5) setRungIdx(n)
    }
    if (s.conditions === 'optimist' || s.conditions === 'neutral' || s.conditions === 'stress') {
      setConditions(s.conditions)
    }
    if (['charts','params','kpis','pov','diagnostics'].includes(s.tab)) setTab(s.tab)
    if (s.mode === 'simple' || s.mode === 'advanced') setParamMode(s.mode)
  }, [setRungIdx, setConditions, setTab, setParamMode])

  // Apply state → URL on change (after init).
  useEffect(() => {
    if (!didInit.current) return
    writeSearch({ rung: rungIdx, conditions, tab, mode: paramMode })
  }, [rungIdx, conditions, tab, paramMode])

  // React to back/forward navigation.
  useEffect(() => {
    const onHashChange = () => {
      const s = parseSearch()
      if (s.rung != null) {
        const n = Number(s.rung)
        if (Number.isInteger(n) && n >= 0 && n < 5) setRungIdx(n)
      }
      if (s.conditions === 'optimist' || s.conditions === 'neutral' || s.conditions === 'stress') {
        setConditions(s.conditions)
      }
      if (['charts','params','kpis','pov','diagnostics'].includes(s.tab)) setTab(s.tab)
      if (s.mode === 'simple' || s.mode === 'advanced') setParamMode(s.mode)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [setRungIdx, setConditions, setTab, setParamMode])
}
