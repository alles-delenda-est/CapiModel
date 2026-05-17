import './Navigation.css'

const TABS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'simple', label: 'Version simple' },
  { id: 'walkthrough', label: 'Parcours' },
  { id: 'simulateur', label: 'Simulateur' },
  { id: 'hypotheses', label: 'Hypothèses et sources' },
]

export default function Navigation({ currentPage, navigateTo }) {
  return (
    <nav className="nav-tabs" role="tablist">
      {TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={currentPage === tab.id}
          className={`nav-tab ${currentPage === tab.id ? 'active' : ''}`}
          onClick={() => navigateTo(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
