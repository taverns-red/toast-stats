/**
 * Officer-training roll-up for the Training page, the Action List section and
 * the division/area counts (#2296).
 *
 * Every count reads one club's `Off. Trained Round 1/2` cell through
 * analytics-core's `officersTrainedInRound`, which reads DCP goal 9's own
 * column definition — the same cell the per-club DCP goals panel shows — so
 * the roll-up and the panel cannot disagree. TI reports how MANY officers
 * were trained (0–7), not which officers.
 *
 * Officer training is not part of the education program.
 */
import {
  OFFICER_TRAINING_DCP_THRESHOLD,
  OFFICER_TRAINING_MAX_OFFICERS,
  OFFICER_TRAINING_ROUND_COLUMNS,
  dayOfRound,
  daysLeftInRound,
  getOfficerTrainingRounds,
  officerTrainingRoundsOn,
  officersTrainedInRound,
  type OfficerTrainingRoundWindow,
} from '@taverns-red/analytics-core'
import type {
  OfficerTrainingDistribution,
  ScrapedRecord,
  TimeSeriesDataPoint,
} from '@taverns-red/shared-contracts'
import { normalizeClubId } from '@taverns-red/shared-contracts'

export type TrainingRound = 1 | 2

export const DEFAULT_TRAINING_THRESHOLD = OFFICER_TRAINING_DCP_THRESHOLD
export const ALL_OFFICERS = OFFICER_TRAINING_MAX_OFFICERS

/** `?threshold=` → 1–7; anything else (absent, 0, 8, "4.5", "x") → 4. */
export function parseTrainingThreshold(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || !/^\d$/.test(raw)) {
    return DEFAULT_TRAINING_THRESHOLD
  }
  const n = Number(raw)
  return n >= 1 && n <= ALL_OFFICERS ? n : DEFAULT_TRAINING_THRESHOLD
}

/** The selector's option label for a threshold. */
export function thresholdOptionLabel(threshold: number): string {
  if (threshold === ALL_OFFICERS) return 'All seven officers'
  if (threshold === DEFAULT_TRAINING_THRESHOLD)
    return `${threshold}+ officers (DCP goal 9)`
  return `${threshold}+ officer${threshold === 1 ? '' : 's'}`
}

/** "4+ officers trained" / "all seven officers trained" — inline copy. */
export function thresholdPhrase(threshold: number): string {
  return threshold === ALL_OFFICERS
    ? 'all seven officers trained'
    : `${threshold}+ officer${threshold === 1 ? '' : 's'} trained`
}

/** One club's officer-training counts. */
export interface TrainingClub {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  round1: number
  round2: number
  /** TI's `Club Status` (Active, Low, Ineligible, Suspended …). */
  clubStatus: string
}

const stripPrefix = (value: unknown, prefix: RegExp): string =>
  String(value ?? '')
    .trim()
    .replace(prefix, '')

/** The raw `clubPerformance` rows of a CDN district snapshot (the file wraps
 *  its statistics under `data`). */
function clubPerformanceRows(snapshot: unknown): ScrapedRecord[] | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const raw = snapshot as Record<string, unknown>
  const data = raw['data'] as Record<string, unknown> | undefined
  const rows = data?.['clubPerformance'] ?? raw['clubPerformance']
  return Array.isArray(rows) ? (rows as ScrapedRecord[]) : null
}

/**
 * Each club on the snapshot's club performance export with its officers
 * trained per round. Null when the export carries no officer-training
 * column — "not measured", never a list of zeros.
 */
export function trainingClubsFromSnapshot(
  snapshot: unknown
): TrainingClub[] | null {
  const rows = clubPerformanceRows(snapshot)
  if (!rows) return null
  const carries = rows.some(row =>
    OFFICER_TRAINING_ROUND_COLUMNS.some(column =>
      column.aliases.some(alias => alias in row)
    )
  )
  if (!carries) return null
  const clubs: TrainingClub[] = []
  for (const row of rows) {
    const clubId = normalizeClubId(row['Club Number'])
    const clubName = String(row['Club Name'] ?? '').trim()
    if (!clubId || !clubName) continue
    clubs.push({
      clubId,
      clubName,
      divisionId: stripPrefix(row['Division'], /^division\s+/i),
      areaId: stripPrefix(row['Area'], /^area\s+/i),
      round1: officersTrainedInRound(row, 1),
      round2: officersTrainedInRound(row, 2),
      clubStatus: String(row['Club Status'] ?? '').trim(),
    })
  }
  return clubs
}

export interface TrainingScope {
  division?: string | undefined
  area?: string | undefined
}

/** Clubs in a division and/or area (case-insensitive; area alone matches
 *  that area id in any division). */
export function filterTrainingClubs(
  clubs: readonly TrainingClub[],
  scope: TrainingScope
): TrainingClub[] {
  const division = scope.division?.toUpperCase()
  const area = scope.area?.toUpperCase()
  return clubs.filter(
    c =>
      (!division || c.divisionId.toUpperCase() === division) &&
      (!area || c.areaId.toUpperCase() === area)
  )
}

const officers = (club: TrainingClub, round: TrainingRound): number =>
  round === 1 ? club.round1 : club.round2

/** Clubs by officers trained in a round, index 0–7. */
export function distributionOf(
  clubs: readonly TrainingClub[],
  round: TrainingRound
): number[] {
  const out = new Array<number>(ALL_OFFICERS + 1).fill(0)
  for (const club of clubs) out[officers(club, round)]! += 1
  return out
}

/** The headline figures of one round's distribution. */
export interface RoundFigures {
  /** Clubs counted. */
  clubs: number
  /** Clubs at or above the threshold. */
  atThreshold: number
  /** Clubs 1–3 officers short of the threshold. */
  shortOneToThree: number
  /** Clubs with no officer trained. */
  atZero: number
  /** % of clubs at or above the threshold (null with no clubs). */
  pctAtThreshold: number | null
  /** % of clubs with 4+ officers trained (DCP goal 9's round requirement). */
  pctDcp: number | null
  /** % of clubs with all seven officers trained. */
  pctAllSeven: number | null
}

const sumFrom = (distribution: readonly number[], from: number): number =>
  distribution.slice(from).reduce((a, b) => a + b, 0)

const pct = (part: number, whole: number): number | null =>
  whole === 0 ? null : (part / whole) * 100

/** Headline figures from a 0–7 distribution at a threshold. */
export function figuresFromDistribution(
  distribution: readonly number[],
  threshold: number
): RoundFigures {
  const clubs = sumFrom(distribution, 0)
  const atThreshold = sumFrom(distribution, threshold)
  const shortOneToThree = distribution
    .slice(Math.max(0, threshold - 3), threshold)
    .reduce((a, b) => a + b, 0)
  return {
    clubs,
    atThreshold,
    shortOneToThree,
    atZero: distribution[0] ?? 0,
    pctAtThreshold: pct(atThreshold, clubs),
    pctDcp: pct(sumFrom(distribution, DEFAULT_TRAINING_THRESHOLD), clubs),
    pctAllSeven: pct(distribution[ALL_OFFICERS] ?? 0, clubs),
  }
}

/** One round's distribution of a published time-series / rollup block. */
export function roundDistribution(
  block: OfficerTrainingDistribution,
  round: TrainingRound
): number[] {
  return round === 1 ? block.round1 : block.round2
}

/** A club below the threshold in a round, and how many more it needs. */
export interface ShortClub extends TrainingClub {
  trained: number
  needed: number
}

/** Clubs short of the threshold in a round: fewest needed first, then by
 *  division, area and name. */
export function shortClubs(
  clubs: readonly TrainingClub[],
  round: TrainingRound,
  threshold: number
): ShortClub[] {
  return clubs
    .map(c => ({
      ...c,
      trained: officers(c, round),
      needed: threshold - officers(c, round),
    }))
    .filter(c => c.needed > 0)
    .sort(
      (a, b) =>
        a.needed - b.needed ||
        a.divisionId.localeCompare(b.divisionId) ||
        a.areaId.localeCompare(b.areaId, undefined, { numeric: true }) ||
        a.clubName.localeCompare(b.clubName)
    )
}

/** "1 more officer" / "3 more officers". */
export function formatNeeded(needed: number): string {
  return `${needed} more officer${needed === 1 ? '' : 's'}`
}

/** "45%" / "—" — whole percent, for headline tiles and tables. */
export function formatPct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`
}

/**
 * Where a page's snapshot date sits relative to the rounds, for the page's
 * own program year (R3: both come from the page, never the wall clock).
 *
 * Round 1 opens on Jun 1, a month before its program year starts, and TI
 * publishes the new year's counts only after its late-July rollover. So a
 * June date shows the OLD program year's final counts while the NEW year's
 * Round 1 is open: `pendingOpen` names that round, and `open` stays null so
 * no to-do list is built from last year's numbers.
 */
export interface TrainingRoundContext {
  /** The open round whose counts this snapshot carries, or null. */
  open: OfficerTrainingRoundWindow | null
  /** Days left in `open`, counting the snapshot date. */
  daysLeft: number | null
  /** An open round of the NEXT program year this snapshot cannot show yet. */
  pendingOpen: OfficerTrainingRoundWindow | null
  /** The next round to open after the snapshot date. */
  next: OfficerTrainingRoundWindow
  /** Both rounds of the page's program year, in order. */
  rounds: [OfficerTrainingRoundWindow, OfficerTrainingRoundWindow]
}

export function trainingRoundContext(
  snapshotDate: string,
  programYear: string
): TrainingRoundContext {
  const state = officerTrainingRoundsOn(snapshotDate)
  const rounds = getOfficerTrainingRounds(programYear)
  const ours = state.open?.programYear === programYear ? state.open : null
  return {
    open: ours,
    daysLeft: ours ? daysLeftInRound(ours, snapshotDate) : null,
    pendingOpen: state.open && !ours ? state.open : null,
    next: state.next,
    rounds,
  }
}

/** Has a round started, ended, or not yet begun on the snapshot date? */
export function roundStatus(
  window: OfficerTrainingRoundWindow,
  snapshotDate: string
): 'upcoming' | 'open' | 'closed' {
  if (snapshotDate < window.start) return 'upcoming'
  if (snapshotDate > window.end) return 'closed'
  return 'open'
}

/** One point on a round's progress curve. */
export interface CurvePoint {
  /** Day of the round, 0 = its first day. */
  day: number
  date: string
  /** % of clubs at or above the threshold on that date. */
  pct: number
}

/**
 * A round's cumulative progress: % of clubs at or above the threshold on
 * each published date inside the round window. Points without the
 * officer-training field (published before it existed) are skipped, so the
 * curve starts where the record does — never at a fabricated zero.
 */
export function roundCurve(
  points: readonly TimeSeriesDataPoint[] | undefined,
  window: OfficerTrainingRoundWindow,
  threshold: number
): CurvePoint[] {
  if (!points) return []
  const out: CurvePoint[] = []
  for (const point of points) {
    if (point.date < window.start || point.date > window.end) continue
    if (!point.officerTraining) continue
    const figures = figuresFromDistribution(
      roundDistribution(point.officerTraining, window.round),
      threshold
    )
    if (figures.pctAtThreshold === null) continue
    out.push({
      day: dayOfRound(window, point.date),
      date: point.date,
      pct: figures.pctAtThreshold,
    })
  }
  return out.sort((a, b) => a.day - b.day)
}

/** Which snapshot last year's comparison reads, and how it relates. */
export interface LastYearSnapshot<T extends string = string> {
  date: T
  /**
   * `same`: the same day of last year's round. `earlier`: the latest
   * snapshot before that day (older years keep month-ends only). `final`:
   * last year's last snapshot inside the round (this year's round is closed).
   */
  kind: 'same' | 'earlier' | 'final'
}

/**
 * The prior-year snapshot to compare a round with (review S2). Always a
 * date INSIDE last year's same round, and never one later than this year's
 * point in it:
 * - open round: the latest snapshot on or before the same day of last
 *   year's round, so progress is compared like for like (never a later
 *   date, which would overstate last year; never one from before the round
 *   opened, which reads 0%);
 * - closed round: last year's final snapshot inside the round;
 * - a round that has not opened: no comparison.
 */
export function lastYearSnapshotFor<T extends string>(
  window: OfficerTrainingRoundWindow,
  date: string,
  priorDates: readonly T[]
): LastYearSnapshot<T> | null {
  const status = roundStatus(window, date)
  if (status === 'upcoming') return null
  const start = Number(window.programYear.slice(0, 4)) - 1
  const last = getOfficerTrainingRounds(`${start}-${start + 1}`)[
    window.round - 1
  ]!
  const target =
    status === 'open'
      ? new Date(
          Date.parse(`${last.start}T00:00:00Z`) +
            dayOfRound(window, date) * 86_400_000
        )
          .toISOString()
          .slice(0, 10)
      : last.end
  const bound = target < last.end ? target : last.end
  const candidates = priorDates
    .filter(d => d >= last.start && d <= bound)
    .sort()
  const pick = candidates[candidates.length - 1]
  if (!pick) return null
  return {
    date: pick,
    kind: status === 'closed' ? 'final' : pick === target ? 'same' : 'earlier',
  }
}

/** The club list as CSV rows (header first), in the given order. */
export function trainingCsvRows(
  clubs: readonly TrainingClub[],
  threshold: number,
  status: Record<'round1' | 'round2', 'open' | 'closed' | 'upcoming'>
): (string | number)[][] {
  const meets = (n: number) => (n >= threshold ? 'Yes' : 'No')
  // A round that has not opened reads 0 for every club: "not open yet",
  // never "0 / No" (review S1).
  const cells = (round: 'round1' | 'round2', n: number) =>
    status[round] === 'upcoming'
      ? ['not open yet', 'not open yet']
      : [n, meets(n)]
  return [
    [
      'Division',
      'Area',
      'Club Number',
      'Club Name',
      'Officers trained Round 1 (Jun–Aug)',
      `Round 1 at ${threshold}+`,
      'Officers trained Round 2 (Nov–Feb)',
      `Round 2 at ${threshold}+`,
    ],
    ...clubs.map(c => [
      c.divisionId,
      c.areaId,
      c.clubId,
      c.clubName,
      ...cells('round1', c.round1),
      ...cells('round2', c.round2),
    ]),
  ]
}

/** The Training page URL, pre-filtered (division/area/threshold). */
export function trainingPageUrl(
  districtId: string,
  scope: TrainingScope & { threshold?: number } = {}
): string {
  const params = new URLSearchParams()
  if (scope.division) params.set('division', scope.division)
  if (scope.area) params.set('area', scope.area)
  if (
    scope.threshold !== undefined &&
    scope.threshold !== DEFAULT_TRAINING_THRESHOLD
  ) {
    params.set('threshold', String(scope.threshold))
  }
  const query = params.toString()
  return `/district/${districtId}/training${query ? `?${query}` : ''}`
}
