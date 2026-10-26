import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PHONE_SECTION_BAR_QUERY } from '../../config/districtSections'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { fadeEdgeAttrs, useSubnavScroll } from '../../hooks/useSubnavScroll'
import { SectionBar } from '../SectionBar'
import {
  AwardIcon,
  ClubsIcon,
  GlobeIcon,
  MapIcon,
  TrendsIcon,
} from '../SectionBarIcons'

/* RegionSubnav (#1815) — Rankings / Health & compliance / Club growth
   (#1812, #1813) / Club survival (#1818) / Club map (#1808, #1809) /
   Education (#1810, #1811) / Meetings (#1814, named like the district
   section) for `/regions` and `/region/:n`. Real sibling routes (ADR-005), not tabs: the back button,
   deep links and the page's `?py=` / `?date=` all survive the switch.
   Reuses the app's one secondary route-nav primitive (the district-subnav
   classes), like ClubsSubnav. On an upright phone it is the shared bottom
   SectionBar (#1832), so the page's content starts right under the context
   bar (375 gate: first content ≤ 110px). */

const KEPT_PARAMS = ['py', 'date'] as const

interface RegionLink {
  label: string
  to: string
  end: boolean
  icon?: React.ReactNode
  /** Short label when the section sits directly in the phone bar (#2318). */
  bar?: string
}

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
  // `bar`: the short label of a section shown directly in the phone bar
  // (#2318); the rest go under More there.
  const links: RegionLink[] = [
    {
      label: 'Rankings',
      bar: 'Rankings',
      to: `${base}${qs}`,
      end: true,
      icon: <TrendsIcon />,
    },
    {
      label: 'Health & compliance',
      bar: 'Health',
      to: `${base}/health${qs}`,
      end: false,
      icon: <GlobeIcon />,
    },
    {
      label: 'Club growth',
      bar: 'Growth',
      to: `${base}/growth${qs}`,
      end: true,
      icon: <ClubsIcon />,
    },
    {
      label: 'Club survival',
      to: `${base}/growth/survival${qs}`,
      end: false,
      icon: <ClubsIcon />,
    },
    // The club map: a region's (#1808) or the world's (#1809).
    {
      label: 'Club map',
      bar: 'Map',
      to: `${base}/map${qs}`,
      end: false,
      icon: <MapIcon />,
    },
    // Education: a region's (#1810) and the world's (#1811).
    {
      label: 'Education',
      to: `${base}/education${qs}`,
      end: false,
      icon: <AwardIcon />,
    },
  ]
  // Meetings (#1814), region and world. On a phone it is the first
  // section under More, so the bar keeps its existing primaries.
  const meetings = {
    label: 'Meetings',
    to: `${base}/meetings${qs}`,
    end: false,
  }
  // Officer training (#2296): a region's districts compared. Region only —
  // there is no world view of it — and under More on a phone.
  const extra = base.startsWith('/region/')
    ? [
        meetings,
        {
          label: 'Officer training',
          to: `${base}/training${qs}`,
          end: false,
        },
      ]
    : [meetings]
  const phone = useMediaQuery(PHONE_SECTION_BAR_QUERY)
  if (phone) {
    // #2318 — the bar does not scroll: it holds four sections plus More,
    // like the district's. Six primaries ran past the right edge at 390,
    // so Club map was cut and Education onward could not be tapped. The
    // bar uses short labels (the sheet and the row keep the full names);
    // Club survival, Education, Meetings and Officer training move to More,
    // which carries the active state when the current page is one of them.
    const primary = links.flatMap(({ bar, ...l }) =>
      bar ? [{ ...l, label: bar }] : []
    )
    const more = links.flatMap(({ bar, label: l, to, end }) =>
      bar ? [] : [{ label: l, to, end }]
    )
    return (
      <SectionBar
        label={label}
        primary={primary}
        more={[...more, ...extra]}
        testId="region-section-bar"
      />
    )
  }
  return <RegionSectionRow label={label} links={[...links, ...extra]} />
}

/* ≥768 and landscape: the shared scroll-row. Eight links overflow a 768
   row, so it centres the active link and draws the edge fades like the
   district row (#1829, #2318). */
const RegionSectionRow: React.FC<{
  label: string
  links: readonly RegionLink[]
}> = ({ label, links }) => {
  const { ref, edges } = useSubnavScroll<HTMLElement>()
  return (
    <nav
      ref={ref}
      aria-label={label}
      className="district-subnav region-subnav"
      data-testid="region-subnav"
      {...fadeEdgeAttrs(edges)}
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
