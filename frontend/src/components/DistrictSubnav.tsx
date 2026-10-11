import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  DISTRICT_BAR_PRIMARY_SEGMENTS,
  DISTRICT_SECTIONS,
  PHONE_SECTION_BAR_QUERY,
  buildDistrictSectionUrl,
  type DistrictSection,
} from '../config/districtSections'
import { fadeEdgeAttrs, useSubnavScroll } from '../hooks/useSubnavScroll'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SectionBar, type SectionBarItem } from './SectionBar'
import {
  ClubsIcon,
  DivisionsIcon,
  OverviewIcon,
  TrendsIcon,
} from './SectionBarIcons'

/* #678 (epic #674 Sprint 4) — District secondary route-nav primitive.

   ADR-005 decision 3: a NEW lateral section-nav, deliberately DISTINCT from
   `SubpageBreadcrumb` (#577 / Lesson 085). They are different affordances with
   different ARIA contracts and must not be conflated:
     - Breadcrumb = vertical hierarchy ("where am I": District 61 › Clubs),
       `nav[aria-label="Breadcrumb"]`, aria-current on the LAST crumb,
       landing-opt-OUT.
     - Subnav    = lateral view-switching ("jump to a sibling view"),
       `nav[aria-label="District sections"]`, aria-current on the ACTIVE route,
       landing-opt-IN (renders on the hub AND every flat sub-page).

   The leaf ClubDetailPage is NOT a sibling section view — it keeps its full
   breadcrumb trail and does NOT get the subnav.

   Mobile: a horizontally-scrollable link ROW at all widths (ADR §3 / handoff
   §126), NOT a <select> — keeping the sibling views visible preserves the
   "every item is a visible route" intent. The links are natively focusable, so
   keyboard users tab through them (the focused link scrolls into view); the
   scroll container needs no role="region" (cf. Lesson 105, which applies to
   non-focusable table scrolls). */

/* The canonical section list (`DISTRICT_SECTIONS`) and its URL builder now live
   in `config/districtSections` — the single source of truth shared with the
   route-aware error recovery (#1012), so a util no longer imports from this
   component. */

interface DistrictSubnavProps {
  districtId: string
}

const BAR_ICONS: Record<string, React.ReactNode> = {
  '': <OverviewIcon />,
  clubs: <ClubsIcon />,
  divisions: <DivisionsIcon />,
  trends: <TrendsIcon />,
}

/* #1832 — on a phone held upright the sections are a bottom bar (4 + More)
   instead of the scroll-row. A JS media switch, not two CSS-toggled navs, so
   only one "District sections" landmark is ever in the DOM. */
export const DistrictSubnav: React.FC<DistrictSubnavProps> = ({
  districtId,
}) => {
  const phone = useMediaQuery(PHONE_SECTION_BAR_QUERY)
  return phone ? (
    <DistrictSectionBar districtId={districtId} />
  ) : (
    <DistrictSectionRow districtId={districtId} />
  )
}

const DistrictSectionBar: React.FC<DistrictSubnavProps> = ({ districtId }) => {
  const toItem = ({ label, segment }: DistrictSection): SectionBarItem => ({
    label,
    to: buildDistrictSectionUrl(districtId, segment),
    end: segment === '',
    icon: BAR_ICONS[segment],
  })
  const primary = DISTRICT_BAR_PRIMARY_SEGMENTS.flatMap(segment =>
    DISTRICT_SECTIONS.filter(s => s.segment === segment).map(toItem)
  )
  const more = DISTRICT_SECTIONS.filter(
    s => !DISTRICT_BAR_PRIMARY_SEGMENTS.includes(s.segment)
  ).map(toItem)
  return (
    <SectionBar
      label="District sections"
      primary={primary}
      more={more}
      testId="district-section-bar"
    />
  )
}

const DistrictSectionRow: React.FC<DistrictSubnavProps> = ({ districtId }) => {
  // #1829 — keep the active link in view + flag edges for the fade cues.
  const { ref, edges } = useSubnavScroll<HTMLElement>()
  return (
    <nav
      ref={ref}
      aria-label="District sections"
      className="district-subnav"
      data-testid="district-subnav"
      {...fadeEdgeAttrs(edges)}
    >
      <ul className="district-subnav__list">
        {DISTRICT_SECTIONS.map(({ label, segment }) => {
          const to = buildDistrictSectionUrl(districtId, segment)
          return (
            <li key={label} className="district-subnav__item">
              <NavLink
                to={to}
                // `end` so Overview is active ONLY at the exact hub URL, not on
                // every /district/:id/* sub-route (NavLink prefix-matches).
                end={segment === ''}
                className="district-subnav__link"
              >
                {label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default DistrictSubnav
