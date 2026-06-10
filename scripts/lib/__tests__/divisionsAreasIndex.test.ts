/**
 * Unit tests for scripts/lib/divisionsAreasIndex.ts (#1134)
 *
 * The daily Data Pipeline publishes config/divisions-areas-index.json — a
 * global index of every district's divisions and areas, mirroring
 * config/club-index.json — so omni-search (epic #1101 Sprint 2) can resolve
 * "District 61 Division C" / "Area 23" queries to scoped routes without
 * fetching 128 per-district snapshots.
 *
 * Fixtures are TRIMMED CAPTURES of live CDN payloads (2026-06-09), not
 * synthetic shapes (Lesson 154): district_61 (district-unique area numbering,
 * 8 divisions / 35 areas), district_01 (areas numbered 01..04 WITHIN each
 * division — areaId alone does not identify an area), district_04 (the
 * TI "unassigned" pseudo-division 0D with area 0A).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildDivisionsAreasIndex,
  parseDistrictFile,
  type DivisionsAreasIndex,
} from '../divisionsAreasIndex'

const FIXTURES = join(__dirname, 'fixtures', 'divisions-areas')

const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'))

const GENERATED_AT = '2026-06-10T08:00:00.000Z'
const SNAPSHOT_DATE = '2026-06-09'

const buildFromFixtures = (): DivisionsAreasIndex =>
  buildDivisionsAreasIndex(
    [
      loadFixture('district_61.json'),
      loadFixture('district_01.json'),
      loadFixture('district_04.json'),
    ],
    SNAPSHOT_DATE,
    GENERATED_AT
  )

// ── buildDivisionsAreasIndex over captured live shapes ─────────────────────

describe('buildDivisionsAreasIndex', () => {
  it('indexes every fixture district by its districtId', () => {
    const index = buildFromFixtures()
    expect(Object.keys(index.districts).sort()).toEqual(['01', '04', '61'])
  })

  it('maps each division to its sorted area ids (D61: district-unique numbering)', () => {
    const index = buildFromFixtures()
    const d61 = index.districts['61']
    expect(Object.keys(d61)).toEqual(['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'])
    expect(d61['A']).toEqual(['01', '02', '03', '04'])
    const areaCount = Object.values(d61).reduce((n, a) => n + a.length, 0)
    expect(areaCount).toBe(35)
  })

  it('keeps per-division area numbering distinct (D01: every division has an Area 01)', () => {
    const index = buildFromFixtures()
    const d01 = index.districts['01']
    expect(Object.keys(d01)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    // Same areaId under different divisions must NOT collapse.
    expect(d01['A']).toContain('01')
    expect(d01['B']).toContain('01')
    expect(Object.values(d01).reduce((n, a) => n + a.length, 0)).toBe(24)
  })

  it("preserves TI's unassigned pseudo-ids verbatim (D04: division 0D, area 0A)", () => {
    const index = buildFromFixtures()
    expect(index.districts['04']['0D']).toEqual(['0A'])
  })

  it('totals divisions and areas across all districts', () => {
    const index = buildFromFixtures()
    expect(index.totalDivisions).toBe(8 + 6 + 5)
    expect(index.totalAreas).toBe(35 + 24 + 17)
  })

  it('stamps snapshotDate and generatedAt verbatim', () => {
    const index = buildFromFixtures()
    expect(index.snapshotDate).toBe(SNAPSHOT_DATE)
    expect(index.generatedAt).toBe(GENERATED_AT)
  })

  it('sorts district and division keys for deterministic output', () => {
    const index = buildFromFixtures()
    const districtKeys = Object.keys(index.districts)
    expect(districtKeys).toEqual([...districtKeys].sort())
    for (const divisions of Object.values(index.districts)) {
      const divKeys = Object.keys(divisions)
      expect(divKeys).toEqual([...divKeys].sort())
      for (const areas of Object.values(divisions)) {
        expect(areas).toEqual([...areas].sort())
      }
    }
  })
})

// ── Shape tolerance (mirrors the club-index step's raw.data || raw) ───────

describe('buildDivisionsAreasIndex shape tolerance', () => {
  it('accepts a bare DistrictStatisticsFile payload (no collector wrapper)', () => {
    const wrapped = loadFixture('district_61.json') as { data: unknown }
    const index = buildDivisionsAreasIndex(
      [wrapped.data],
      SNAPSHOT_DATE,
      GENERATED_AT
    )
    expect(Object.keys(index.districts)).toEqual(['61'])
    expect(index.totalAreas).toBe(35)
  })

  it("creates a division key for an area whose division is missing from divisions[] (faithful to areas[], TI's source of truth)", () => {
    const payload = {
      districtId: '99',
      divisions: [{ divisionId: 'A', divisionName: 'Division A' }],
      areas: [
        { areaId: '01', areaName: 'Area 01', divisionId: 'A' },
        { areaId: '02', areaName: 'Area 02', divisionId: 'Z' },
      ],
    }
    const index = buildDivisionsAreasIndex(
      [payload],
      SNAPSHOT_DATE,
      GENERATED_AT
    )
    expect(index.districts['99']).toEqual({ A: ['01'], Z: ['02'] })
    expect(index.totalDivisions).toBe(2)
  })

  it('dedupes a repeated (division, area) pair', () => {
    const payload = {
      districtId: '99',
      divisions: [{ divisionId: 'A', divisionName: 'Division A' }],
      areas: [
        { areaId: '01', areaName: 'Area 01', divisionId: 'A' },
        { areaId: '01', areaName: 'Area 01', divisionId: 'A' },
      ],
    }
    const index = buildDivisionsAreasIndex(
      [payload],
      SNAPSHOT_DATE,
      GENERATED_AT
    )
    expect(index.districts['99']['A']).toEqual(['01'])
    expect(index.totalAreas).toBe(1)
  })

  it('keeps a division that has no areas as an empty list', () => {
    const payload = {
      districtId: '99',
      divisions: [{ divisionId: 'A', divisionName: 'Division A' }],
      areas: [],
    }
    const index = buildDivisionsAreasIndex(
      [payload],
      SNAPSHOT_DATE,
      GENERATED_AT
    )
    expect(index.districts['99']).toEqual({ A: [] })
    expect(index.totalDivisions).toBe(1)
    expect(index.totalAreas).toBe(0)
  })

  it('skips payloads missing a districtId or divisions/areas arrays without throwing', () => {
    const index = buildDivisionsAreasIndex(
      [{}, { districtId: '98' }, null, 42],
      SNAPSHOT_DATE,
      GENERATED_AT
    )
    // districtId alone with no divisions/areas contributes an empty district —
    // it IS a real district file; shapeless junk contributes nothing.
    expect(index.districts['98']).toEqual({})
    expect(Object.keys(index.districts)).toEqual(['98'])
    expect(index.totalDivisions).toBe(0)
    expect(index.totalAreas).toBe(0)
  })

  it('returns an empty index for an empty file list', () => {
    const index = buildDivisionsAreasIndex([], SNAPSHOT_DATE, GENERATED_AT)
    expect(index.districts).toEqual({})
    expect(index.totalDivisions).toBe(0)
    expect(index.totalAreas).toBe(0)
  })
})

// ── parseDistrictFile (corrupt-file skip policy, mirrors club-index) ──────

describe('parseDistrictFile', () => {
  it('parses valid JSON', () => {
    expect(parseDistrictFile('{"districtId":"61"}')).toEqual({
      districtId: '61',
    })
  })

  it('returns null for corrupt JSON instead of throwing', () => {
    expect(parseDistrictFile('{truncated')).toBeNull()
  })
})
