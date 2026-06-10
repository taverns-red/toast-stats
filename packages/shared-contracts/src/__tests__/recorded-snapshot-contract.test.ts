/**
 * Write-contract regression anchor against a RECORDED live-CDN snapshot
 * (#1123 / epic #1096, audit §9a).
 *
 * The fixture is a truncated + sanitized copy of the real
 * `snapshots/2026-06-08/district_61.json` payload, recorded by
 * `packages/mcp-server/scripts/record-fixtures.mjs`. It carries the
 * FAC-enriched `clubPerformance` rows production has shipped since
 * 2026-05-15 (#429/#431): `coordinates`/`address` objects and
 * `allowsVirtualAttendance`/`isProspective` booleans on 158/162 rows.
 *
 * The previous hand-invented fixtures had `clubPerformance: []`, so every
 * schema test passed while the real payload failed validation and 2 of 8
 * MCP tools were down in production. This file pins the contract to what
 * the collector actually writes.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  ClubStatisticsFileSchema,
  ScrapedRecordSchema,
} from '../schemas/district-statistics-file.schema.js'
import { PerDistrictDataSchema } from '../schemas/per-district-data.schema.js'

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'recorded-district-snapshot.json'
)
const recorded = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  data: {
    clubs: Record<string, unknown>[]
    clubPerformance: Record<string, unknown>[]
  }
}

describe('recorded live-CDN snapshot — write contract (#1123)', () => {
  it('the fixture still reproduces the FAC-enriched shape (guards re-recording)', () => {
    // If a future re-recording loses the enriched rows, every test below
    // would pass vacuously — fail loudly instead.
    const enriched = recorded.data.clubPerformance.filter(
      r => typeof r['coordinates'] === 'object' && r['coordinates'] !== null
    )
    expect(enriched.length).toBeGreaterThanOrEqual(3)
    expect(
      enriched.some(r => typeof r['allowsVirtualAttendance'] === 'boolean')
    ).toBe(true)
    expect(recorded.data.clubPerformance.some(r => !('coordinates' in r))).toBe(
      true
    )
  })

  it('PerDistrictDataSchema accepts the recorded snapshot', () => {
    const res = PerDistrictDataSchema.safeParse(recorded)
    if (!res.success) {
      // Surface the first issue in the failure output for diagnosability.
      const issue = res.error.issues[0]
      expect
        .soft(`${issue?.path.join('.')}: ${issue?.message}`)
        .toBe('(no issues)')
    }
    expect(res.success).toBe(true)
  })

  it('ScrapedRecordSchema accepts a recorded FAC-enriched clubPerformance row', () => {
    const enriched = recorded.data.clubPerformance.find(
      r => 'coordinates' in r
    )!
    const res = ScrapedRecordSchema.safeParse(enriched)
    expect(res.success).toBe(true)
  })

  it('parsing a FAC-enriched row preserves the enrichment values', () => {
    const enriched = recorded.data.clubPerformance.find(
      r => 'coordinates' in r
    )!
    const parsed = ScrapedRecordSchema.parse(enriched)
    expect(parsed['coordinates']).toEqual(enriched['coordinates'])
    expect(parsed['address']).toEqual(enriched['address'])
    expect(parsed['allowsVirtualAttendance']).toBe(
      enriched['allowsVirtualAttendance']
    )
  })

  it('ClubStatisticsFileSchema preserves the FAC contact/meeting fields on parsed clubs', () => {
    // Audit §9a gap: phone/website/meetingDay/meetingTime/isProspective are
    // written onto .clubs[] rows by FindAClubMerger but were absent from the
    // schema, so zod silently STRIPPED them from every validating read.
    const club = recorded.data.clubs.find(c => 'phone' in c)!
    const res = ClubStatisticsFileSchema.safeParse(club)
    expect(res.success).toBe(true)
    if (res.success) {
      // Keyed access (not dotted) so this test type-checks at the Red step,
      // before the schema's inferred type carries the new fields.
      const parsed = res.data as Record<string, unknown>
      expect(parsed['phone']).toBe(club['phone'])
      expect(parsed['website']).toBe(club['website'])
      expect(parsed['meetingDay']).toBe(club['meetingDay'])
      expect(parsed['meetingTime']).toBe(club['meetingTime'])
      expect(parsed['isProspective']).toBe(club['isProspective'])
    }
  })
})
