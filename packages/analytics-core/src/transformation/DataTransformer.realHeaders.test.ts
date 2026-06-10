/**
 * DataTransformer real-header tests (#1124, epic #1096 H3).
 *
 * Every published snapshot carried structurally-zero division/area/totals
 * aggregates because the extractors read CSV columns that do not exist in
 * the real Toastmasters dashboard exports ('Club Count', 'Membership',
 * 'Total to Date' on clubPerformance) and matched 'distinguished' word
 * forms against letter codes (D/S/P/M).
 *
 * The captured-pair suite pins the REAL District 61 CSVs from the staging
 * bucket (raw-csv/2026-06-09), cross-checked against TI's own division
 * report: synthetic fixtures validate the code, only a captured real pair
 * validates the policy (Lesson 154). The synthetic suites pin the real
 * header names (R20 spirit) for the joined payments path and the
 * letter-code tier counting.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataTransformer } from './DataTransformer.js'
import type { RawCSVData } from '../interfaces.js'

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '__tests__',
  'fixtures',
  'd61-2026-06-09'
)

const loadRows = (name: string): string[][] =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf-8')) as string[][]

const capturedCsvData = (): RawCSVData => ({
  clubPerformance: loadRows('club-performance.json'),
  divisionPerformance: loadRows('division-performance.json'),
  districtPerformance: loadRows('district-performance.json'),
})

describe('DataTransformer real headers (#1124)', () => {
  describe('captured District 61 pair (staging raw-csv/2026-06-09)', () => {
    // Ground truth computed directly from the captured CSVs and
    // cross-checked against TI's division report columns
    // ('Membership to date' sums match 'Active Members' sums exactly).
    const EXPECTED_DIVISIONS: Record<
      string,
      { clubCount: number; membershipTotal: number; paymentsTotal: number }
    > = {
      A: { clubCount: 18, membershipTotal: 281, paymentsTotal: 587 },
      B: { clubCount: 28, membershipTotal: 374, paymentsTotal: 789 },
      C: { clubCount: 23, membershipTotal: 321, paymentsTotal: 674 },
      D: { clubCount: 17, membershipTotal: 268, paymentsTotal: 564 },
      F: { clubCount: 20, membershipTotal: 364, paymentsTotal: 784 },
      G: { clubCount: 19, membershipTotal: 466, paymentsTotal: 963 },
      H: { clubCount: 18, membershipTotal: 343, paymentsTotal: 716 },
      I: { clubCount: 19, membershipTotal: 370, paymentsTotal: 731 },
    }

    it('extracts non-zero division aggregates matching the TI division report', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV(
        '2026-06-09',
        '61',
        capturedCsvData()
      )

      expect(result.divisions).toHaveLength(8)
      for (const division of result.divisions) {
        const expected = EXPECTED_DIVISIONS[division.divisionId]
        expect(
          expected,
          `unexpected division ${division.divisionId}`
        ).toBeDefined()
        expect(division, `division ${division.divisionId}`).toEqual({
          divisionId: division.divisionId,
          divisionName: `Division ${division.divisionId}`,
          ...expected,
        })
      }
    })

    it('extracts non-zero area aggregates with payments from district-performance', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV(
        '2026-06-09',
        '61',
        capturedCsvData()
      )

      expect(result.areas).toHaveLength(35)
      const a01 = result.areas.find(
        a => a.divisionId === 'A' && a.areaId === '01'
      )
      expect(a01).toEqual({
        areaId: '01',
        areaName: 'Area 01',
        divisionId: 'A',
        clubCount: 5,
        membershipTotal: 55,
        paymentsTotal: 131,
      })
    })

    it('keeps divisions, areas, and totals internally consistent (same club universe)', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV(
        '2026-06-09',
        '61',
        capturedCsvData()
      )

      const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0)
      const divisionPayments = sum(result.divisions.map(d => d.paymentsTotal))
      const areaPayments = sum(result.areas.map(a => a.paymentsTotal))
      const divisionMembers = sum(result.divisions.map(d => d.membershipTotal))
      const areaMembers = sum(result.areas.map(a => a.membershipTotal))
      const divisionClubs = sum(result.divisions.map(d => d.clubCount))
      const areaClubs = sum(result.areas.map(a => a.clubCount))

      expect(divisionPayments).toBe(result.totals.totalPayments)
      expect(areaPayments).toBe(result.totals.totalPayments)
      expect(divisionMembers).toBe(result.totals.totalMembership)
      expect(areaMembers).toBe(result.totals.totalMembership)
      expect(divisionClubs).toBe(result.totals.totalClubs)
      expect(areaClubs).toBe(result.totals.totalClubs)
    })

    it('counts distinguished tiers from letter codes (D/S/P/M, per-tier)', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV(
        '2026-06-09',
        '61',
        capturedCsvData()
      )

      expect(result.totals).toEqual({
        totalClubs: 162,
        totalMembership: 2787,
        totalPayments: 5808,
        // Per-tier counts (disjoint), captured 2026-06-09. Sum = 57
        // distinguished-or-better, matching the audit's D61 truth.
        distinguishedClubs: 20,
        selectDistinguishedClubs: 14,
        presidentDistinguishedClubs: 11,
        smedleyDistinguishedClubs: 12,
      })
    })
  })

  describe('letter-code tier counting (synthetic, real headers)', () => {
    const clubRow = (id: string, tier: string): string[] => [
      id,
      `Club ${id}`,
      'A',
      '01',
      '20',
      tier,
    ]
    const header = [
      'Club Number',
      'Club Name',
      'Division',
      'Area',
      'Active Members',
      'Club Distinguished Status',
    ]

    it('maps D/S/P/M to disjoint per-tier counts and ignores blank', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV('2026-06-09', '61', {
        clubPerformance: [
          header,
          clubRow('1001', 'D'),
          clubRow('1002', 'S'),
          clubRow('1003', 'P'),
          clubRow('1004', 'M'),
          clubRow('1005', ''),
        ],
        divisionPerformance: [],
        districtPerformance: [],
      })

      expect(result.totals.distinguishedClubs).toBe(1)
      expect(result.totals.selectDistinguishedClubs).toBe(1)
      expect(result.totals.presidentDistinguishedClubs).toBe(1)
      expect(result.totals.smedleyDistinguishedClubs).toBe(1)
    })

    it('still classifies legacy word-form statuses, per-tier', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV('2024-01-15', '61', {
        clubPerformance: [
          header,
          clubRow('1001', 'Distinguished'),
          clubRow('1002', 'Select Distinguished'),
          clubRow('1003', "President's Distinguished"),
          clubRow('1004', 'Smedley Distinguished'),
        ],
        divisionPerformance: [],
        districtPerformance: [],
      })

      expect(result.totals.distinguishedClubs).toBe(1)
      expect(result.totals.selectDistinguishedClubs).toBe(1)
      expect(result.totals.presidentDistinguishedClubs).toBe(1)
      expect(result.totals.smedleyDistinguishedClubs).toBe(1)
    })
  })

  describe('division/area payments joined from district-performance (synthetic, real headers)', () => {
    it('sums per-club Total to Date by division and area, normalizing padded club ids', async () => {
      const transformer = new DataTransformer()
      const result = await transformer.transformRawCSV('2026-06-09', '61', {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['00003045', 'Club One', 'A', '01', '13'],
          ['00009560', 'Club Two', 'A', '01', '8'],
          ['00012345', 'Club Three', 'B', '21', '30'],
        ],
        divisionPerformance: [],
        districtPerformance: [
          ['Club', 'New', 'Total to Date'],
          ['00003045', '5', '23'],
          ['00009560', '2', '17'],
          ['00012345', '1', '40'],
        ],
      })

      expect(result.divisions).toEqual([
        {
          divisionId: 'A',
          divisionName: 'Division A',
          clubCount: 2,
          membershipTotal: 21,
          paymentsTotal: 40,
        },
        {
          divisionId: 'B',
          divisionName: 'Division B',
          clubCount: 1,
          membershipTotal: 30,
          paymentsTotal: 40,
        },
      ])
      expect(result.areas).toEqual([
        {
          areaId: '01',
          areaName: 'Area 01',
          divisionId: 'A',
          clubCount: 2,
          membershipTotal: 21,
          paymentsTotal: 40,
        },
        {
          areaId: '21',
          areaName: 'Area 21',
          divisionId: 'B',
          clubCount: 1,
          membershipTotal: 30,
          paymentsTotal: 40,
        },
      ])
    })
  })
})
