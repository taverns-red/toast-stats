import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  CLUBS_BAR_PRIMARY_PATHS,
  CLUBS_SECTIONS,
  type ClubsSection,
} from '../../config/clubsSections'
import { PHONE_SECTION_BAR_QUERY } from '../../config/districtSections'
import { fadeEdgeAttrs, useSubnavScroll } from '../../hooks/useSubnavScroll'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { SectionBar, type SectionBarItem } from '../SectionBar'
import { AwardIcon, GlobeIcon, StarIcon } from '../SectionBarIcons'

/* #1556 — `/clubs` secondary route-nav, mirroring DistrictSubnav (ADR-005 §3):
   a lateral nav of REAL sibling routes, `nav[aria-label]` of its own,
   aria-current on the ACTIVE route, rendered on the hub AND every race page.

   Reuses the district-subnav classes: they are the app's one "secondary
   route-nav" primitive (horizontal-scroll link row, 44px targets, active =
   colour AND bottom rule), and a second copy would drift. */

const BAR_ICONS: readonly React.ReactNode[] = [
  <GlobeIcon key="overview" />,
  <AwardIcon key="distinguished" />,
  <StarIcon key="select" />,
]

/* #1832 — on a phone held upright, the shared bottom SectionBar (3 + More)
   replaces the scroll-row; one landmark in the DOM either way. */
export const ClubsSubnav: React.FC = () => {
  const phone = useMediaQuery(PHONE_SECTION_BAR_QUERY)
  return phone ? <ClubsSectionBar /> : <ClubsSectionRow />
}

const toItem = ({ label, path, end }: ClubsSection): SectionBarItem => ({
  label,
  to: path,
  end,
})

const ClubsSectionBar: React.FC = () => {
  const primary = CLUBS_BAR_PRIMARY_PATHS.flatMap((path, i) =>
    CLUBS_SECTIONS.filter(s => s.path === path).map(s => ({
      ...toItem(s),
      icon: BAR_ICONS[i],
    }))
  )
  const more = CLUBS_SECTIONS.filter(
    s => !CLUBS_BAR_PRIMARY_PATHS.includes(s.path)
  ).map(toItem)
  return (
    <SectionBar
      label="Clubs worldwide sections"
      primary={primary}
      more={more}
      testId="clubs-section-bar"
    />
  )
}

const ClubsSectionRow: React.FC = () => {
  // #1829 — same active-link centring + fade cues as DistrictSubnav.
  const { ref, edges } = useSubnavScroll<HTMLElement>()
  return (
    <nav
      ref={ref}
      aria-label="Clubs worldwide sections"
      className="district-subnav clubs-subnav"
      data-testid="clubs-subnav"
      {...fadeEdgeAttrs(edges)}
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
}

export default ClubsSubnav
