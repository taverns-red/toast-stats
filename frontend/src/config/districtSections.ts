/* The canonical, ordered list of district section routes, plus the single
   builder for their URLs. Lives in config (not a component) so both the UI
   that renders the nav (DistrictSubnav) and non-UI consumers (errorRecovery's
   route-aware smart recovery, #1012) share one source of truth without a util
   importing from a component. */

export interface DistrictSection {
  /** Visible label. */
  label: string
  /** Path segment appended after /district/:id. '' = the Overview hub. */
  segment: string
  /**
   * One sentence on what the section shows (#2161): the district header's
   * lede and the phone context sheet's About. Required, so a new section
   * cannot fall back to another page's description.
   */
  about: string
}

/* ADR-005 §2 + epic #674 AC1 require every item to be a REAL route — a
   destination-less nav item is the exact tab-like fiction the no-tabs decision
   rejects. `/trends` joined in Sprint 6 (#680); order follows ADR-005 §3
   (Overview · Clubs · Divisions · Trends · Rankings). `/analytics` joined then
   too and was retired in #2159: its URL now redirects to Clubs sorted by net
   change. This const is the single extension point. */
export const DISTRICT_SECTIONS: readonly DistrictSection[] = [
  {
    label: 'Overview',
    segment: '',
    about:
      'Membership, payments, divisions, and ranking trend for the selected program year.',
  },
  // 'What Changed' (#793, epic #797) — a real route, sits next to Overview as
  // the "since I last looked" companion to the current-state hub.
  {
    label: 'What Changed',
    segment: 'changes',
    about:
      'What changed in this district between two snapshot dates: membership, payments, DCP goals, distinguished status, and clubs added, removed or transferred.',
  },
  {
    label: 'Clubs',
    segment: 'clubs',
    about:
      'Every club in the district, with membership, DCP goals, health and distinguished status. Filter, sort and search.',
  },
  {
    label: 'Divisions',
    segment: 'divisions',
    about:
      'Division and area standings and their progress toward Distinguished.',
  },
  // 'Grid' (#1230, epic #1228) — the at-a-glance Chiclet/LEO board, one
  // colour-coded tile per club. Sits after Divisions as the dense
  // whole-district companion to the division/area breakdown.
  {
    label: 'Grid',
    segment: 'grid',
    about: 'One colour-coded tile per club: the whole district at a glance.',
  },
  // 'Map' (#1784, epic #1781) — where the clubs are, pins coloured by health
  // (default), Distinguished level, division or area. Beside Grid: the same
  // whole-district view, laid out geographically.
  {
    label: 'Map',
    segment: 'map',
    about:
      'Where the clubs are, coloured by health, distinguished level, division or area.',
  },
  // 'Growth' (#1794, epic #1781) — the Club Growth funnel: prospective →
  // chartered → coached → suspended. After Map: another whole-district view,
  // before the time-series sections.
  {
    label: 'Growth',
    segment: 'growth',
    about:
      'The club growth funnel: prospective, chartered, coached and suspended clubs.',
  },
  // 'Education' (#1793, epic #1781) — education awards this program year to
  // date, from the ledger. After Growth: the last whole-district view before
  // the time-series sections.
  {
    label: 'Education',
    segment: 'education',
    about:
      'Education awards this program year to date, by level, path, division and area.',
  },
  // 'Meetings' (#1796, epic #1781) — when the clubs meet: weekday × start
  // hour heatmap, in person / online. After Education: the last
  // whole-district view before the time-series sections.
  {
    label: 'Meetings',
    segment: 'meetings',
    about: 'When the clubs meet: weekday and start hour, in person and online.',
  },
  {
    label: 'Trends',
    segment: 'trends',
    about:
      'Membership and payment trends over the program year, compared with earlier years.',
  },
  {
    label: 'Rankings',
    segment: 'rankings',
    about:
      'Where the district ranks worldwide on paid clubs, payments and distinguished clubs.',
  },
  // 'Action List' (#1231, epic #1228) — the area-director "what to do next"
  // destination (close-to-Distinguished gaps, missing club visits, clubs needing
  // intervention). Last in the strip: a task view, not a lateral data view.
  {
    label: 'Action List',
    segment: 'action-list',
    about:
      'What to do next: clubs close to Distinguished, missing club visits and clubs that need intervention.',
  },
]

/* #1832 (mobile epic #1827, review §5.1) — on a phone held upright the
   sections move to a bottom bar: these four (chosen by real usage), then a
   "More" sheet holding the rest in config order. Landscape phones and ≥768
   keep the full scroll-row. */
export const PHONE_SECTION_BAR_QUERY =
  '(max-width: 767px) and (orientation: portrait)'

/** Segments shown directly in the phone bottom bar, in bar order. */
export const DISTRICT_BAR_PRIMARY_SEGMENTS: readonly string[] = [
  '',
  'clubs',
  'divisions',
  'trends',
]

/** Build the URL for a district section. Empty segment = the Overview hub. */
export function buildDistrictSectionUrl(
  districtId: string,
  segment: string
): string {
  return segment
    ? `/district/${districtId}/${segment}`
    : `/district/${districtId}`
}
