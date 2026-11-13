/**
 * Clubs table column metadata (#2676, spec §4.1).
 *
 * One record per column: the Columns-menu group, the full name and hint shown
 * there, the fixed width in px, and whether it is on by default at each
 * breakpoint tier. This is the single place the per-tier defaults live. The
 * table never hides a column with CSS: `useColumnVisibility` turns these
 * defaults plus the user's overrides into TanStack's `columnVisibility`, so a
 * hidden column is absent from the DOM.
 *
 * The filter subsystem keeps its own metadata in `filters/types.ts`
 * (ADR-006: the column model and the filter model are separate concerns).
 * `clubsColumnMeta.test.ts` keeps this record in step with `clubsColumns`.
 */

import { PROGRAM_YEAR_START_BASIS } from '../utils/netChangeBasis'

export type BreakpointTier = 'tablet' | 'laptop' | 'desktop' | 'wide'

/** Tiers from narrowest to widest. */
export const BREAKPOINT_TIERS: readonly BreakpointTier[] = [
  'tablet',
  'laptop',
  'desktop',
  'wide',
]

export type ColumnChooserGroup =
  | 'club'
  | 'health'
  | 'membership'
  | 'renewals'
  | 'recognition'
  | 'comparison'
  | 'changes'

/** Groups as the Columns menu lists them, in order. */
export const CHOOSER_GROUPS: readonly {
  id: ColumnChooserGroup
  label: string
}[] = [
  { id: 'club', label: 'Club' },
  { id: 'health', label: 'Health' },
  { id: 'membership', label: 'Membership' },
  { id: 'renewals', label: 'Renewals' },
  { id: 'recognition', label: 'Recognition' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'changes', label: 'Changes' },
]

export interface ClubColumnMeta {
  group: ColumnChooserGroup
  /** Full column name for the Columns menu. */
  label: string
  /** One-line hint under the label, so terse headers need no tooltip. */
  hint: string
  /** Fixed width in px, including 8px padding per side. Club takes the rest. */
  size: number
  defaultVisible: Readonly<Record<BreakpointTier, boolean>>
}

/** Usable table width per tier: `min(viewport, 1600) - 86px` (spec §4.1),
 *  with 17px off the 1280 tier for a classic Windows scrollbar. */
export const TIER_BUDGET_PX: Readonly<Record<BreakpointTier, number>> = {
  tablet: 682,
  laptop: 938,
  desktop: 1177,
  wide: 1514,
}

/** The Club column has no fixed width; it never gets less than this. */
export const NAME_MIN_SIZE = 180

/** Shown from this tier up. */
const from = (first: BreakpointTier): Record<BreakpointTier, boolean> => {
  const at = BREAKPOINT_TIERS.indexOf(first)
  return {
    tablet: at <= 0,
    laptop: at <= 1,
    desktop: at <= 2,
    wide: at <= 3,
  }
}

const never: Record<BreakpointTier, boolean> = {
  tablet: false,
  laptop: false,
  desktop: false,
  wide: false,
}

export const columnMeta: Readonly<Record<string, ClubColumnMeta>> = {
  name: {
    group: 'club',
    label: 'Club',
    hint: 'The club name and a link to its page',
    size: NAME_MIN_SIZE,
    defaultVisible: from('tablet'),
  },
  division: {
    group: 'club',
    label: 'Division',
    hint: 'The division letter',
    size: 72,
    defaultVisible: from('laptop'),
  },
  area: {
    group: 'club',
    label: 'Area',
    hint: 'The area number within the division',
    size: 56,
    defaultVisible: from('laptop'),
  },
  status: {
    group: 'health',
    label: 'Health',
    hint: 'Intervention required, Vulnerable or Thriving',
    size: 132,
    defaultVisible: from('tablet'),
  },
  membership: {
    group: 'membership',
    label: 'Members',
    hint: 'Members now, then the membership base',
    size: 96,
    defaultVisible: from('tablet'),
  },
  netChange: {
    group: 'membership',
    label: 'Trend',
    hint: `Change in members ${PROGRAM_YEAR_START_BASIS}, with a sparkline`,
    size: 104,
    defaultVisible: from('laptop'),
  },
  membersNeeded: {
    group: 'membership',
    label: 'Needed',
    hint: 'Members needed to reach 20',
    size: 72,
    defaultVisible: from('laptop'),
  },
  newMembers: {
    group: 'membership',
    label: 'New members',
    hint: 'New members this program year',
    size: 56,
    defaultVisible: from('wide'),
  },
  octoberRenewals: {
    group: 'renewals',
    label: 'October renewals',
    hint: 'Members who renewed in the October window',
    size: 72,
    defaultVisible: from('wide'),
  },
  aprilRenewals: {
    group: 'renewals',
    label: 'April renewals',
    hint: 'Members who renewed in the April window',
    size: 72,
    defaultVisible: from('wide'),
  },
  dcpGoals: {
    group: 'recognition',
    label: 'DCP goals',
    hint: 'Distinguished Club Program goals met, out of 10',
    size: 88,
    defaultVisible: from('tablet'),
  },
  distinguished: {
    group: 'recognition',
    label: 'Tier',
    hint: 'Distinguished tier; provisional until April renewals are recorded',
    size: 124,
    defaultVisible: from('tablet'),
  },
  clubStatus: {
    group: 'health',
    label: 'Club status',
    hint: 'Active, Suspended or Ineligible from Toastmasters International',
    size: 104,
    defaultVisible: from('desktop'),
  },
  coach: {
    group: 'club',
    label: 'Coach',
    hint: 'Whether the club has an active or completed coach',
    size: 92,
    defaultVisible: from('desktop'),
  },
  yearsChartered: {
    group: 'club',
    label: 'Years chartered',
    hint: 'Years since the club chartered',
    size: 64,
    defaultVisible: from('wide'),
  },
  // Follows the `?since=` preset, not a stored preference (spec §4.3).
  sinceLastYear: {
    group: 'comparison',
    label: 'vs last year',
    hint: 'DCP goals now against the same point last year',
    size: 144,
    defaultVisible: never,
  },
  // The opt-in Changes columns, offered only when a snapshot diff is loaded.
  deltaMembership: {
    group: 'changes',
    label: 'Δ Members',
    hint: 'Change in members between the two dates',
    size: 88,
    defaultVisible: never,
  },
  deltaPayments: {
    group: 'changes',
    label: 'Δ Payments',
    hint: 'Change in payments between the two dates',
    size: 96,
    defaultVisible: never,
  },
  deltaDcpGoals: {
    group: 'changes',
    label: 'Δ DCP',
    hint: 'Change in DCP goals between the two dates',
    size: 72,
    defaultVisible: never,
  },
  tierTransition: {
    group: 'changes',
    label: 'Tier change',
    hint: 'The tier at each date, when it changed',
    size: 140,
    defaultVisible: never,
  },
  distinguishedFlip: {
    group: 'changes',
    label: 'Distinguished?',
    hint: 'Whether the club gained or lost Distinguished status',
    size: 150,
    defaultVisible: never,
  },
}

/** The 15 base columns, in table order. */
export const BASE_COLUMN_IDS: readonly string[] = [
  'name',
  'division',
  'area',
  'status',
  'membership',
  'netChange',
  'membersNeeded',
  'newMembers',
  'octoberRenewals',
  'aprilRenewals',
  'dcpGoals',
  'distinguished',
  'clubStatus',
  'coach',
  'yearsChartered',
]

/** The opt-in Changes columns (a snapshot diff must be loaded). */
export const CHANGES_COLUMN_IDS: readonly string[] = [
  'deltaMembership',
  'deltaPayments',
  'deltaDcpGoals',
  'tierTransition',
  'distinguishedFlip',
]

export const SINCE_COLUMN_ID = 'sinceLastYear'

/** The Club column is the row's label: it is always shown. */
export const ALWAYS_SHOWN_COLUMN_ID = 'name'

/** Every column's default visibility at `tier`. */
export const tierDefaults = (tier: BreakpointTier): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(columnMeta).map(([id, m]) => [id, m.defaultVisible[tier]])
  )

/**
 * Every column's width as TanStack's `columnSizing` state (#2676, spec §5.3).
 * The table's `getSize()` reads it, so the colgroup and the table's min-width
 * use the figures in spec §4.1 without touching any column def. Club is
 * flexible: its entry is its minimum, and the colgroup leaves its `<col>`
 * unsized so it takes the rest.
 */
export const COLUMN_SIZING: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(columnMeta).map(([id, meta]) => [id, meta.size])
  )
