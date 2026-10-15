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
}

/* ADR-005 §2 + epic #674 AC1 require every item to be a REAL route — a
   destination-less nav item is the exact tab-like fiction the no-tabs decision
   rejects. `/trends` and `/analytics` joined in Sprint 6 (#680); order follows
   ADR-005 §3 (Overview · Clubs · Divisions · Trends · Analytics · Rankings).
   This const is the single extension point. */
export const DISTRICT_SECTIONS: readonly DistrictSection[] = [
  { label: 'Overview', segment: '' },
  // 'What Changed' (#793, epic #797) — a real route, sits next to Overview as
  // the "since I last looked" companion to the current-state hub.
  { label: 'What Changed', segment: 'changes' },
  { label: 'Clubs', segment: 'clubs' },
  { label: 'Divisions', segment: 'divisions' },
  // 'Grid' (#1230, epic #1228) — the at-a-glance Chiclet/LEO board, one
  // colour-coded tile per club. Sits after Divisions as the dense
  // whole-district companion to the division/area breakdown.
  { label: 'Grid', segment: 'grid' },
  // 'Map' (#1784, epic #1781) — where the clubs are, pins coloured by health
  // (default), Distinguished level, division or area. Beside Grid: the same
  // whole-district view, laid out geographically.
  { label: 'Map', segment: 'map' },
  // 'Growth' (#1794, epic #1781) — the Club Growth funnel: prospective →
  // chartered → coached → suspended. After Map: another whole-district view,
  // before the time-series sections.
  { label: 'Growth', segment: 'growth' },
  // 'Education' (#1793, epic #1781) — education awards this program year to
  // date, from the ledger. After Growth: the last whole-district view before
  // the time-series sections.
  { label: 'Education', segment: 'education' },
  // 'Survival' (#1817, epic #1781) — charter cohort survival: of the clubs
  // chartered here each program year, how many are still active years later
  // (moved clubs count). After Education: the bridge into the multi-year
  // sections.
  { label: 'Survival', segment: 'survival' },
  { label: 'Trends', segment: 'trends' },
  { label: 'Analytics', segment: 'analytics' },
  { label: 'Rankings', segment: 'rankings' },
  // 'Action List' (#1231, epic #1228) — the area-director "what to do next"
  // destination (close-to-Distinguished gaps, missing club visits, clubs needing
  // intervention). Last in the strip: a task view, not a lateral data view.
  { label: 'Action List', segment: 'action-list' },
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
