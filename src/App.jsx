import useHashNavigation from './hooks/useHashNavigation.js'
import Navigation from './components/Navigation.jsx'
import IntroPage from './pages/IntroPage.jsx'
import SimplifiedView from './pages/SimplifiedView.jsx'
import HypothesesPage from './pages/HypothesesPage.jsx'
import TransitionWalkthrough from './pages/TransitionWalkthrough.jsx'
import SimulatorPage from './pages/SimulatorPage.jsx'

export default function App() {
  const { currentPage, navigateTo } = useHashNavigation('simulateur')

  return (
    <div className="app">
      <header className="header">
        <h1>CapiModel — Transition Retraites PAYG → Capitalisation</h1>
        <p className="subtitle">Simulateur</p>
      </header>

      <Navigation currentPage={currentPage} navigateTo={navigateTo} />

      {currentPage === 'intro' && <IntroPage navigateTo={navigateTo} />}
      {currentPage === 'simple' && <SimplifiedView navigateTo={navigateTo} />}
      {currentPage === 'walkthrough' && <TransitionWalkthrough navigateTo={navigateTo} />}
      {currentPage === 'hypotheses' && <HypothesesPage />}
      {currentPage === 'simulateur' && <SimulatorPage navigateTo={navigateTo} />}

      <footer className="footer">
        CapiModel · Spec @c466e6b ·
        <a href="https://github.com/alles-delenda-est/CapiModel" style={{ color: 'var(--color-primary-light)', marginLeft: 4 }}>Source</a>
      </footer>
    </div>
  )
}
