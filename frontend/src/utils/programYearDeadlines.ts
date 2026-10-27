/**
 * Program-year deadlines (#2298) — one dated, program-year-aware rules table.
 *
 * Every Toastmasters date the site counts down to lives here, each row
 * citing the TI document it comes from. A deadline that cannot be cited is
 * left out rather than guessed. Rows whose rule already lives elsewhere
 * reuse it instead of copying the date:
 *
 *   - officer-training rounds → `getOfficerTrainingRounds` (analytics-core,
 *     #2296), which the Training pages and the /regions "opens Nov 1" copy
 *     also read;
 *   - the Club Success Plan date → `cspDueDate` (analytics-core, #1565),
 *     for an existing club (the 30 September date every club is held to).
 *
 * The area club-visit dates live only here; `getAreaVisitDeadlines` (the
 * Distinguished Area gate, #832) reads them through `areaVisitDeadlines`.
 *
 * A rule names the first program year it applies to. A future TI change is
 * a new row, never an edit of an old one, so history keeps its own dates.
 *
 * Nothing here reads a clock: the program year and the as-of date are the
 * page's own (R3).
 */

import {
  CSP_REQUIRED_FROM_PROGRAM_YEAR,
  cspDueDate,
  getOfficerTrainingRounds,
} from '@taverns-red/analytics-core'

export type DeadlineId =
  | 'csp'
  | 'training-r1-close'
  | 'dues-october'
  | 'training-r2-open'
  | 'visits-r1'
  | 'training-r2-close'
  | 'dues-april'
  | 'visits-r2'

/** One deadline of one program year. */
export interface ProgramYearDeadline {
  id: DeadlineId
  /** Short plain-language name, e.g. "Round 1 club visit reports due". */
  label: string
  /** `YYYY-MM-DD`. The deadline day itself still counts as upcoming. */
  date: string
  /** The TI document the date comes from. */
  source: string
}

export interface DeadlineRule {
  id: DeadlineId
  label: string
  /** First program year ("YYYY-YYYY") the rule applies to. */
  fromProgramYear: string
  source: string
  date: (programYear: string) => string
}

const PROGRAM_YEAR = /^(\d{4})-(\d{4})$/

function startYear(programYear: string): number {
  const match = PROGRAM_YEAR.exec(programYear)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Not a program year: ${programYear}`)
  }
  return Number(match[1])
}

/** Month and day in the PY's start year (offset 0) or end year (offset 1). */
const fixed =
  (yearOffset: 0 | 1, monthDay: string) =>
  (programYear: string): string =>
    `${startYear(programYear) + yearOffset}-${monthDay}`

const DCP = 'Distinguished Club Program, Item 1111 Rev. 06/2026'
const DRP = 'District Recognition Program, Item 1490 Rev. 07/2026'
const RENEWAL_FAQ = 'https://www.toastmasters.org/footer/faq/Renewal-Dues'

/** Earlier program years are not known to differ; a change gets a new row. */
const ALWAYS = '2000-2001'

export const PROGRAM_YEAR_DEADLINE_RULES: readonly DeadlineRule[] = [
  {
    // DCP p.7, goal 9: "The first training session occurs between June 1
    // and August 31".
    id: 'training-r1-close',
    label: 'Round 1 officer training closes',
    fromProgramYear: ALWAYS,
    source: `${DCP}, p. 7 (goal 9)`,
    date: py => getOfficerTrainingRounds(py)[0].end,
  },
  {
    // DCP p.5: "The club must submit the Club Success Plan by September
    // 30." Required from 2025-2026 (CSP_REQUIRED_FROM_PROGRAM_YEAR).
    id: 'csp',
    label: 'Club Success Plans due',
    fromProgramYear: CSP_REQUIRED_FROM_PROGRAM_YEAR,
    source: `${DCP}, p. 5`,
    // An existing club's date; never null for a club with no charter date.
    date: py => cspDueDate({}, py) ?? fixed(0, '09-30')(py),
  },
  {
    // DCP p.8, goal 10: October–March dues "received by World Headquarters
    // on or before October 1"; Renewal Dues FAQ: "Renewal payments are due
    // twice a year: on April 1 and October 1."
    id: 'dues-october',
    label: 'October dues renewal due',
    fromProgramYear: ALWAYS,
    source: `${DCP}, p. 8 (goal 10); ${RENEWAL_FAQ}`,
    date: fixed(0, '10-01'),
  },
  {
    // DCP p.7, goal 9: "the second is held between November 1 and
    // February 28 (or February 29 in leap years)".
    id: 'training-r2-open',
    label: 'Round 2 officer training opens',
    fromProgramYear: ALWAYS,
    source: `${DCP}, p. 7 (goal 9)`,
    date: py => getOfficerTrainingRounds(py)[1].start,
  },
  {
    // DRP p.10: "submit an Area Director's Club Visit Report for each club
    // visited during the first round of visits by November 30".
    id: 'visits-r1',
    label: 'Round 1 club visit reports due',
    fromProgramYear: ALWAYS,
    source: `${DRP}, p. 10`,
    date: fixed(0, '11-30'),
  },
  {
    id: 'training-r2-close',
    label: 'Round 2 officer training closes',
    fromProgramYear: ALWAYS,
    source: `${DCP}, p. 7 (goal 9)`,
    date: py => getOfficerTrainingRounds(py)[1].end,
  },
  {
    // DCP p.8, goal 10: April–September dues "received by World
    // Headquarters on or before April 1"; Renewal Dues FAQ as above.
    id: 'dues-april',
    label: 'April dues renewal due',
    fromProgramYear: ALWAYS,
    source: `${DCP}, p. 8 (goal 10); ${RENEWAL_FAQ}`,
    date: fixed(1, '04-01'),
  },
  {
    // DRP p.10: "and for each club visited during the second round of
    // visits by May 31".
    id: 'visits-r2',
    label: 'Round 2 club visit reports due',
    fromProgramYear: ALWAYS,
    source: `${DRP}, p. 10`,
    date: fixed(1, '05-31'),
  },
]

/** The program year's deadlines that apply to it, in date order. */
export function deadlinesForProgramYear(
  programYear: string
): ProgramYearDeadline[] {
  const year = startYear(programYear)
  return PROGRAM_YEAR_DEADLINE_RULES.filter(
    rule => startYear(rule.fromProgramYear) <= year
  )
    .map(rule => ({
      id: rule.id,
      label: rule.label,
      date: rule.date(programYear),
      source: rule.source,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface UpcomingDeadline extends ProgramYearDeadline {
  /** Whole days from the as-of date to the deadline; 0 on the day itself. */
  daysLeft: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  )
}

/**
 * The next `limit` deadlines of `programYear` on or after `asOfDate`. Empty
 * once every deadline of the year has passed — the next year's are not
 * borrowed, since the page's program year is the page's choice (R3).
 */
export function nextDeadlines(
  programYear: string,
  asOfDate: string,
  limit = 2
): UpcomingDeadline[] {
  const asOf = asOfDate.slice(0, 10)
  return deadlinesForProgramYear(programYear)
    .filter(d => d.date >= asOf)
    .slice(0, limit)
    .map(d => ({ ...d, daysLeft: daysBetween(asOf, d.date) }))
}

/** The Distinguished Area Program's two club-visit deadlines (#832). */
export function areaVisitDeadlines(programYear: string): {
  r1: string
  r2: string
} {
  const list = deadlinesForProgramYear(programYear)
  const date = (id: DeadlineId): string => {
    const found = list.find(d => d.id === id)
    if (!found) throw new Error(`No ${id} deadline for ${programYear}`)
    return found.date
  }
  return { r1: date('visits-r1'), r2: date('visits-r2') }
}
