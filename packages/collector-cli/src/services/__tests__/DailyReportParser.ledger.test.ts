import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { EducationLedgerHistoryFileSchema } from '@taverns-red/shared-contracts'

import { parseEducationLedgerByMonth } from '../DailyReportParser'

/**
 * #1802 — the Educational Achievement Archive ledger, KEEPING the per-award
 * `Date` at month granularity. Lesson 153 dropped `Date` because a
 * per-(club, award) count has no single date; here the group key is
 * (club, award, yearMonth), so the date survives without shattering groups
 * back to one row per achievement.
 *
 * Fixtures are trimmed REAL responses (D61, recorded 2026-10-12 from
 * GetDistrictReport?tableID=a30b93f3…&year=<PY>): the response's own prefix,
 * header and closing tags, with the desktop rows of a few clubs kept verbatim
 * and the mobile-table duplicate dropped.
 */

const FIXTURE_DIR = fileURLToPath(
  new URL('../../__tests__/fixtures/daily-reports/', import.meta.url)
)
const fixture = (name: string): string =>
  readFileSync(FIXTURE_DIR + name, 'utf8')

const sum = (rows: Array<{ achievementCount: number }>) =>
  rows.reduce((s, r) => s + r.achievementCount, 0)

describe('parseEducationLedgerByMonth — recorded archive years', () => {
  it.each([
    // [fixture, raw ledger rows, (club, award, month) groups]
    ['education-ledger-d61-2003-2004.html', 33, 28],
    ['education-ledger-d61-2009-2010.html', 22, 17],
    ['education-ledger-d61-2018-2019.html', 39, 37],
  ])(
    '%s: collapses %i rows into %i month groups whose counts sum back',
    (name, rawRows, groups) => {
      const parsed = parseEducationLedgerByMonth(fixture(name))
      expect(parsed.empty).toBe(false)
      expect(parsed.records).toHaveLength(groups)
      expect(sum(parsed.records)).toBe(rawRows)
      expect(parsed.achievements).toBe(rawRows)
    }
  )

  it('2003-04 is month precision only (every Date is the 1st): kept as month, no day invented', () => {
    const { records } = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2003-2004.html')
    )
    // Club 1261: CTM twice in 01/2004 → one group of 2; other months separate.
    const ctm1261 = records.filter(
      r => r.club === '1261' && r.awardCode === 'CTM'
    )
    expect(ctm1261.map(r => [r.yearMonth, r.achievementCount]).sort()).toEqual([
      ['2003-09', 1],
      ['2003-12', 1],
      ['2004-01', 2],
      ['2004-02', 1],
    ])
    for (const r of records) expect(r.yearMonth).toMatch(/^\d{4}-\d{2}$/)
  })

  it('day-precision years still group by month (2009-10: two CCs on 08/04/2009 + one on 07/31 are July 1, August 2)', () => {
    const { records } = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2009-2010.html')
    )
    const cc = records.filter(r => r.club === '1020713' && r.awardCode === 'CC')
    expect(
      Object.fromEntries(cc.map(r => [r.yearMonth, r.achievementCount]))
    ).toEqual({ '2009-07': 1, '2009-08': 2, '2009-11': 1, '2010-06': 4 })
  })

  it('keeps division/area as of that year (club 1009147 is B/13 in 2009-10, D/34 in 2018-19)', () => {
    const y2009 = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2009-2010.html')
    ).records.find(r => r.club === '1009147')
    const y2018 = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2018-2019.html')
    ).records.find(r => r.club === '1009147')
    expect([y2009?.division, y2009?.area]).toEqual(['B', '13'])
    expect([y2018?.division, y2018?.area]).toEqual(['D', '34'])
  })

  it('splits the award cell into its code and tags the program (legacy and Pathways both kept)', () => {
    const { records } = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2018-2019.html')
    )
    const byCode = new Map(records.map(r => [r.awardCode, r]))
    expect(byCode.get('PI1')).toMatchObject({
      award: 'PI1Persuasive Influence Level 1',
      program: 'Pathways',
    })
    expect(byCode.get('CC')).toMatchObject({
      award: 'CCCompetent Communicator',
      program: 'Legacy',
    })
    expect(byCode.get('LDREXC')?.program).toBe('Legacy')
    expect(byCode.get('PWMENTORPGM')?.program).toBe('Other')

    const legacy2003 = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2003-2004.html')
    ).records
    expect(
      [...new Set(legacy2003.map(r => `${r.awardCode}:${r.program}`))].sort()
    ).toEqual([
      'AL:Legacy',
      'ATMB:Legacy',
      'ATMG:Legacy',
      'ATMS:Legacy',
      'CL:Legacy',
      'CTM:Legacy',
      'DTM:DTM',
      'LDREXC:Legacy',
    ])
  })

  it('a row TI renders with no award code is kept and counted as Other, never dropped', () => {
    const { records } = parseEducationLedgerByMonth(
      fixture('education-ledger-d61-2018-2019.html')
    )
    const blank = records.filter(r => r.awardCode === '')
    expect(blank).toEqual([
      expect.objectContaining({
        club: '813731',
        award: '',
        program: 'Other',
        yearMonth: '2018-11',
        achievementCount: 1,
      }),
    ])
  })

  it('every record satisfies the strict shared contract (no member, no per-row date)', () => {
    for (const name of [
      'education-ledger-d61-2003-2004.html',
      'education-ledger-d61-2009-2010.html',
      'education-ledger-d61-2018-2019.html',
    ]) {
      const { records } = parseEducationLedgerByMonth(fixture(name))
      const r = EducationLedgerHistoryFileSchema.safeParse({
        schemaVersion: '1.0.0',
        districtId: '61',
        programYear: '2018-2019',
        fetchedAt: '2026-10-12T15:00:00.000Z',
        source: {
          reportType: 'education-archive',
          tableId: 'a30b93f3-081e-42c8-9a36-137acb24be69',
        },
        status: 'ok',
        records,
      })
      expect(r.success).toBe(true)
    }
  })
})

describe('parseEducationLedgerByMonth — empty and drifted bodies', () => {
  it('a 0-byte body (district did not exist that PY) is empty, not an error', () => {
    const parsed = parseEducationLedgerByMonth(
      fixture('education-archive-empty.html')
    )
    expect(parsed).toEqual({ empty: true, records: [], achievements: 0 })
  })

  it('a whitespace-only body is empty too', () => {
    expect(parseEducationLedgerByMonth('  \n ').empty).toBe(true)
  })

  it('a non-empty body with no table (an error page) throws — never recorded as "did not exist"', () => {
    expect(() =>
      parseEducationLedgerByMonth('<html><body>Object moved</body></html>')
    ).toThrow(/no ledger table/i)
  })

  it('a table missing the Date header throws (layout drift)', () => {
    const html = fixture('education-ledger-d61-2018-2019.html').replace(
      />Date</,
      '>When<'
    )
    expect(() => parseEducationLedgerByMonth(html)).toThrow(/Date/)
  })

  it('an unparseable Date throws, naming the row, rather than guessing a month', () => {
    const html = fixture('education-ledger-d61-2018-2019.html').replace(
      '08/29/2018',
      'Aug 2018'
    )
    expect(() => parseEducationLedgerByMonth(html)).toThrow(/row 1/)
  })

  it('a Member column, if TI ever adds one, is never projected', () => {
    const html = fixture('education-ledger-d61-2018-2019.html')
      .replace(/(<th[^>]*>Location<\/th>)/, '$1<th>Member</th>')
      .replace(
        /(<td style="width:13.5%">Ottawa<\/td>)/g,
        '$1<td>Jane Q. Member</td>'
      )
    const { records } = parseEducationLedgerByMonth(html)
    expect(JSON.stringify(records)).not.toContain('Jane Q. Member')
  })
})
