/* eslint-disable */
// @ts-nocheck -- red-commit stub for #2296, replaced by the implementation
/**
 * Region comparison of officer training (#2296). A region's districts on
 * each round's % of clubs at 4+ (DCP goal 9), % with all seven officers
 * trained and % at the selected threshold, read from the one
 * `snapshots/{date}/region-rollups.json` per date — never by fetching each
 * district. A district whose export carried no officer-training column, or a
 * file written before the field existed, reads null (shown as "—"), never
 * 0%.
 */
import { getOfficerTrainingRounds } from '@taverns-red/analytics-core'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import {
  figuresFromDistribution,
  roundDistribution,
  trainingRoundContext,
  type RoundFigures,
  type TrainingRound,
} from './officerTraining'

export interface RegionTrainingRow {
  districtId: string
  clubs: number
  /** Round 1 and Round 2 figures; null = not measured. */
  rounds: [RoundFigures | null, RoundFigures | null]
}

/** The region's districts (ascending id) with per-round figures. */
export function regionTrainingRows(
  rollups: RegionRollups,
  regionId: string,
  threshold: number
): RegionTrainingRow[] {
  throw new Error('not implemented (#2296)')
}

export type RegionTrainingMetric = 'threshold' | 'dcp' | 'allSeven'

const metricValue = (
  row: RegionTrainingRow,
  round: TrainingRound,
  metric: RegionTrainingMetric
): number | null => {
  const f = row.rounds[round - 1]
  if (!f) return null
  return metric === 'dcp'
    ? f.pctDcp
    : metric === 'allSeven'
      ? f.pctAllSeven
      : f.pctAtThreshold
}

/** Highest first; districts without data last; ties by district id. */
export function sortRegionTrainingRows(
  rows: readonly RegionTrainingRow[],
  by: { round: TrainingRound; metric: RegionTrainingMetric },
  direction: 'desc' | 'asc' = 'desc'
): RegionTrainingRow[] {
  throw new Error('not implemented (#2296)')
}

/**
 * The round a region rank is taken on: the open round of the page's program
 * year, otherwise the latest of its rounds that has started.
 */
export function rankingRound(
  snapshotDate: string,
  programYear: string
): TrainingRound {
  throw new Error('not implemented (#2296)')
}

/** Competition rank (ties share; the next rank skips) by % at the
 *  threshold in a round, among the districts with data. */
export function rankInRegion(
  rows: readonly RegionTrainingRow[],
  districtId: string,
  round: TrainingRound
): { rank: number; of: number } | null {
  throw new Error('not implemented (#2296)')
}

/** "1st", "2nd", "3rd", "11th" … */
export function ordinal(n: number): string {
  throw new Error('not implemented (#2296)')
}
