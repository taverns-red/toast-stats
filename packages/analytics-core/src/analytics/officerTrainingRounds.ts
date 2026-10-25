/**
 * Officer-training round windows (#2296) — one dated, program-year-aware
 * rules table.
 *
 * DCP goal 9 asks for four club officers trained in each of two training
 * periods: Round 1, June–August, and Round 2, November–February. Round 1
 * opens on June 1, a month BEFORE its program year starts on July 1, so a
 * June date sits in the old program year's data but the new program year's
 * open round. Round 2 runs to the last day of February, Feb 29 in a leap
 * year.
 *
 * A rule names the first program year it applies to. A future TI change to
 * the windows is a new row, never an edit of an old one, so history keeps
 * the windows it actually had.
 */

/** A month and day, with the calendar year given relative to the program
 *  year's start year (0 = the July year, 1 = the year after). */
interface RoundBoundary {
  yearOffset: 0 | 1
  month: number
  /** Day of month; 'last' = the month's last day (Feb 28 or 29). */
  day: number | 'last'
}

export interface OfficerTrainingRoundRule {
  /** First program year the rule applies to, e.g. "2000-2001". */
  fromProgramYear: string
  /** Where the windows come from. */
  source: string
  rounds: readonly [
    { start: RoundBoundary; end: RoundBoundary },
    { start: RoundBoundary; end: RoundBoundary },
  ]
}

/** One round of one program year, as calendar dates (inclusive). */
export interface OfficerTrainingRoundWindow {
  programYear: string
  round: 1 | 2
  /** First day of the round, YYYY-MM-DD */
  start: string
  /** Last day of the round, YYYY-MM-DD */
  end: string
}

export interface OfficerTrainingRoundsOn {
  /** The round open on the date, or null between rounds. */
  open: OfficerTrainingRoundWindow | null
  /** The most recent round that ended before the date. */
  lastClosed: OfficerTrainingRoundWindow | null
  /** The next round to open after the date. */
  next: OfficerTrainingRoundWindow
}

export const OFFICER_TRAINING_ROUND_RULES: readonly OfficerTrainingRoundRule[] =
  [
    {
      // The windows the goal-9 columns are labelled with on every captured
      // export ("Officers trained Jun–Aug" / "Nov–Feb"). Earlier program
      // years are not known to differ; a change gets its own row.
      fromProgramYear: '2000-2001',
      source:
        'Distinguished Club Program goal 9: four officers trained June–August and four trained November–February',
      rounds: [
        {
          start: { yearOffset: 0, month: 6, day: 1 },
          end: { yearOffset: 0, month: 8, day: 31 },
        },
        {
          start: { yearOffset: 0, month: 11, day: 1 },
          end: { yearOffset: 1, month: 2, day: 'last' },
        },
      ],
    },
  ]

const PROGRAM_YEAR = /^(\d{4})-(\d{4})$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

function programYearStart(programYear: string): number {
  const match = PROGRAM_YEAR.exec(programYear)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Not a program year: ${programYear}`)
  }
  return Number(match[1])
}

const pad = (n: number): string => String(n).padStart(2, '0')

function boundaryDate(startYear: number, boundary: RoundBoundary): string {
  const year = startYear + boundary.yearOffset
  const day =
    boundary.day === 'last'
      ? new Date(Date.UTC(year, boundary.month, 0)).getUTCDate()
      : boundary.day
  return `${year}-${pad(boundary.month)}-${pad(day)}`
}

function ruleFor(programYear: string): OfficerTrainingRoundRule {
  const startYear = programYearStart(programYear)
  const rule = [...OFFICER_TRAINING_ROUND_RULES]
    .filter(r => programYearStart(r.fromProgramYear) <= startYear)
    .sort(
      (a, b) =>
        programYearStart(b.fromProgramYear) -
        programYearStart(a.fromProgramYear)
    )[0]
  if (!rule) {
    throw new Error(`No officer-training round rule for ${programYear}`)
  }
  return rule
}

/** Both rounds of a program year, in round order. */
export function getOfficerTrainingRounds(
  programYear: string
): [OfficerTrainingRoundWindow, OfficerTrainingRoundWindow] {
  const startYear = programYearStart(programYear)
  const { rounds } = ruleFor(programYear)
  const window = (round: 1 | 2): OfficerTrainingRoundWindow => ({
    programYear,
    round,
    start: boundaryDate(startYear, rounds[round - 1]!.start),
    end: boundaryDate(startYear, rounds[round - 1]!.end),
  })
  return [window(1), window(2)]
}

function assertDate(date: string): void {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`Not a YYYY-MM-DD date: ${date}`)
  }
}

/**
 * The round open on a date, the last one closed and the next to open. Looks
 * across adjacent program years, because Round 1 of the next program year
 * opens in June.
 */
export function officerTrainingRoundsOn(date: string): OfficerTrainingRoundsOn {
  assertDate(date)
  const year = Number(date.slice(0, 4))
  const windows = [year - 2, year - 1, year, year + 1].flatMap(start =>
    getOfficerTrainingRounds(`${start}-${start + 1}`)
  )
  windows.sort((a, b) => a.start.localeCompare(b.start))
  const open = windows.find(w => w.start <= date && date <= w.end) ?? null
  const lastClosed = [...windows].reverse().find(w => w.end < date) ?? null
  const next = windows.find(w => w.start > date)!
  return { open, lastClosed, next }
}

/** Days left in a round on a date, counting the date itself (1 on its last
 *  day); 0 once it has ended. */
export function daysLeftInRound(
  window: OfficerTrainingRoundWindow,
  date: string
): number {
  assertDate(date)
  const ms =
    Date.parse(`${window.end}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)
  return Math.max(0, Math.round(ms / DAY_MS) + 1)
}

/** Day of the round a date falls on, 0 on its first day (for plotting a
 *  round's progress curve). */
export function dayOfRound(
  window: OfficerTrainingRoundWindow,
  date: string
): number {
  assertDate(date)
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${window.start}T00:00:00Z`)) /
      DAY_MS
  )
}
