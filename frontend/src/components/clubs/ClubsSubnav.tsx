import React from 'react'
import { NavLink } from 'react-router-dom'
import { CLUBS_SECTIONS } from '../../config/clubsSections'

/* #1556 — `/clubs` secondary route-nav, mirroring DistrictSubnav (ADR-005 §3):
   a lateral nav of REAL sibling routes, `nav[aria-label]` of its own,
   aria-current on the ACTIVE route, rendered on the hub AND every race page.

   Reuses the district-subnav classes: they are the app's one "secondary
   route-nav" primitive (horizontal-scroll link row, 44px targets, active =
   colour AND bottom rule), and a second copy would drift. */

export const ClubsSubnav: React.FC = () => (
  <nav
    aria-label="Clubs worldwide sections"
    className="district-subnav clubs-subnav"
    data-testid="clubs-subnav"
  >
    <ul className="district-subnav__list">
      {CLUBS_SECTIONS.map(({ label, path, end }) => (
        <li key={path} className="district-subnav__item">
          <NavLink to={path} end={end} className="district-subnav__link">
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
)

export default ClubsSubnav
