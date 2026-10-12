/**
 * Education ledger history (#1802): the per-(PY, district) month-granular
 * ledger fetched from TI's Educational Achievement Archive for 2003-04 →
 * 2018-19. Consumed by the education rollup (#1801) and the multi-year trend
 * (#1807), so the contract pins what they rely on:
 *
 * - every record is one (club, award, yearMonth) group with a positive count;
 *   no member and no day-precision date can be carried (strict objects);
 * - `no-data` (TI returned an empty body: the district did not exist that PY)
 *   is distinct from `ok` and carries no records;
 * - award codes are tagged by program (Ron, 2026-10-11): Pathways levels,
 *   legacy codes, DTM under its own code, anything else Other;
 * - month-end as-of totals come from filtering on `yearMonth`.
 */

import { describe, it, expect } from 'vitest'
import {
  EducationLedgerHistoryFileSchema,
  EDUCATION_LEDGER_HISTORY_PREFIX,
  educationLedgerHistoryObjectPath,
  educationAwardProgram,
  ledgerRecordsThroughMonth,
  type EducationLedgerMonthRecord,
} from '../index.js'

const record = (
  over: Partial<EducationLedgerMonthRecord> = {}
): EducationLedgerMonthRecord => ({
  club: '1009147',
  division: 'D',
  area: '34',
  name: 'Los Amigos',
  location: 'Ottawa',
  award: 'PI1Persuasive Influence Level 1',
  awardCode: 'PI1',
  program: 'Pathways',
  yearMonth: '2018-08',
  achievementCount: 1,
  ...over,
})

const file = (over: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0.0',
  districtId: '61',
  programYear: '2018-2019',
  fetchedAt: '2026-10-12T15:00:00.000Z',
  source: {
    reportType: 'education-archive',
    tableId: 'a30b93f3-081e-42c8-9a36-137acb24be69',
  },
  status: 'ok',
  records: [record()],
  ...over,
})

describe('EducationLedgerHistoryFileSchema', () => {
  it('accepts an ok file with month-granular records', () => {
    expect(EducationLedgerHistoryFileSchema.safeParse(file()).success).toBe(
      true
    )
  })

  it('accepts a no-data file (district did not exist that PY) with no records', () => {
    const r = EducationLedgerHistoryFileSchema.safeParse(
      file({ status: 'no-data', records: [] })
    )
    expect(r.success).toBe(true)
  })

  it('rejects a no-data file that carries records', () => {
    expect(
      EducationLedgerHistoryFileSchema.safeParse(file({ status: 'no-data' }))
        .success
    ).toBe(false)
  })

  it.each([
    ['a member field', { member: 'Jane Doe' }],
    ['a day-precision date', { date: '08/29/2018' }],
  ])(
    'rejects a record carrying %s (strict: nothing per-row survives)',
    (_, extra) => {
      const r = EducationLedgerHistoryFileSchema.safeParse(
        file({ records: [{ ...record(), ...extra }] })
      )
      expect(r.success).toBe(false)
    }
  )

  it.each(['2018-8', '2018-13', '2018-00', '08/2018', '2018-08-29'])(
    'rejects yearMonth %j',
    yearMonth => {
      expect(
        EducationLedgerHistoryFileSchema.safeParse(
          file({ records: [record({ yearMonth })] })
        ).success
      ).toBe(false)
    }
  )

  it('rejects a zero or fractional achievementCount (a group exists only if it has rows)', () => {
    for (const achievementCount of [0, 1.5, -1]) {
      expect(
        EducationLedgerHistoryFileSchema.safeParse(
          file({ records: [record({ achievementCount })] })
        ).success
      ).toBe(false)
    }
  })

  it.each(['18-19', '2018-2020', '2018/2019'])(
    'rejects program year %j',
    programYear => {
      expect(
        EducationLedgerHistoryFileSchema.safeParse(file({ programYear }))
          .success
      ).toBe(false)
    }
  )

  it.each(['../61', '6 1', ''])('rejects district id %j', districtId => {
    expect(
      EducationLedgerHistoryFileSchema.safeParse(file({ districtId })).success
    ).toBe(false)
  })
})

describe('educationLedgerHistoryObjectPath', () => {
  it('keys the object by program year then district under the raw prefix', () => {
    expect(EDUCATION_LEDGER_HISTORY_PREFIX).toBe('raw-education-ledger')
    expect(educationLedgerHistoryObjectPath('2003-2004', '01')).toBe(
      'raw-education-ledger/2003-2004/district_01.json'
    )
  })

  it('refuses a path-traversal district id', () => {
    expect(() =>
      educationLedgerHistoryObjectPath('2003-2004', '../x')
    ).toThrow()
  })

  it('refuses a malformed program year', () => {
    expect(() => educationLedgerHistoryObjectPath('2003-04', '61')).toThrow()
  })
})

describe('educationAwardProgram', () => {
  // Vocabulary recorded from the D61 archive probes (2003-04, 2009-10,
  // 2018-19; .routine-tmp/education-ledger-history-2026-10-11.md).
  it.each(['PM1', 'PI2', 'EC5', 'VC3', 'BT1', 'DL4', 'IP5', 'SR1', 'TC2'])(
    '%s is Pathways',
    code => {
      expect(educationAwardProgram(code)).toBe('Pathways')
    }
  )

  it.each([
    'CC',
    'ACB',
    'ACS',
    'ACG',
    'CL',
    'AL',
    'ALB',
    'ALS',
    'CTM',
    'ATM',
    'ATMB',
    'ATMS',
    'ATMG',
    'LDREXC',
  ])('%s is Legacy', code => {
    expect(educationAwardProgram(code)).toBe('Legacy')
  })

  it('DTM is its own program (counted once under its own code, both eras)', () => {
    expect(educationAwardProgram('DTM')).toBe('DTM')
  })

  it.each(['PWMENTORPGM', '', 'PM6', 'XYZ'])(
    '%j is Other (counted, never silently mislabelled)',
    code => {
      expect(educationAwardProgram(code)).toBe('Other')
    }
  )
})

describe('ledgerRecordsThroughMonth', () => {
  const records = [
    record({ yearMonth: '2018-07', achievementCount: 2 }),
    record({ yearMonth: '2018-11', achievementCount: 3 }),
    record({ yearMonth: '2019-06', achievementCount: 5 }),
  ]

  it('keeps records dated on or before the as-of month (Date <= asOf)', () => {
    const through = ledgerRecordsThroughMonth(records, '2018-11')
    expect(through.map(r => r.yearMonth)).toEqual(['2018-07', '2018-11'])
    expect(through.reduce((s, r) => s + r.achievementCount, 0)).toBe(5)
  })

  it('the PY-end month returns the whole ledger', () => {
    expect(ledgerRecordsThroughMonth(records, '2019-06')).toHaveLength(3)
  })

  it('rejects a malformed as-of month', () => {
    expect(() => ledgerRecordsThroughMonth(records, '2018-11-30')).toThrow()
  })
})
