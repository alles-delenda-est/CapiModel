import { useState, useEffect, useCallback } from 'react'

const PAGES = new Set(['intro', 'simple', 'simulateur', 'hypotheses'])

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const path = raw.split('?')[0]
  return PAGES.has(path) ? path : 'simulateur'
}

export default function useHashNavigation(defaultPage = 'simulateur') {
  const [currentPage, setCurrentPage] = useState(() => {
    if (!window.location.hash) return defaultPage
    return parseHash()
  })

  useEffect(() => {
    const onHashChange = () => setCurrentPage(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigateTo = useCallback((page) => {
    if (!PAGES.has(page)) {
      console.warn(`useHashNavigation: unknown page "${page}"`)
      return
    }
    // Preserve query string when navigating to the same page; clear it on a
    // different page (per-page state should not leak across).
    const currentPath = parseHash()
    const currentSearch = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?'))
      : ''
    window.location.hash = `#/${page}${page === currentPath ? currentSearch : ''}`
  }, [])

  return { currentPage, navigateTo }
}
