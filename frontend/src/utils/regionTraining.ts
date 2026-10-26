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
import type {
  OfficerTrainingDistribution,
  RegionRollups,
} from '@taverns-red/shared-contracts'
import { normaliseRegionId } from './regionId'
import {
  DEFAULT_TRAINING_THRESHOLD,
  figuresFromDistribution,
  roundDistribution,
  roundStatus,
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

/** The region comparison URL, keeping threshold, `py` and `date` (#2296). */
export function regionTrainingUrl(
  regionId: string,
  keep: { threshold?: number; py?: string | null; date?: string | null }
): string {
  const params = new URLSearchParams()
  if (keep.threshold !== undefined && keep.threshold !== 4)
    params.set('threshold', String(keep.threshold))
  if (keep.py) params.set('py', keep.py)
  if (keep.date) params.set('date', keep.date)
  const query = params.toString()
  return `/region/${regionId}/training${query ? `?${query}` : ''}`
}

/** "1st", "2nd", "3rd", "11th" … */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** One round of a region (or the world) on the /regions overview (#2330). */
export type RegionsTrainingRound =
  | { state: 'measured'; figures: RoundFigures }
  /** The round had not opened on the date: every club reads 0, so no %. */
  | { state: 'notStarted'; opens: string }
  /** The date's file has no officer-training figures for this block. */
  | { state: 'notAvailable' }

export interface RegionsTrainingBlock {
  rounds: [RegionsTrainingRound, RegionsTrainingRound]
}

export interface RegionsTrainingOverview {
  world: RegionsTrainingBlock
  /** By two-digit region id ("01".."14"). */
  regions: ReadonlyMap<string, RegionsTrainingBlock>
  /** A region's block however its id is spelled; absent = not available. */
  forRegion: (regionId: string) => RegionsTrainingBlock
  /** Any figure at all on this date (false: a file before the field). */
  available: boolean
  /** Round 2 had opened on the date. */
  round2Started: boolean
  /** Round 2's first day in the page's program year. */
  round2Opens: string
}

const NOT_AVAILABLE: RegionsTrainingBlock = {
  rounds: [{ state: 'notAvailable' }, { state: 'notAvailable' }],
}

/**
 * Every region's and the world's officer training for the /regions overview
 * (#2330), at the region Training page's own default thresholds: % of clubs
 * with 4+ officers trained (DCP goal 9) and with all seven, per round. One
 * read of the date's `region-rollups.json`; the program year and date are
 * the page's own (R3).
 */
export function regionsTrainingOverview(
  rollups: RegionRollups | null,
  snapshotDate: string,
  programYear: string
): RegionsTrainingOverview {
  const windows = getOfficerTrainingRounds(programYear)
  const started = (round: TrainingRound) =>
    roundStatus(windows[round - 1]!, snapshotDate) !== 'upcoming'
  const block = (
    training: OfficerTrainingDistribution | null | undefined
  ): RegionsTrainingBlock => {
    if (!training) return NOT_AVAILABLE
    const round = (r: TrainingRound): RegionsTrainingRound =>
      started(r)
        ? {
            state: 'measured',
            figures: figuresFromDistribution(
              roundDistribution(training, r),
              DEFAULT_TRAINING_THRESHOLD
            ),
          }
        : { state: 'notStarted', opens: windows[r - 1]!.start }
    return { rounds: [round(1), round(2)] }
  }
  const regions = new Map<string, RegionsTrainingBlock>()
  for (const [id, region] of Object.entries(rollups?.regions ?? {}))
    regions.set(normaliseRegionId(id), block(region.officerTraining))
  const world = block(rollups?.world.officerTraining)
  return {
    world,
    regions,
    forRegion: id => regions.get(normaliseRegionId(id)) ?? NOT_AVAILABLE,
    available:
      world !== NOT_AVAILABLE ||
      [...regions.values()].some(b => b !== NOT_AVAILABLE),
    round2Started: started(2),
    round2Opens: windows[1]!.start,
  }
}
