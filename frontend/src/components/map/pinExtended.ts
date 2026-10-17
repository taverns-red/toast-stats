/**
 * Extended pin colour modes (#1787, spec §4.2): TI club status, members,
 * net growth, DCP goals and club age — all from fields already on each
 * `ClubTrend`, so no extra fetch. The reports-sidecar modes (renewals, CSP,
 * officer list, coach, awards) live in `pinReports`, and the meeting modes
 * (day, attendance) in `pinMeeting`. Split from `pinModes` like `pinTerritory`:
 * the page loads it after its first render, keeping the map route's first
 * load inside its budget.
 *
 * Every mode has a non-colour channel (status shapes, fill level or
 * direction) and a category in words, and a missing source value is "Not
 * available for this date" (◌), never a false 0 or "No change".
 */
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { getClubAnniversary } from '../../utils/clubAnniversary'
import {
  EXTENDED_FACET_PARAMS,
  SUSPENDED,
  facetValues,
  withSuspended,
  type ExtendedMode,
  type ModeModel,
  type PinCategory,
  type PinShape,
} from './pinModes'
import {
  NOT_AVAILABLE,
  SEQUENTIAL5,
  isReportsMode,
  reportsModel,
  type ReportsMode,
} from './pinReports'
import { isMeetingMode, meetingModel, type MeetingPinMode } from './pinMeeting'

export { EXTENDED_FACET_PARAMS, NOT_AVAILABLE, SEQUENTIAL5 }

/** TI operational status (spec §3.3 `status`). */
export const STATUS_FILLS = {
  Active: '#2B6FB0',
  Low: '#E0A030',
  Ineligible: '#C93D3D',
  Suspended: SUSPENDED.fill,
} as const

/** Decline → growth, peaking at "no change" (spec §3.3 `diverging5`). */
export const DIVERGING5 = [
  '#B2182B',
  '#EF8A62',
  '#D9D6D0',
  '#67A9CF',
  '#2166AC',
] as const

const LEVELS: PinShape[] = ['fill0', 'fill25', 'fill50', 'fill75', 'fill100']
const DIRECTIONS: PinShape[] = ['down', 'downHalf', 'circle', 'upHalf', 'up']

interface Bins {
  title: string
  keys: string[]
  labels: string[]
  fills: readonly string[]
  shapes: PinShape[]
  /** Bin index for a club, or null when its source value is missing. */
  bin(club: ClubTrend, date: string): number | null
}

const latestMembers = (c: ClubTrend) =>
  c.membershipTrend[c.membershipTrend.length - 1]?.count

/** Index of the first upper bound the value is under (the last bin if none). */
const binOf = (v: number, upper: number[]) => {
  const i = upper.findIndex(u => v < u)
  return i < 0 ? upper.length : i
}

const BINS: Record<
  Exclude<ExtendedMode, 'status' | ReportsMode | MeetingPinMode>,
  Bins
> = {
  size: {
    title: 'Members',
    keys: ['0-7', '8-11', '12-19', '20-29', '30plus'],
    labels: [
      '0–7 members',
      '8–11 members',
      '12–19 members',
      '20–29 members',
      '30 or more members',
    ],
    fills: SEQUENTIAL5,
    shapes: LEVELS,
    bin: c => {
      const n = latestMembers(c)
      return n === undefined ? null : binOf(n, [8, 12, 20, 30])
    },
  },
  growth: {
    title: 'Net growth since 1 July',
    keys: ['down5', 'down1', 'none', 'up1', 'up3'],
    labels: [
      'Down 5 or more',
      'Down 1 to 4',
      'No change',
      'Up 1 to 2',
      'Up 3 or more',
    ],
    fills: DIVERGING5,
    shapes: DIRECTIONS,
    bin: c => {
      const n = latestMembers(c)
      if (n === undefined || c.membershipBase == null) return null
      return binOf(n - c.membershipBase, [-4, 0, 1, 3])
    },
  },
  dcp: {
    title: 'DCP goals met',
    keys: ['0-2', '3-4', '5-6', '7-8', '9-10'],
    labels: ['0–2 goals', '3–4 goals', '5–6 goals', '7–8 goals', '9–10 goals'],
    fills: SEQUENTIAL5,
    shapes: LEVELS,
    bin: c => {
      const n = c.dcpGoalsTrend[c.dcpGoalsTrend.length - 1]?.goalsAchieved
      return n === undefined ? null : binOf(n, [3, 5, 7, 9])
    },
  },
  age: {
    title: 'Club age',
    keys: ['lt1', '1-2', '3-9', '10-24', '25plus'],
    labels: [
      'Under 1 year old',
      '1–2 years old',
      '3–9 years old',
      '10–24 years old',
      '25 years or more',
    ],
    // Reversed, so the newest clubs are the darkest (spec §4.2).
    fills: [...SEQUENTIAL5].reverse(),
    shapes: LEVELS,
    bin: (c, date) => {
      if (!c.charterDate || !date) return null
      const years = getClubAnniversary(
        c.charterDate,
        new Date(`${date}T00:00:00Z`)
      )?.years
      return years === undefined ? null : binOf(years, [1, 3, 10, 25])
    },
  },
}

const STATUS_CATS: PinCategory[] = [
  {
    key: 'Active',
    label: 'Active',
    fill: STATUS_FILLS.Active,
    shape: 'circle',
  },
  { key: 'Low', label: 'Low', fill: STATUS_FILLS.Low, shape: 'triangle' },
  {
    key: 'Ineligible',
    label: 'Ineligible',
    fill: STATUS_FILLS.Ineligible,
    shape: 'square',
  },
  SUSPENDED,
  NOT_AVAILABLE,
]

/** The read-time renewal overlay first, then the frozen base (Lesson 172). */
function statusCategory(c: ClubTrend): PinCategory {
  const raw = (c.statusOverlay?.status ?? c.clubStatus ?? '').toLowerCase()
  return STATUS_CATS.find(cat => cat.key.toLowerCase() === raw) ?? NOT_AVAILABLE
}

/** `date` is the viewed snapshot date and `reports` its sidecar, both passed
 *  down by the page (R3). `clubs` is every club in scope: the meeting modes
 *  read from it whether the date carries schedules at all. */
export function extendedModel(
  mode: ExtendedMode,
  date: string,
  reports?: DistrictReportsDataset | null,
  clubs?: readonly ClubTrend[]
): ModeModel {
  if (isReportsMode(mode)) return reportsModel(mode, date, reports)
  if (isMeetingMode(mode)) return meetingModel(mode, date, clubs)
  if (mode === 'status') {
    return {
      mode,
      title: 'TI club status',
      kind: 'status',
      categories: STATUS_CATS,
      categoryOf: statusCategory,
      isDashed: () => false,
      facet: { param: 'clubStatus', valueOf: cat => cat.key },
      exceptionKey: 'Ineligible',
    }
  }
  const b = BINS[mode]
  const categories: PinCategory[] = b.keys.map((key, i) => ({
    key,
    label: b.labels[i]!,
    fill: b.fills[i]!,
    shape: b.shapes[i]!,
  }))
  categories.push(NOT_AVAILABLE, SUSPENDED)
  return {
    mode,
    title: b.title,
    kind: 'ordinal',
    categories,
    categoryOf: withSuspended(c => {
      const i = b.bin(c, date)
      return i === null ? NOT_AVAILABLE : categories[i]!
    }),
    isDashed: () => false,
    facet: { param: mode, valueOf: cat => cat.key },
  }
}

/** Apply every extended legend key in the URL (AND across, OR within). */
export function applyExtendedFacets(
  clubs: readonly ClubTrend[],
  params: URLSearchParams,
  date: string,
  reports?: DistrictReportsDataset | null
): ClubTrend[] {
  let out = [...clubs]
  for (const param of EXTENDED_FACET_PARAMS) {
    const wanted = new Set(facetValues(params, param))
    if (wanted.size === 0) continue
    const model = extendedModel(
      param === 'clubStatus' ? 'status' : param,
      date,
      reports,
      clubs
    )
    out = out.filter(c => wanted.has(model.categoryOf(c).key))
  }
  return out
}
