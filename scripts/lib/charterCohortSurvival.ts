/**
 * Per-district charter cohort survival files (#2061; page #1817).
 *
 * Folds the club-district history this run just built (#1782) into one
 * `config/charter-cohort-survival/district_<id>.json` per district, so the
 * survival page reads a few KB instead of all 100 history shards (~1.2 MB
 * gzipped, over the mobile route budget, #1827). The curves come from the
 * same shared fold the page runs as its fallback
 * (`buildCharterCohortSurvivalFile`, shared-contracts), so the rules are one
 * implementation: a moved club survives, the first folded program year
 * (2016-17) is censored, a year not reached is `null`, never 0.
 *
 * Every district the history names gets a file, cohorts or not, so the page
 * never falls back to the shards for a district the pipeline knows. Clubs
 * are grouped by their charter district first: a district's fold only ever
 * counts clubs it chartered, so each fold reads its own clubs, not 28 k.
 *
 * Determinism: districts and clubs are visited in sorted order, and the
 * only date is the history's `asOf`, so any shard order gives identical
 * bytes.
 */

import {
  buildCharterCohortSurvivalFile,
  buildCharterCohortSurvivalRollupFile,
  charterCohortSurvivalObjectPath,
  charterCohortSurvivalRollupObjectPath,
  type CharterCohortSurvivalFile,
  type CharterCohortSurvivalRollupFile,
  type ClubDistrictHistoryClub,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import type { ClubDistrictHistoryArtifact } from './clubDistrictHistory.js'

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The district a club was chartered in: its first program year's district. */
function charterDistrict(club: ClubDistrictHistoryClub): string | undefined {
  const first = Object.keys(club.byProgramYear).sort(byString)[0]
  return first === undefined ? undefined : club.byProgramYear[first]
}

/**
 * District id → its survival file. A district id that cannot name an object
 * (`charterCohortSurvivalObjectPath` refuses it) is passed to `onSkipped`
 * and gets no file.
 */
export function foldCharterCohortSurvival(
  history: ClubDistrictHistoryArtifact,
  onSkipped: (districtId: string) => void = () => {}
): Record<string, CharterCohortSurvivalFile> {
  const named = new Set<string>()
  const chartered = new Map<string, Record<string, ClubDistrictHistoryClub>>()

  const shardKeys = Object.keys(history.shards).sort(byString)
  for (const key of shardKeys) {
    const clubs = history.shards[key]!.clubs
    for (const id of Object.keys(clubs).sort(byString)) {
      const club = clubs[id]!
      for (const d of Object.values(club.byProgramYear)) named.add(d)
      const home = charterDistrict(club)
      if (home === undefined) continue
      const group = chartered.get(home) ?? {}
      group[id] = club
      chartered.set(home, group)
    }
  }

  const files: Record<string, CharterCohortSurvivalFile> = {}
  for (const districtId of [...named].sort(byString)) {
    try {
      charterCohortSurvivalObjectPath(districtId)
    } catch {
      onSkipped(districtId)
      continue
    }
    files[districtId] = buildCharterCohortSurvivalFile({
      index: history.index,
      clubs: chartered.get(districtId) ?? {},
      districtId,
    })
  }
  return files
}

export interface CharterCohortSurvivalRollups {
  /** Region id ("01".."14") → its file. */
  regions: Record<string, CharterCohortSurvivalRollupFile>
  world: CharterCohortSurvivalRollupFile
}

/**
 * The region and world files (#1818): `region_<NN>.json` for every region
 * the region history names, and `world.json`. Same shared fold and rules
 * as the district files; a club is in a region's cohort when its district
 * sat in that region in the club's charter program year (each year's own
 * membership, #1820). Clubs are grouped by their charter region first, as
 * the district fold groups by charter district. A region id that cannot
 * name an object is passed to `onSkipped` and gets no file.
 */
export function foldCharterCohortSurvivalRollups(
  history: ClubDistrictHistoryArtifact,
  regionHistory: Pick<DistrictRegionHistory, 'districts'>,
  onSkipped: (regionId: string) => void = () => {}
): CharterCohortSurvivalRollups {
  const named = new Set<string>()
  for (const id of Object.keys(regionHistory.districts).sort(byString)) {
    for (const r of Object.values(regionHistory.districts[id]!.byProgramYear))
      named.add(r)
  }

  const all: Record<string, ClubDistrictHistoryClub> = {}
  const chartered = new Map<string, Record<string, ClubDistrictHistoryClub>>()
  for (const key of Object.keys(history.shards).sort(byString)) {
    const clubs = history.shards[key]!.clubs
    for (const id of Object.keys(clubs).sort(byString)) {
      const club = clubs[id]!
      all[id] = club
      const first = Object.keys(club.byProgramYear).sort(byString)[0]
      if (first === undefined) continue
      const district = club.byProgramYear[first]!
      const region = regionHistory.districts[district]?.byProgramYear[first]
      if (region === undefined) continue
      const group = chartered.get(region) ?? {}
      group[id] = club
      chartered.set(region, group)
    }
  }

  const regions: Record<string, CharterCohortSurvivalRollupFile> = {}
  for (const regionId of [...named].sort(byString)) {
    const scope = { kind: 'region' as const, regionId }
    try {
      charterCohortSurvivalRollupObjectPath(scope)
    } catch {
      onSkipped(regionId)
      continue
    }
    regions[regionId] = buildCharterCohortSurvivalRollupFile({
      index: history.index,
      clubs: chartered.get(regionId) ?? {},
      regionHistory,
      scope,
    })
  }
  const world = buildCharterCohortSurvivalRollupFile({
    index: history.index,
    clubs: all,
    regionHistory,
    scope: { kind: 'world' },
  })
  return { regions, world }
}
