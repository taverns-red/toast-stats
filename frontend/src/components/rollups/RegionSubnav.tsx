import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PHONE_SECTION_BAR_QUERY } from '../../config/districtSections'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { SectionBar } from '../SectionBar'
import { ClubsIcon, GlobeIcon, MapIcon, TrendsIcon } from '../SectionBarIcons'

/* RegionSubnav (#1815) — Rankings / Health & compliance / Club survival
   (#1818) for `/regions` and `/region/:n`. Real sibling routes (ADR-005), not tabs: the back button,
   deep links and the page's `?py=` / `?date=` all survive the switch.
   Reuses the app's one secondary route-nav primitive (the district-subnav
   classes), like ClubsSubnav. On an upright phone it is the shared bottom
   SectionBar (#1832), so the page's content starts right under the context
   bar (375 gate: first content ≤ 110px). */

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
    { label: 'Rankings', to: `${base}${qs}`, end: true, icon: <TrendsIcon /> },
    {
      label: 'Health & compliance',
      to: `${base}/health${qs}`,
      end: false,
      icon: <GlobeIcon />,
    },
    {
      label: 'Club survival',
      to: `${base}/growth/survival${qs}`,
      end: false,
      icon: <ClubsIcon />,
    },
    // A region's club map (#1808); the all-regions explorer is #1809.
    ...(base.startsWith('/region/')
      ? [
          {
            label: 'Club map',
            to: `${base}/map${qs}`,
            end: false,
            icon: <MapIcon />,
          },
        ]
      : []),
  ]
  const phone = useMediaQuery(PHONE_SECTION_BAR_QUERY)
  if (phone) {
    return (
      <SectionBar
        label={label}
        primary={links}
        more={[]}
        testId="region-section-bar"
      />
    )
  }
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
