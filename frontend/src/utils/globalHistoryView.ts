/**
 * View model for the `/history` worldwide scoreboard (#1500, epic #1496).
 *
 * Pure — no React — so the one rule that matters most on this surface can be
 * unit-tested directly: **absent is never zero**. `v1/global-history.json`
 * carries three DIFFERENT kinds of null and collapsing them into a blank (or
 * worse, a `0`) publishes a wrong number under our name:
 *
 * | kind | source | reads as |
 * |---|---|---|
 * | `not-applicable` | `distinguishedClubs.smedley` before PY 2025-2026 | the rung was not on the ladder (#1406) |
 * | `not-on-file`    | `education` for a year with no reports set; `totalMembershipMarch31` with no March rollup | we never fetched it |
 * | `forward-only`   | `clubMovement.newClubs` (TI report basis) | the series starts at PY 2026-2027 |
 *
 * Each renders as its own visible marker, never as `—` alone: the operator
 * ruling asks for a dash rather than a zero, and the stricter reading of that
 * ruling — a marker a reader can actually name — is what ships. Every marker
 * carries a full sentence for the tooltip and for screen readers, and the
 * table prints a legend for all three.
 *
 * Labelling here is RULED, not stylistic (#1426, 2026-08-19):
 * - average club size states "June-30 membership ÷ paid clubs" (ruling #3)
 * - the district count is stated with undistricted separate (ruling #4)
 * - the historical new-club series is "new clubs still active at year end",
 *   NEVER plain "new clubs" — that name belongs to the TI report basis, a
 *   different metric that lives in its own row (ruling #5)
 */

import type {
  GlobalHistory,
  GlobalHistoryYear,
} from '@taverns-red/shared-contracts'
import { formatProgramYearShort } from './programYear'

/** The three facts a null can be. Never merge them. */
export type AbsenceKind = 'not-applicable' | 'not-on-file' | 'forward-only'

export interface ScoreboardCell {
  /** Short visible text. Never `0`, never empty. */
  text: string
  /** Present only for an absent value — drives `data-absence` in the DOM. */
  absence?: AbsenceKind
  /** Full sentence for `title` + screen readers. */
  note?: string
}

export interface ScoreboardRow {
  key: string
  label: string
  /** The stated basis, rendered under the label — not a tooltip. */
  basis?: string
  /** Indented sub-row of the metric above it (tier / level breakdowns). */
  indented?: boolean
  cells: ScoreboardCell[]
}

export interface ScoreboardGroup {
  key: string
  title: string
  /** One line of context for the whole group. */
  note?: string
  rows: ScoreboardRow[]
}

export interface ScoreboardModel {
  /** Column headers, newest program year first — e.g. `2025-26`. */
  years: Array<{ programYear: string; label: string; yearEndDate: string }>
  groups: ScoreboardGroup[]
  /**
   * Set when NO year on file carries an education breakdown, so the page can
   * say so instead of silently dropping seven rows.
   */
  educationAbsentEntirely: boolean
}

/** Visible marker text per absence kind — short enough for a numeric column. */
export const ABSENCE_TEXT: Record<AbsenceKind, string> = {
  'not-applicable': 'n/a',
  'not-on-file': 'not on file',
  'forward-only': 'from 2026-27',
}

/** The legend printed under the table, so every marker is nameable. */
export const ABSENCE_LEGEND: ReadonlyArray<{
  kind: AbsenceKind
  text: string
  meaning: string
}> = [
  {
    kind: 'not-applicable',
    text: ABSENCE_TEXT['not-applicable'],
    meaning:
      'Not applicable — the metric did not exist in that program year. It is not zero.',
  },
  {
    kind: 'not-on-file',
    text: ABSENCE_TEXT['not-on-file'],
    meaning:
      'Not on file — we hold no source data for that year. It is not zero.',
  },
  {
    kind: 'forward-only',
    text: ABSENCE_TEXT['forward-only'],
    meaning:
      'The source for this metric starts at program year 2026-2027, so earlier years have no value. It is not zero.',
  },
]

const NUM = new Intl.NumberFormat('en-US')

function value(text: string): ScoreboardCell {
  return { text }
}

function absent(kind: AbsenceKind, note: string): ScoreboardCell {
  return { text: ABSENCE_TEXT[kind], absence: kind, note }
}

/** A count, or a stated absence. Never `0` standing in for "we don't know". */
function count(
  n: number | null,
  kind: AbsenceKind,
  note: string
): ScoreboardCell {
  return n === null ? absent(kind, note) : value(NUM.format(n))
}

/** `2025-2026` → `2025`. Returns NaN-safe fallback text for odd input. */
export function programYearStart(programYear: string): number | null {
  const start = Number.parseInt(programYear.slice(0, 4), 10)
  return Number.isFinite(start) ? start : null
}

export function programYearLabel(programYear: string): string {
  const start = programYearStart(programYear)
  return start === null ? programYear : formatProgramYearShort(start)
}

const SMEDLEY_NOTE =
  'Not applicable — the Smedley Distinguished tier did not exist in this program year, so no club could earn it. This is not zero clubs.'
const EDUCATION_NOTE =
  'Not on file — this program year has no education-award report set here yet. This is not zero awards.'
const MARCH_NOTE =
  'Not on file — no March-31 snapshot was rolled up for this program year. This is not zero members.'
const REPORT_NEW_CLUBS_NOTE =
  "Toastmasters' own New Clubs report is only wired into our pipeline from program year 2026-2027, so this year has no report-basis figure. This is not zero new clubs — see the row above for our own basis."
const MOVEMENT_NOTE =
  'Not on file — the charter/suspension window could not be resolved for this program year. This is not zero clubs.'

function membershipGroup(years: GlobalHistoryYear[]): ScoreboardGroup {
  return {
    key: 'membership',
    title: 'Membership & clubs',
    note: 'Every figure sums the year-end date’s own district set, undistricted (U) included, counting each club once.',
    rows: [
      {
        key: 'total-membership',
        label: 'Total membership',
        basis: 'Active members at June 30 — our primary basis',
        cells: years.map(y => value(NUM.format(y.membership.totalMembership))),
      },
      {
        key: 'total-membership-march31',
        label: 'Total membership (March 31)',
        basis:
          'Toastmasters International publishes its “total membership” on this March 31 basis — carried alongside, never substituted',
        cells: years.map(y =>
          count(y.membership.totalMembershipMarch31, 'not-on-file', MARCH_NOTE)
        ),
      },
      {
        key: 'membership-payments',
        label: 'Membership payments',
        basis: 'Total to date at June 30',
        cells: years.map(y => value(NUM.format(y.membership.totalPayments))),
      },
      {
        key: 'paid-clubs',
        label: 'Paid clubs',
        basis: 'At June 30',
        cells: years.map(y => value(NUM.format(y.membership.paidClubs))),
      },
      {
        key: 'avg-club-size',
        label: 'Average club size',
        basis: 'June-30 membership ÷ paid clubs',
        cells: years.map(y =>
          y.membership.avgClubSize === null
            ? absent(
                'not-on-file',
                'Not on file — no paid-club count to divide by.'
              )
            : value(y.membership.avgClubSize.toFixed(1))
        ),
      },
      {
        key: 'districts',
        label: 'Districts',
        basis:
          'Numbered districts. Undistricted (U) clubs are included in every figure above but are not a district — so they are stated separately, never folded into the count.',
        cells: years.map(y =>
          value(
            y.districts.includesUndistricted
              ? `${NUM.format(y.districts.numbered)} + undistricted`
              : NUM.format(y.districts.numbered)
          )
        ),
      },
    ],
  }
}

function recognitionGroup(years: GlobalHistoryYear[]): ScoreboardGroup {
  return {
    key: 'recognition',
    title: 'Recognition',
    note: 'Club tiers are summed from each year-end rankings file, where “Distinguished clubs” means distinguished or better; the tiers below it are subsets.',
    rows: [
      {
        key: 'distinguished-clubs',
        label: 'Distinguished clubs',
        basis: 'Distinguished or better, at June 30',
        cells: years.map(y =>
          value(NUM.format(y.distinguishedClubs.distinguishedOrBetter))
        ),
      },
      {
        key: 'distinguished-base',
        label: 'Distinguished',
        indented: true,
        cells: years.map(y => value(NUM.format(y.distinguishedClubs.base))),
      },
      {
        key: 'select',
        label: 'Select Distinguished',
        indented: true,
        cells: years.map(y => value(NUM.format(y.distinguishedClubs.select))),
      },
      {
        key: 'presidents',
        label: 'President’s Distinguished',
        indented: true,
        cells: years.map(y =>
          value(NUM.format(y.distinguishedClubs.presidents))
        ),
      },
      {
        key: 'smedley',
        label: 'Smedley Distinguished',
        indented: true,
        basis: 'Introduced in program year 2025-2026',
        cells: years.map(y =>
          count(y.distinguishedClubs.smedley, 'not-applicable', SMEDLEY_NOTE)
        ),
      },
      {
        key: 'distinguished-districts',
        label: 'Distinguished districts',
        basis:
          'Distinguished or better, scored under that program year’s own ruleset. Undistricted (U) is not scored.',
        cells: years.map(y =>
          value(NUM.format(y.distinguishedDistricts.distinguishedOrBetter))
        ),
      },
    ],
  }
}

function movementGroup(years: GlobalHistoryYear[]): ScoreboardGroup {
  return {
    key: 'movement',
    title: 'Club movement',
    rows: [
      {
        key: 'new-clubs-still-active',
        label: 'New clubs still active at year end',
        basis:
          'Our basis: chartered during the program year and still on the roster at June 30. It undercounts charters that lapsed before the close.',
        cells: years.map(y =>
          count(
            y.clubMovement.newClubsStillActive,
            'not-on-file',
            MOVEMENT_NOTE
          )
        ),
      },
      {
        key: 'new-clubs-report-basis',
        label: 'New clubs (report basis)',
        basis:
          'A different metric from the row above: the record count of Toastmasters’ own New Clubs report, which our pipeline only carries from program year 2026-2027 onward.',
        cells: years.map(y =>
          count(y.clubMovement.newClubs, 'forward-only', REPORT_NEW_CLUBS_NOTE)
        ),
      },
      {
        key: 'suspended-clubs',
        label: 'Suspended clubs',
        basis: 'Clubs suspended during the program year',
        cells: years.map(y =>
          count(y.clubMovement.suspendedClubs, 'not-on-file', MOVEMENT_NOTE)
        ),
      },
    ],
  }
}

const EDUCATION_ROWS: ReadonlyArray<{
  key: string
  label: string
  pick: (e: NonNullable<GlobalHistoryYear['education']>) => number
  indented?: boolean
}> = [
  { key: 'education-total', label: 'Education awards', pick: e => e.total },
  {
    key: 'education-level1',
    label: 'Level 1',
    pick: e => e.level1,
    indented: true,
  },
  {
    key: 'education-level2',
    label: 'Level 2',
    pick: e => e.level2,
    indented: true,
  },
  {
    key: 'education-level3',
    label: 'Level 3',
    pick: e => e.level3,
    indented: true,
  },
  {
    key: 'education-level4',
    label: 'Level 4',
    pick: e => e.level4,
    indented: true,
  },
  {
    key: 'education-level5',
    label: 'Level 5',
    pick: e => e.level5,
    indented: true,
  },
  {
    key: 'education-dtm',
    label: 'Distinguished Toastmaster',
    pick: e => e.dtm,
    indented: true,
  },
  {
    key: 'education-other',
    label: 'Other award codes',
    pick: e => e.other,
    indented: true,
  },
]

function educationGroup(years: GlobalHistoryYear[]): ScoreboardGroup {
  return {
    key: 'education',
    title: 'Education awards',
    note: 'Raw achievement activity from the education reports — not DCP credit, which counts distinct members per tier. A year with no report set on file is marked, never zero-filled.',
    rows: EDUCATION_ROWS.map(row => ({
      key: row.key,
      label: row.label,
      ...(row.indented ? { indented: true } : {}),
      ...(row.key === 'education-total'
        ? { basis: 'Levels 1-5 + DTM + other codes' }
        : {}),
      cells: years.map(y =>
        y.education === null
          ? absent('not-on-file', EDUCATION_NOTE)
          : value(NUM.format(row.pick(y.education)))
      ),
    })),
  }
}

/**
 * Build the scoreboard from the published artifact. Column count is data
 * driven — five years today, ten once the 2016-17 → 2020-21 backfill lands.
 */
export function buildScoreboardModel(history: GlobalHistory): ScoreboardModel {
  const years = history.years
  const educationAbsentEntirely = years.every(y => y.education === null)

  const groups: ScoreboardGroup[] = [
    membershipGroup(years),
    recognitionGroup(years),
    movementGroup(years),
  ]
  // Seven rows of "not on file" teach a reader nothing. When NOT ONE year has
  // education on file, drop the group and say so in prose instead — the
  // absence is still stated, just once rather than 5-10 times per row.
  if (!educationAbsentEntirely) groups.push(educationGroup(years))

  return {
    years: years.map(y => ({
      programYear: y.programYear,
      label: programYearLabel(y.programYear),
      yearEndDate: y.yearEndDate,
    })),
    groups,
    educationAbsentEntirely,
  }
}

export interface CountryRow {
  key: string
  label: string
  clubs: number
  /** Share of the counted clubs, already rounded for display. */
  sharePct: number
  /** True for the Unknown bucket, which is styled and explained separately. */
  unknown?: boolean
}

/** How many named countries the ranked table shows before aggregating. */
export const TOP_COUNTRIES = 20

/**
 * Ranked clubs-by-country rows for the LATEST snapshot (never a per-year
 * series — country enrichment collapses on historical year-ends, 45% unknown
 * at 2026-06-30 vs 2% at 2026-08-30, epic finding F2).
 *
 * The returned rows always sum to `clubsCounted`: the named countries, an
 * aggregate of the remaining ones, and the Unknown bucket, which is published
 * rather than dropped so every share is a share of a stated whole.
 */
export function buildCountryRows(
  countries: ReadonlyArray<{ country: string; clubs: number }>,
  unknown: number,
  clubsCounted: number
): CountryRow[] {
  const whole = clubsCounted > 0 ? clubsCounted : 1
  const share = (n: number): number => Math.round((n / whole) * 1000) / 10

  const ranked = [...countries].sort(
    (a, b) => b.clubs - a.clubs || a.country.localeCompare(b.country)
  )
  const top = ranked.slice(0, TOP_COUNTRIES)
  const rest = ranked.slice(TOP_COUNTRIES)

  const rows: CountryRow[] = top.map(c => ({
    key: c.country,
    label: c.country,
    clubs: c.clubs,
    sharePct: share(c.clubs),
  }))

  if (rest.length > 0) {
    const clubs = rest.reduce((sum, c) => sum + c.clubs, 0)
    rows.push({
      key: 'other',
      label: `Other countries (${rest.length})`,
      clubs,
      sharePct: share(clubs),
    })
  }

  rows.push({
    key: 'unknown',
    label: 'Unknown',
    clubs: unknown,
    sharePct: share(unknown),
    unknown: true,
  })

  return rows
}
