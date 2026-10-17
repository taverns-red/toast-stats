import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

/* RegionSubnav (#1815) — Rankings / Health & compliance for `/regions` and
   `/region/:n`. Real sibling routes (ADR-005), not tabs: the back button,
   deep links and the page's `?py=` / `?date=` all survive the switch.
   Reuses the app's one secondary route-nav primitive (the district-subnav
   classes), like ClubsSubnav; two links fit a 375 px row, so there is no
   bottom-bar variant. */

const KEPT_PARAMS = ['py', 'date'] as const

export const RegionSubnav: React.FC<{
  /** `/regions` or `/region/07`. */
  base: string
  label: string
}> = ({ base, label }) => {
  const { search } = useLocation()
  const current = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const key of KEPT_PARAMS) {
    const value = current.get(key)
    if (value) kept.set(key, value)
  }
  const qs = kept.toString() ? `?${kept.toString()}` : ''
  const links = [
    { label: 'Rankings', to: `${base}${qs}`, end: true },
    { label: 'Health & compliance', to: `${base}/health${qs}`, end: false },
  ]
  return (
    <nav
      aria-label={label}
      className="district-subnav region-subnav"
      data-testid="region-subnav"
    >
      <ul className="district-subnav__list">
        {links.map(l => (
          <li key={l.label} className="district-subnav__item">
            <NavLink to={l.to} end={l.end} className="district-subnav__link">
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default RegionSubnav
