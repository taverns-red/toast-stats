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
  const region = rollups.regions?.[regionId]
  if (!region) return []
  return [...region.districtIds]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap(districtId => {
      const district = rollups.districts[districtId]
      if (!district) return []
      const training = district.officerTraining ?? null
      const round = (r: TrainingRound) =>
        training
          ? figuresFromDistribution(roundDistribution(training, r), threshold)
          : null
      return [
        {
          districtId,
          clubs: district.clubs,
          rounds: [round(1), round(2)] as RegionTrainingRow['rounds'],
        },
      ]
    })
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
  const sign = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = metricValue(a, by.round, by.metric)
    const vb = metricValue(b, by.round, by.metric)
    if (va === null && vb === null)
      return a.districtId.localeCompare(b.districtId, undefined, {
        numeric: true,
      })
    if (va === null) return 1
    if (vb === null) return -1
    return (
      sign * (va - vb) ||
      a.districtId.localeCompare(b.districtId, undefined, { numeric: true })
    )
  })
}

/**
 * The round a region rank is taken on: the open round of the page's program
 * year, otherwise the latest of its rounds that has started.
 */
export function rankingRound(
  snapshotDate: string,
  programYear: string
): TrainingRound {
  const context = trainingRoundContext(snapshotDate, programYear)
  if (context.open) return context.open.round
  const [, round2] = getOfficerTrainingRounds(programYear)
  return snapshotDate >= round2.start ? 2 : 1
}

/** Competition rank (ties share; the next rank skips) by % at the
 *  threshold in a round, among the districts with data. */
export function rankInRegion(
  rows: readonly RegionTrainingRow[],
  districtId: string,
  round: TrainingRound
): { rank: number; of: number } | null {
  const ranked = rows.filter(r => metricValue(r, round, 'threshold') !== null)
  const own = ranked.find(r => r.districtId === districtId)
  if (!own) return null
  const value = metricValue(own, round, 'threshold')!
  const ahead = ranked.filter(
    r => metricValue(r, round, 'threshold')! > value
  ).length
  return { rank: ahead + 1, of: ranked.length }
}

/** "1st", "2nd", "3rd", "11th" … */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
