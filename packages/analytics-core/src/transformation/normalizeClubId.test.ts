/**
 * Club-id canonicalization in the transformer (#1440).
 *
 * The transformer is the WRITE end of club identity: whatever form it stores
 * is the form every downstream reader (club index, diff engine, frontend
 * pages, MCP server) has to cope with. Before #1440 it stored the raw CSV
 * form — so a program year exported with `00009905` and one exported with
 * `9905` produced snapshots that no strict comparison could join.
 *
 * The normalizer itself now lives in `@taverns-red/shared-contracts`
 * (`normalizeClubId`) and is unit-tested there. These tests pin the
 * transformer's use of it: the canonical form on the way IN, and the
 * clubPerformance↔districtPerformance join that has always depended on it.
 *
 * Requirements: 2.1, 2.4 (leading zeros stripped; never an empty id)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeClubId } from '@taverns-red/shared-contracts'
import { DataTransformer } from './DataTransformer.js'
import type { RawCSVData } from '../interfaces.js'

/**
 * Type-safe accessor for private methods in tests.
 * Test files are excluded from the main tsconfig compilation,
 * so this accessor is scoped to test code only.
 */
interface DataTransformerTestAccess {
  buildDistrictPerformanceLookup(
    districtPerformance: Record<string, string | number | null>[]
  ): Map<string, Record<string, string | number | null>>
}

function getTestAccess(
  transformer: DataTransformer
): DataTransformerTestAccess {
  return transformer as unknown as DataTransformerTestAccess
}

const CP_HEADER = [
  'Club Number',
  'Club Name',
  'Division',
  'Area',
  'Active Members',
  'Goals Met',
  'Club Status',
  'Mem. Base',
]

function csv(clubNumber: string): RawCSVData {
  return {
    clubPerformance: [
      CP_HEADER,
      [clubNumber, 'Leading Zero Club', 'A', '1', '25', '5', 'Active', '20'],
    ],
    divisionPerformance: [],
    districtPerformance: [],
  }
}

describe('write-time club-id canonicalization (#1440)', () => {
  let transformer: DataTransformer

  beforeEach(() => {
    transformer = new DataTransformer()
  })

  it('stores the canonical (bare) club id when the export is zero-padded', async () => {
    const result = await transformer.transformRawCSV(
      '2026-01-15',
      '61',
      csv('00009905')
    )

    expect(result.clubs[0]!.clubId).toBe('9905')
  })

  it('stores the same canonical id when the export is already bare', async () => {
    const result = await transformer.transformRawCSV(
      '2026-01-15',
      '61',
      csv('9905')
    )

    expect(result.clubs[0]!.clubId).toBe('9905')
  })

  it('produces an identical stored id from either export form', async () => {
    const padded = await transformer.transformRawCSV(
      '2026-01-15',
      '61',
      csv('00009905')
    )
    const bare = await transformer.transformRawCSV(
      '2026-01-15',
      '61',
      csv('9905')
    )

    expect(padded.clubs[0]!.clubId).toBe(bare.clubs[0]!.clubId)
  })

  it('agrees with the shared normalizer (no second definition)', async () => {
    const result = await transformer.transformRawCSV(
      '2026-01-15',
      '61',
      csv('0000180')
    )

    expect(result.clubs[0]!.clubId).toBe(normalizeClubId('0000180'))
  })

  /**
   * The clubPerformance↔districtPerformance join has always used the
   * normalized form. It still does — via the shared helper.
   */
  describe('districtPerformance lookup keying', () => {
    let access: DataTransformerTestAccess

    beforeEach(() => {
      access = getTestAccess(transformer)
    })

    it('keys the lookup map by the canonical club id', () => {
      const lookup = access.buildDistrictPerformanceLookup([
        { Club: '00009905', 'Oct. Ren.': '9', 'Apr. Ren.': '4' },
      ])

      expect(lookup.has('9905')).toBe(true)
      expect(lookup.has('00009905')).toBe(false)
    })

    it('preserves an all-zeros club id as a lookup key, never empty', () => {
      const lookup = access.buildDistrictPerformanceLookup([
        { Club: '0000', 'Oct. Ren.': '1' },
      ])

      expect(lookup.has('0000')).toBe(true)
      expect(lookup.has('')).toBe(false)
    })

    it('collapses mixed club-id formats onto one key each', () => {
      const lookup = access.buildDistrictPerformanceLookup([
        { Club: '00001234', 'Oct. Ren.': '3' },
        { Club: '5678', 'Oct. Ren.': '7' },
        { Club: '0100', 'Oct. Ren.': '2' },
      ])

      expect(lookup.has('1234')).toBe(true)
      expect(lookup.has('5678')).toBe(true)
      expect(lookup.has('100')).toBe(true)
      expect(lookup.size).toBe(3)
    })
  })
})
