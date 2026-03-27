import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SimplifiedView from './SimplifiedView.jsx'
import './App.css'

function Router() {
  const getView = () => window.location.hash === '#simple' ? 'simple' : 'expert'
  const [view, setView] = useState(getView)

  useEffect(() => {
    const handler = () => setView(getView())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if (view === 'simple') return <SimplifiedView />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
