/* eslint-disable */
// @ts-nocheck -- red-commit stub for #2296, replaced by the implementation
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
  throw new Error('not implemented (#2296)')
}

/** The selector's option label for a threshold. */
export function thresholdOptionLabel(threshold: number): string {
  throw new Error('not implemented (#2296)')
}

/** "4+ officers trained" / "all seven officers trained" — inline copy. */
export function thresholdPhrase(threshold: number): string {
  throw new Error('not implemented (#2296)')
}

/** One club's officer-training counts. */
export interface TrainingClub {
  clubId: string
  clubName: string
  divisionId: string
  areaId: string
  round1: number
  round2: number
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
  throw new Error('not implemented (#2296)')
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
  throw new Error('not implemented (#2296)')
}

const officers = (club: TrainingClub, round: TrainingRound): number =>
  round === 1 ? club.round1 : club.round2

/** Clubs by officers trained in a round, index 0–7. */
export function distributionOf(
  clubs: readonly TrainingClub[],
  round: TrainingRound
): number[] {
  throw new Error('not implemented (#2296)')
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
  throw new Error('not implemented (#2296)')
}

/** One round's distribution of a published time-series / rollup block. */
export function roundDistribution(
  block: OfficerTrainingDistribution,
  round: TrainingRound
): number[] {
  throw new Error('not implemented (#2296)')
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
  throw new Error('not implemented (#2296)')
}

/** "1 more officer" / "3 more officers". */
export function formatNeeded(needed: number): string {
  throw new Error('not implemented (#2296)')
}

/** "45%" / "—" — whole percent, for headline tiles and tables. */
export function formatPct(value: number | null): string {
  throw new Error('not implemented (#2296)')
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
  throw new Error('not implemented (#2296)')
}

/** Has a round started, ended, or not yet begun on the snapshot date? */
export function roundStatus(
  window: OfficerTrainingRoundWindow,
  snapshotDate: string
): 'upcoming' | 'open' | 'closed' {
  throw new Error('not implemented (#2296)')
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
  throw new Error('not implemented (#2296)')
}

/** The date in `dates` closest to `date` one year earlier, within ±31 days. */
export function sameDateLastYear(
  date: string,
  dates: readonly string[]
): string | null {
  throw new Error('not implemented (#2296)')
}

/** The club list as CSV rows (header first), in the given order. */
export function trainingCsvRows(
  clubs: readonly TrainingClub[],
  threshold: number
): (string | number)[][] {
  throw new Error('not implemented (#2296)')
}

/** The Training page URL, pre-filtered (division/area/threshold). */
export function trainingPageUrl(
  districtId: string,
  scope: TrainingScope & { threshold?: number } = {}
): string {
  throw new Error('not implemented (#2296)')
}
