/**
 * Education rollup (#1801, epic #1781): per program year, the ledger's
 * awards counted per district, per region (that PY's own membership) and
 * worldwide; plus an index with the multi-year trend. The contract pins
 * what the consumers (#1793, #1807, #1810, #1811) rely on:
 *
 * - counts only: every object is strict, so no club, member or per-row field
 *   can ride along (Lesson 153);
 * - Legacy and Pathways both counted (Ron, 2026-10-11): totals.awards is the
 *   sum of the four programs; the level × path matrix is Pathways only;
 * - "not available" is a status with a reason, never a zero row;
 * - members with an award / Triple Crown are null when not measured.
 */

import { describe, it, expect } from 'vitest'
import {
  EducationRollupProgramYearSchema,
  EducationRollupIndexSchema,
  educationRollupObjectPath,
  EDUCATION_ROLLUP_INDEX_PATH,
  EDUCATION_ROLLUP_VERSION,
  type EducationAwardsBlock,
  type EducationRollupProgramYear,
} from '../index.js'

const block = (
  over: Partial<EducationAwardsBlock> = {}
): EducationAwardsBlock => ({
  totals: { awards: 6, pathways: 3, legacy: 1, dtm: 1, other: 1 },
  pathwaysMatrix: { PM: [2, 1, 0, 0, 0] },
  legacyByCode: { CC: 1 },
  otherByCode: { PWMENTORPGM: 1 },
  clubsWithAward: 2,
  membersWithAward: null,
  tripleCrownAchievers: null,
  ...over,
})

const rollup = (
  over: Partial<EducationRollupProgramYear> = {}
): EducationRollupProgramYear => ({
  _format: { version: EDUCATION_ROLLUP_VERSION, type: 'education-rollup' },
  programYear: '2018-2019',
  source: 'ledger-history',
  sourceDate: null,
  districts: {
    '61': { status: 'available', region: '09', awards: block() },
    '17': { status: 'not-available', region: null, reason: 'no-data' },
  },
  regions: {
    '09': { ...block(), districtsAvailable: ['61'], districtsNotAvailable: [] },
  },
  regionsUnassigned: ['17'],
  world: {
    ...block(),
    districtsAvailable: ['61'],
    districtsNotAvailable: ['17'],
  },
  ...over,
})

describe('EducationRollupProgramYearSchema', () => {
  it('accepts a well-formed rollup', () => {
    expect(EducationRollupProgramYearSchema.parse(rollup())).toEqual(rollup())
  })

  it('rejects totals whose programs do not sum to awards', () => {
    const bad = rollup({
      world: {
        ...block({
          totals: { awards: 7, pathways: 3, legacy: 1, dtm: 1, other: 1 },
        }),
        districtsAvailable: ['61'],
        districtsNotAvailable: ['17'],
      },
    })
    expect(EducationRollupProgramYearSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a matrix that does not sum to the Pathways total', () => {
    const bad = rollup({
      districts: {
        '61': {
          status: 'available',
          region: '09',
          awards: block({ pathwaysMatrix: { PM: [9, 0, 0, 0, 0] } }),
        },
      },
    })
    expect(EducationRollupProgramYearSchema.safeParse(bad).success).toBe(false)
  })

  it('carries no extra field: a club or member name cannot ride along', () => {
    const withName = {
      ...rollup(),
      districts: {
        '61': {
          status: 'available',
          region: '09',
          awards: { ...block(), clubName: 'Los Amigos' },
        },
      },
    }
    expect(EducationRollupProgramYearSchema.safeParse(withName).success).toBe(
      false
    )
  })

  it('a not-available district has a reason and no counts', () => {
    const zeroed = {
      ...rollup(),
      districts: {
        '17': {
          status: 'not-available',
          region: null,
          reason: 'no-data',
          awards: block(),
        },
      },
    }
    expect(EducationRollupProgramYearSchema.safeParse(zeroed).success).toBe(
      false
    )
  })

  it('a reports-sourced year names the snapshot date it read', () => {
    expect(
      EducationRollupProgramYearSchema.safeParse(
        rollup({ source: 'reports', sourceDate: null })
      ).success
    ).toBe(false)
    expect(
      EducationRollupProgramYearSchema.safeParse(
        rollup({ source: 'reports', sourceDate: '2020-06-30' })
      ).success
    ).toBe(true)
  })

  it('regions is null for a program year with no region membership', () => {
    expect(
      EducationRollupProgramYearSchema.safeParse(
        rollup({ regions: null, regionsUnassigned: [] })
      ).success
    ).toBe(true)
  })
})

describe('EducationRollupIndexSchema', () => {
  it('accepts an index with a per-PY world row and the trend', () => {
    const index = {
      _format: {
        version: EDUCATION_ROLLUP_VERSION,
        type: 'education-rollup-index',
      },
      asOf: '2026-10-12',
      programYears: [
        {
          programYear: '2018-2019',
          source: 'ledger-history',
          sourceDate: null,
          path: 'derived/education-rollup/2018-2019.json',
          world: { awards: 6, pathways: 3, legacy: 1, dtm: 1, other: 1 },
          districtsAvailable: 1,
          districtsNotAvailable: 1,
        },
      ],
      omittedProgramYears: [
        { programYear: '2016-2017', reason: 'no reports at any snapshot date' },
      ],
      trend: {
        districts: {
          '61': {
            '2018-2019': {
              awards: 6,
              pathways: 3,
              legacy: 1,
              dtm: 1,
              other: 1,
            },
          },
          '17': { '2018-2019': null },
        },
        regions: {
          '09': {
            '2018-2019': {
              awards: 6,
              pathways: 3,
              legacy: 1,
              dtm: 1,
              other: 1,
            },
          },
        },
      },
    }
    expect(EducationRollupIndexSchema.parse(index)).toEqual(index)
  })
})

describe('paths', () => {
  it('one object per program year under derived/education-rollup/', () => {
    expect(educationRollupObjectPath('2018-2019')).toBe(
      'derived/education-rollup/2018-2019.json'
    )
    expect(EDUCATION_ROLLUP_INDEX_PATH).toBe(
      'derived/education-rollup/index.json'
    )
  })

  it('refuses a malformed program year', () => {
    expect(() => educationRollupObjectPath('2018-19')).toThrow()
    expect(() => educationRollupObjectPath('../x')).toThrow()
  })
})
