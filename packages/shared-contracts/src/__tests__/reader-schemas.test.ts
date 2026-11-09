/**
 * Reader schemas tolerate an added field (#2493, ADR 0019 step 0 in
 * `taverns-red/ops`).
 *
 * The frontend and the mcp-server parse CDN files with these schemas. A
 * newer pipeline may add a field; the release that's live (or a rolled-back
 * one) must still read the file. So each reader schema accepts an unknown
 * key, at the top level and inside nested objects, and drops it.
 *
 * The writer and publish-gate schemas stay strict: there an extra key is a
 * privacy leak or a typo, and must fail. The last block pins that.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'

import {
  ClubsByRegionShardReaderSchema,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldReaderSchema,
  ClubsByRegionWorldSchema,
  DistrictReportsDatasetReaderSchema,
  findStrictObjects,
  DistrictReportsDatasetSchema,
  EducationRollupIndexReaderSchema,
  EducationRollupIndexSchema,
  EducationRollupProgramYearReaderSchema,
  EducationRollupProgramYearSchema,
  EducationTimelineEntityReaderSchema,
  EducationTimelineEntitySchema,
  GlobalClubRaceReaderSchema,
  GlobalClubRaceSchema,
  PerDistrictDataReaderSchema,
  PerDistrictDataSchema,
  RegionMembershipSeriesReaderSchema,
  RegionMembershipSeriesSchema,
  RegionRollupsReaderSchema,
  RegionRollupsSchema,
  ReportsRollupsReaderSchema,
  ReportsRollupsSchema,
  SuspendedClubsReaderSchema,
  SuspendedClubsSchema,
} from '../index.js'
import {
  EDUCATION_ROLLUP,
  EDUCATION_ROLLUP_INDEX,
  EDUCATION_TIMELINE_ENTITY,
  GLOBAL_CLUB_RACE,
  SUSPENDED_CLUBS,
} from './__fixtures__/reader-payloads.js'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf-8'))

const clubsByRegion = fixture(
  './__fixtures__/recorded-clubs-by-region.json'
) as { shards: Record<string, unknown>; world: unknown }

type Path = Array<string | number>

interface Case {
  name: string
  reader: ZodType
  writer: ZodType
  payload: unknown
  /** Where the extra key goes: the top level and nested objects. */
  at: Path[]
}

const CASES: Case[] = [
  {
    name: 'DistrictReportsDataset',
    reader: DistrictReportsDatasetReaderSchema,
    writer: DistrictReportsDatasetSchema,
    payload: fixture(
      './fixtures/district-reports/d47-2026-10-15-linked-location.json'
    ),
    at: [[], ['sections', 'sponsorsMentors', 'records', 0]],
  },
  {
    name: 'SuspendedClubs',
    reader: SuspendedClubsReaderSchema,
    writer: SuspendedClubsSchema,
    payload: SUSPENDED_CLUBS,
    at: [[], ['districts', '83', 0]],
  },
  {
    name: 'GlobalClubRace',
    reader: GlobalClubRaceReaderSchema,
    writer: GlobalClubRaceSchema,
    payload: GLOBAL_CLUB_RACE,
    at: [[], ['reached', 0, 'tiers']],
  },
  {
    name: 'RegionRollups',
    reader: RegionRollupsReaderSchema,
    writer: RegionRollupsSchema,
    payload: fixture('./__fixtures__/recorded-region-rollups.json'),
    at: [[], ['_format'], ['districts', '68', 'health']],
  },
  {
    name: 'ClubsByRegionShard',
    reader: ClubsByRegionShardReaderSchema,
    writer: ClubsByRegionShardSchema,
    payload: clubsByRegion.shards['12'],
    at: [[], ['clubs', 0]],
  },
  {
    name: 'ClubsByRegionWorld',
    reader: ClubsByRegionWorldReaderSchema,
    writer: ClubsByRegionWorldSchema,
    payload: clubsByRegion.world,
    at: [[], ['totals']],
  },
  {
    name: 'RegionMembershipSeries',
    reader: RegionMembershipSeriesReaderSchema,
    writer: RegionMembershipSeriesSchema,
    payload: fixture('./__fixtures__/recorded-region-membership-series.json'),
    at: [[], ['regionMembership'], ['world']],
  },
  {
    name: 'EducationRollupProgramYear',
    reader: EducationRollupProgramYearReaderSchema,
    writer: EducationRollupProgramYearSchema,
    payload: EDUCATION_ROLLUP,
    at: [[], ['districts', '61', 'awards', 'totals']],
  },
  {
    name: 'EducationRollupIndex',
    reader: EducationRollupIndexReaderSchema,
    writer: EducationRollupIndexSchema,
    payload: EDUCATION_ROLLUP_INDEX,
    at: [[], ['programYears', 0]],
  },
  {
    name: 'EducationTimelineEntity',
    reader: EducationTimelineEntityReaderSchema,
    writer: EducationTimelineEntitySchema,
    payload: EDUCATION_TIMELINE_ENTITY,
    at: [[], ['entity'], ['points', 0], ['prior'], ['prior', 'points', 0]],
  },
  {
    name: 'ReportsRollups',
    reader: ReportsRollupsReaderSchema,
    writer: ReportsRollupsSchema,
    payload: fixture('./__fixtures__/recorded-reports-rollups.json'),
    at: [[], ['districts', '61', 'prospective', 'byStage', 0]],
  },
  {
    name: 'PerDistrictData',
    reader: PerDistrictDataReaderSchema,
    writer: PerDistrictDataSchema,
    payload: fixture('./__fixtures__/recorded-district-snapshot.json'),
    at: [[], ['data', 'clubPerformance', 0, 'address']],
  },
]

const EXTRA = 'addedByANewerPipeline'

const get = (value: unknown, path: Path): Record<string, unknown> => {
  let v = value as Record<string | number, unknown>
  for (const k of path) v = v[k] as Record<string | number, unknown>
  if (v === null || typeof v !== 'object') {
    throw new Error(`no object at ${path.join('.') || '<root>'}`)
  }
  return v as Record<string, unknown>
}

const withExtraKey = (c: Case): unknown => {
  const payload = structuredClone(c.payload)
  for (const path of c.at) get(payload, path)[EXTRA] = 1
  return payload
}

describe('reader schemas accept an added field and drop it (#2493)', () => {
  it.each(CASES)('$name: the unchanged payload parses', c => {
    expect(c.reader.safeParse(c.payload).error?.issues).toBeUndefined()
  })

  it.each(CASES)('$name: reads exactly what the writer schema reads', c => {
    expect(c.reader.parse(c.payload)).toEqual(c.writer.parse(c.payload))
  })

  it.each(CASES)('$name: no object left that rejects unknown keys', c => {
    expect(findStrictObjects(c.reader)).toEqual([])
  })

  it.each(CASES)('$name: an extra key, top level and nested', c => {
    const r = c.reader.safeParse(withExtraKey(c))
    expect(r.error?.issues).toBeUndefined()
    for (const path of c.at) {
      expect(get(r.data, path)).not.toHaveProperty(EXTRA)
    }
  })
})

describe('writer and publish-gate schemas stay strict (#2493)', () => {
  it.each(CASES.filter(c => c.at.length > 1))(
    '$name: a nested extra key is an unrecognized key',
    c => {
      const nested = { ...c, at: c.at.slice(1) }
      const r = c.writer.safeParse(withExtraKey(nested))
      expect(r.success).toBe(false)
      expect(r.error?.issues.map(i => i.code)).toContain('unrecognized_keys')
    }
  )
})
