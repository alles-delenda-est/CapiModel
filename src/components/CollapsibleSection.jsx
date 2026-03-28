import { useState } from 'react'
import './CollapsibleSection.css'

/**
 * Collapsible parameter group with visual priority levels.
 *
 * Props:
 *   title       — section heading
 *   level       — 'critical' | 'normal' | 'advanced' (controls color + badge)
 *   defaultOpen — whether section starts expanded (default: false)
 *   children    — slider/toggle content
 */
export default function CollapsibleSection({
  title,
  level = 'normal',
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`cs-section cs-${level}`}>
      <div
        className="cs-header"
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}
      >
        <span className={`cs-arrow ${open ? 'open' : ''}`}>{'\u25B6'}</span>
        <h3 className="cs-title">{title}</h3>
        {level === 'critical' && <span className="cs-badge cs-badge-critical">Critique</span>}
        {level === 'advanced' && <span className="cs-badge cs-badge-advanced">Avancé</span>}
      </div>
      <div className={`cs-body ${open ? 'cs-open' : 'cs-closed'}`}>
        <div className="cs-content">
          {children}
        </div>
      </div>
    </div>
  )
}
