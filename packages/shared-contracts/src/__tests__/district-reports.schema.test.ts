import { describe, expect, it } from 'vitest'

import {
  DistrictReportsDatasetSchema,
  ReportSourceSchema,
  type DistrictReportsDataset,
} from '../index.js'

/**
 * Sprint 3 #1065 (epic #1062) — the de-identified per-district Daily Reports
 * dataset contract. Persisted separately from the base snapshot at
 * `snapshots/{date}/district_{id}_reports.json`. Every section carries
 * `sources: ReportSource[]` (reportType + tableId + asOf) so Sprint 4's
 * read-time overlay can attribute every field to a report + as-of date.
 */

const source = (reportType: string, tableId: string, asOf: string) => ({
  reportType,
  tableId,
  asOf,
})

const VALID: DistrictReportsDataset = {
  districtId: '61',
  programYear: '2025-2026',
  generatedAt: '2026-06-01T12:00:00.000Z',
  sections: {
    officerList: {
      sources: [
        source(
          'officer-list',
          '43abeb51-40a6-4514-868a-d697d6481753',
          'June 01, 2026'
        ),
        source(
          'officer-list',
          '68d834ff-90c1-40ae-a79e-c9270bd9919c',
          'June 01, 2026'
        ),
      ],
      records: [
        {
          club: '4311',
          clubName: 'McGill Club',
          division: 'G',
          area: '63',
          listStatus: 'Received - 12/16/2025',
          electionCadence: 'semiannual',
          officerListSubmitted: true,
        },
        {
          club: '1261',
          clubName: 'Some July Club',
          division: 'A',
          area: '11',
          listStatus: 'List Not Here',
          electionCadence: 'annual',
          officerListSubmitted: false,
        },
      ],
    },
    tripleCrown: {
      sources: [
        source(
          'triple-crown',
          'b546ef04-e602-4ffc-95c5-5a786aba36b7',
          'June 01, 2026'
        ),
      ],
      summary: { achieverCount: 12 },
    },
    coaches: {
      sources: [
        source(
          'coaches',
          '41955922-25ab-4a5a-8025-ebb7634f68bf',
          'June 01, 2026'
        ),
      ],
      records: [
        {
          club: '1296822',
          clubName: 'A Club',
          code: 'D',
          beginDate: '01/01/2026',
          status: 'PENDING',
          activeCoach: true,
        },
      ],
    },
  },
}

describe('DistrictReportsDatasetSchema', () => {
  it('accepts a well-formed dataset', () => {
    const r = DistrictReportsDatasetSchema.safeParse(VALID)
    expect(r.success).toBe(true)
  })

  it('requires districtId, programYear, generatedAt', () => {
    const { districtId: _omit, ...rest } = VALID
    expect(DistrictReportsDatasetSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects an unknown electionCadence value', () => {
    const bad = structuredClone(VALID)
    // @ts-expect-error — deliberately invalid enum value
    bad.sections.officerList!.records[0]!.electionCadence = 'quarterly'
    expect(DistrictReportsDatasetSchema.safeParse(bad).success).toBe(false)
  })

  it('requires officerListSubmitted to be a boolean', () => {
    const bad = structuredClone(VALID)
    // @ts-expect-error — deliberately wrong type
    bad.sections.officerList!.records[0]!.officerListSubmitted = 'yes'
    expect(DistrictReportsDatasetSchema.safeParse(bad).success).toBe(false)
  })

  it('requires the triple-crown summary achieverCount to be a non-negative integer', () => {
    const bad = structuredClone(VALID)
    bad.sections.tripleCrown!.summary.achieverCount = -1
    expect(DistrictReportsDatasetSchema.safeParse(bad).success).toBe(false)
  })

  // #1080 — the education record's count is RAW activity (achievementCount),
  // NOT DCP credit. The field name is the guard: a legacy `count`-shaped
  // record must fail validation so the ambiguous name can't sneak back in.
  it('education achievements require achievementCount; the legacy `count`-only shape fails (strip mode: unknown keys are dropped, the missing required field is what rejects)', () => {
    const record = {
      club: '1234',
      division: 'A',
      area: '1',
      name: 'Club X',
      location: 'Town',
      award: 'PM1',
      achievementCount: 2,
    }
    const sources = [
      source(
        'education-achievements',
        'c757d313-f815-4b22-93dc-b839d04cec7b',
        'June 01, 2026'
      ),
    ]
    const withActivity = structuredClone(VALID)
    withActivity.sections.educationAchievements = {
      sources,
      records: [record],
    }
    expect(DistrictReportsDatasetSchema.safeParse(withActivity).success).toBe(
      true
    )

    const { achievementCount, ...legacy } = record
    const withLegacyCount = structuredClone(VALID)
    withLegacyCount.sections.educationAchievements = {
      sources,
      // @ts-expect-error — the pre-#1080 shape: ambiguous `count`
      records: [{ ...legacy, count: achievementCount }],
    }
    expect(
      DistrictReportsDatasetSchema.safeParse(withLegacyCount).success
    ).toBe(false)
  })

  it('requires coach activeCoach to be a boolean', () => {
    const bad = structuredClone(VALID)
    // @ts-expect-error — deliberately wrong type
    bad.sections.coaches!.records[0]!.activeCoach = 1
    expect(DistrictReportsDatasetSchema.safeParse(bad).success).toBe(false)
  })

  it('allows an empty sections object (a district with no reports yet)', () => {
    const empty: DistrictReportsDataset = {
      districtId: '99',
      programYear: '2025-2026',
      generatedAt: '2026-06-01T12:00:00.000Z',
      sections: {},
    }
    expect(DistrictReportsDatasetSchema.safeParse(empty).success).toBe(true)
  })

  it('ReportSourceSchema requires reportType, tableId, asOf', () => {
    expect(
      ReportSourceSchema.safeParse(
        source(
          'coaches',
          '41955922-25ab-4a5a-8025-ebb7634f68bf',
          'June 01, 2026'
        )
      ).success
    ).toBe(true)
    expect(
      ReportSourceSchema.safeParse({ reportType: 'coaches' }).success
    ).toBe(false)
  })
})
