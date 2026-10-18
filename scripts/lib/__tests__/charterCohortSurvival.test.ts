/**
 * Per-district charter cohort survival files (#2061; page #1817).
 *
 * The pipeline folds the club-district history it just built into one
 * small file per district, with the shared fold the survival page used to
 * run over all 100 shards in the browser. The real-data fixture is the
 * recorded prod history the page's own tests use (all 100 shards, trimmed
 * to the clubs whose byProgramYear names District 61 or 01 — every club a
 * D61 cohort can hold), and the committed D61 file is this fold's output
 * over it: the frontend checks that file against the in-browser fold.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  CharterCohortSurvivalFileSchema,
  CharterCohortSurvivalRollupFileSchema,
  DistrictRegionHistorySchema,
  buildCharterCohortSurvivalRollupFile,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  buildCharterCohortSurvivalFile,
  type ClubDistrictHistoryClub,
  type ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import {
  foldCharterCohortSurvival,
  foldCharterCohortSurvivalRollups,
} from '../charterCohortSurvival.js'
import type { ClubDistrictHistoryArtifact } from '../clubDistrictHistory.js'

const REPO = process.cwd()
const RECORDED_HISTORY = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/club-district-history-d61-d01.recorded.json'
)
const RECORDED_REGIONS = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/district-region-history-d61-d01.recorded.json'
)
const RECORDED_REGION_09 = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/charter-cohort-survival-region-09.json'
)
const RECORDED_WORLD = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/charter-cohort-survival-world.json'
)
const RECORDED_D61 = path.join(
  REPO,
  'frontend/src/__tests__/fixtures/charter-cohort-survival-d61.json'
)

function recordedHistory(): ClubDistrictHistoryArtifact {
  const raw = JSON.parse(fs.readFileSync(RECORDED_HISTORY, 'utf-8')) as {
    index: unknown
    shards: Record<string, unknown>
  }
  const shards: Record<string, ClubDistrictHistoryShard> = {}
  for (const [key, shard] of Object.entries(raw.shards)) {
    shards[key] = ClubDistrictHistoryShardSchema.parse(shard)
  }
  return { index: ClubDistrictHistoryIndexSchema.parse(raw.index), shards }
}

const allClubs = (h: ClubDistrictHistoryArtifact) => {
  const clubs: Record<string, ClubDistrictHistoryClub> = {}
  for (const s of Object.values(h.shards)) Object.assign(clubs, s.clubs)
  return clubs
}

describe('foldCharterCohortSurvival (#2061)', () => {
  const history = recordedHistory()
  const files = foldCharterCohortSurvival(history)

  it('writes one schema-valid file for every district the history names', () => {
    const named = new Set<string>()
    for (const club of Object.values(allClubs(history))) {
      for (const d of Object.values(club.byProgramYear)) named.add(d)
    }
    expect(Object.keys(files).sort()).toEqual([...named].sort())
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['61', '01']))
    for (const [id, file] of Object.entries(files)) {
      expect(CharterCohortSurvivalFileSchema.parse(file), id).toEqual(file)
      expect(file.districtId).toBe(id)
    }
  })

  it('each file is the shared fold over the whole history (grouping by charter district loses nothing)', () => {
    const clubs = allClubs(history)
    for (const id of ['61', '01']) {
      expect(files[id]).toEqual(
        buildCharterCohortSurvivalFile({
          index: history.index,
          clubs,
          districtId: id,
        })
      )
    }
  })

  it('reproduces the committed D61 file', () => {
    expect(files['61']).toEqual(
      JSON.parse(fs.readFileSync(RECORDED_D61, 'utf-8'))
    )
  })

  it('is small: the D61 file is a few KB gzipped, not the 1.2 MB of shards', () => {
    const gz = gzipSync(JSON.stringify(files['61'])).length
    expect(gz).toBeLessThan(20 * 1024)
  })

  it('gives identical bytes for any shard order', () => {
    const reversed: ClubDistrictHistoryArtifact = {
      index: history.index,
      shards: Object.fromEntries(Object.entries(history.shards).reverse()),
    }
    expect(JSON.stringify(foldCharterCohortSurvival(reversed))).toBe(
      JSON.stringify(files)
    )
  })

  it('skips a district id that cannot name an object, and says so', () => {
    const shard = history.shards['77']!
    const odd: ClubDistrictHistoryArtifact = {
      index: history.index,
      shards: {
        ...history.shards,
        '77': {
          ...shard,
          clubs: {
            ...shard.clubs,
            '99977': {
              ...Object.values(shard.clubs)[0]!,
              byProgramYear: { '2020-2021': '../x' },
            },
          },
        },
      },
    }
    const skipped: string[] = []
    const out = foldCharterCohortSurvival(odd, id => skipped.push(id))
    expect(Object.keys(out)).not.toContain('../x')
    expect(skipped).toEqual(['../x'])
  })
})

/**
 * #1818 — the region and world files, folded from the same history as the
 * district files, with each program year's own district → region
 * membership (the recorded prod region history, trimmed to the districts
 * the recorded club history names). The trimmed club history holds every
 * club that was ever in D61 or D01, so its Region 09 is D61's share of it
 * and its world is those clubs; the identities below hold for any input.
 */
describe('foldCharterCohortSurvivalRollups (#1818)', () => {
  const history = recordedHistory()
  const regionHistory = DistrictRegionHistorySchema.parse(
    JSON.parse(fs.readFileSync(RECORDED_REGIONS, 'utf-8'))
  )
  const districts = foldCharterCohortSurvival(history)
  const { regions, world } = foldCharterCohortSurvivalRollups(
    history,
    regionHistory
  )
  const latest = history.index.programYears.at(-1)!
  const chartered = (curves: {
    cohorts: { programYear: string; chartered: number }[]
  }): Record<string, number> =>
    Object.fromEntries(curves.cohorts.map(c => [c.programYear, c.chartered]))

  it('writes one schema-valid file per region the region history names, and one for the world', () => {
    const named = new Set<string>()
    for (const d of Object.values(regionHistory.districts)) {
      for (const r of Object.values(d.byProgramYear)) named.add(r)
    }
    expect(Object.keys(regions).sort()).toEqual([...named].sort())
    expect(Object.keys(regions)).toContain('09')
    for (const [id, file] of Object.entries(regions)) {
      expect(CharterCohortSurvivalRollupFileSchema.parse(file), id).toEqual(
        file
      )
      expect(file.scope).toEqual({ kind: 'region', regionId: id })
    }
    expect(CharterCohortSurvivalRollupFileSchema.parse(world)).toEqual(world)
    expect(world.scope).toEqual({ kind: 'world' })
  })

  it("a region's cohort is the sum of its districts' cohorts in that program year", () => {
    for (const [regionId, file] of Object.entries(regions)) {
      const got = chartered(file.byThroughProgramYear[latest]!)
      for (const [py, n] of Object.entries(got)) {
        let sum = 0
        for (const [d, df] of Object.entries(districts)) {
          if (regionHistory.districts[d]?.byProgramYear[py] !== regionId) {
            continue
          }
          sum += chartered(df.byThroughProgramYear[latest]!)[py] ?? 0
        }
        expect(n, `${regionId} ${py}`).toBe(sum)
      }
    }
    // D61 sat in Region 09 from 2018-19 to 2023-24: real cohorts there.
    const r09 = chartered(regions['09']!.byThroughProgramYear[latest]!)
    expect(r09['2019-2020']).toBeGreaterThan(0)
  })

  it("the world's cohort is the sum of every district's, with nothing moved away", () => {
    const got = chartered(world.byThroughProgramYear[latest]!)
    for (const [py, n] of Object.entries(got)) {
      let sum = 0
      for (const df of Object.values(districts)) {
        sum += chartered(df.byThroughProgramYear[latest]!)[py] ?? 0
      }
      expect(n, py).toBe(sum)
    }
    for (const curves of Object.values(world.byThroughProgramYear)) {
      expect(curves.cohorts.every(c => c.movedAway === 0)).toBe(true)
    }
  })

  it('each file is the shared fold over the whole history (grouping by charter region loses nothing)', () => {
    const clubs = allClubs(history)
    expect(regions['09']).toEqual(
      buildCharterCohortSurvivalRollupFile({
        index: history.index,
        clubs,
        regionHistory,
        scope: { kind: 'region', regionId: '09' },
      })
    )
    expect(world).toEqual(
      buildCharterCohortSurvivalRollupFile({
        index: history.index,
        clubs,
        regionHistory,
        scope: { kind: 'world' },
      })
    )
  })

  it('reproduces the committed Region 09 and world files', () => {
    expect(regions['09']).toEqual(
      JSON.parse(fs.readFileSync(RECORDED_REGION_09, 'utf-8'))
    )
    expect(world).toEqual(JSON.parse(fs.readFileSync(RECORDED_WORLD, 'utf-8')))
  })

  it('is small: a few KB gzipped each', () => {
    for (const file of [...Object.values(regions), world]) {
      expect(gzipSync(JSON.stringify(file)).length).toBeLessThan(20 * 1024)
    }
  })

  it('gives identical bytes for any shard order', () => {
    const reversed: ClubDistrictHistoryArtifact = {
      index: history.index,
      shards: Object.fromEntries(Object.entries(history.shards).reverse()),
    }
    expect(
      JSON.stringify(foldCharterCohortSurvivalRollups(reversed, regionHistory))
    ).toBe(JSON.stringify({ regions, world }))
  })

  it('skips a region id that cannot name an object, and says so', () => {
    const odd = structuredClone(regionHistory)
    odd.districts['61']!.byProgramYear['2020-2021'] = 'DNAR'
    const skipped: string[] = []
    const out = foldCharterCohortSurvivalRollups(history, odd, id =>
      skipped.push(id)
    )
    expect(Object.keys(out.regions)).not.toContain('DNAR')
    expect(skipped).toEqual(['DNAR'])
  })
})
