/**
 * #3103 — the one-off generator for config/legacy-suspension-deadlines.json.
 *
 * TI's suspend date reaches our data only from 2025-07-31. For clubs
 * suspended before that, the five-period rule needs the deadline from
 * status history (Ron, 2026-11-20): the Sep 30 or Mar 31 deadline just
 * before the first snapshot of the club's last run of "Suspended".
 *
 * The District 61 histories below are the real 2024-25 month-end Club
 * Status values (report.md §3, read from the CDN on 2026-11-20).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { LegacySuspensionDeadlinesSchema } from '@taverns-red/shared-contracts'

import {
  LEGACY_SOURCE_FROM,
  LEGACY_SOURCE_TO,
  buildLegacySuspensionDeadlines,
  clubStatusesOf,
  deriveSuspensionDeadlines,
  lastDeadlineOnOrBefore,
  checkAgainstExpected,
  planLegacySources,
  rowsSha256,
  type ClubObservation,
} from '../legacySuspensionDeadlines.js'

const MONTHS = [
  '2024-07-31',
  '2024-08-31',
  '2024-09-30',
  '2024-10-31',
  '2024-11-30',
  '2024-12-31',
  '2025-01-31',
  '2025-02-28',
  '2025-03-31',
  '2025-04-30',
  '2025-05-31',
  '2025-06-30',
]

/** Statuses from 2024-07-31 on, one per month; a short list = left the roster. */
const history = (...statuses: string[]): ClubObservation[] =>
  statuses.map((status, i) => ({ date: MONTHS[i]!, status }))

const A = 'Active'
const L = 'Low'
const I = 'Ineligible'
const S = 'Suspended'

const D61 = new Map<string, ClubObservation[]>([
  // Mar 31 2025 suspensions, still listed through the June 30 cap.
  ['3778', history(A, A, A, L, L, L, L, L, L, S, S, S)],
  ['7070084', history(A, A, A, L, L, L, L, L, L, S, S, S)],
  ['7857', history(A, A, A, L, L, L, L, L, L, S, S, S)],
  ['9547', history(A, A, A, I, I, I, I, I, I, S, S, S)],
  // Sept 30 2024 suspensions, gone after 2025-03-31.
  ['1314924', history(L, L, L, S, S, S, S, S, S)],
  ['28675862', history(I, I, I, S, S, S, S, S, S)],
  // Already Suspended in the snapshot dated 2024-09-30 (TI's 10-01 stamp).
  ['3492', history(L, L, S, S, S, S, S, S, S)],
  ['700580', history(L, L, L, S, S, S, S, S, S)],
  ['7852257', history(L, L, L, S, S, S, S, S, S)],
])

describe('lastDeadlineOnOrBefore', () => {
  it.each([
    ['2024-09-30', '2024-09-30'],
    ['2024-10-31', '2024-09-30'],
    ['2025-03-30', '2024-09-30'],
    ['2025-03-31', '2025-03-31'],
    ['2025-04-30', '2025-03-31'],
    ['2025-09-29', '2025-03-31'],
    ['2025-01-31', '2024-09-30'],
    ['2024-07-31', '2024-03-31'],
  ])('%s -> %s', (date, deadline) => {
    expect(lastDeadlineOnOrBefore(date)).toBe(deadline)
  })
})

describe('deriveSuspensionDeadlines: District 61 sample (report.md §3)', () => {
  const rows = deriveSuspensionDeadlines(D61)

  it.each(['3778', '7070084', '7857', '9547'])('%s -> Mar 31 2025', n => {
    expect(rows[n]).toBe('2025-03-31')
  })

  it.each(['1314924', '28675862', '3492', '700580', '7852257'])(
    '%s -> Sept 30 2024',
    n => {
      expect(rows[n]).toBe('2024-09-30')
    }
  )

  it('has exactly those nine rows', () => {
    expect(Object.keys(rows).sort()).toEqual([...D61.keys()].sort())
  })
})

describe('deriveSuspensionDeadlines: which runs count', () => {
  it('a club never Suspended has no row', () => {
    const rows = deriveSuspensionDeadlines(
      new Map([['1', history(A, A, L, L, I, I)]])
    )
    expect(rows).toEqual({})
  })

  it('a club reinstated after its run (last status not Suspended) has no row', () => {
    // It is not closed, or a later TI-dated suspension will place it.
    const rows = deriveSuspensionDeadlines(
      new Map([['5', history(L, L, L, S, S, S, A, A, A)]])
    )
    expect(rows).toEqual({})
  })

  it('only the LAST run counts: suspended, reinstated, suspended again', () => {
    const rows = deriveSuspensionDeadlines(
      new Map([['6', history(S, S, A, A, A, A, A, A, A, S, S, S)]])
    )
    expect(rows['6']).toBe('2025-03-31')
  })

  it('a run that starts mid-period takes the deadline before it (7934556, from 2025-01-31)', () => {
    const rows = deriveSuspensionDeadlines(
      new Map([['7934556', history(A, A, A, I, I, I, S, S, S, S, S, S)]])
    )
    expect(rows['7934556']).toBe('2024-09-30')
  })

  it('observations are sorted by date first, so input order does not matter', () => {
    const shuffled = [...D61.get('3778')!].reverse()
    expect(deriveSuspensionDeadlines(new Map([['3778', shuffled]]))).toEqual({
      '3778': '2025-03-31',
    })
  })

  it('status matching ignores case and spaces', () => {
    const rows = deriveSuspensionDeadlines(
      new Map([['7', history(A, ' suspended ', 'SUSPENDED')]])
    )
    expect(rows['7']).toBe('2024-03-31')
  })
})

describe('clubStatusesOf: a stored district snapshot', () => {
  it('reads data.clubs[].clubId and clubStatus, as stored for 2024-25', () => {
    expect(
      clubStatusesOf({
        districtId: '61',
        data: {
          clubs: [
            { clubId: '3778', clubStatus: 'Suspended' },
            { clubId: '0003045', clubStatus: 'Active' },
          ],
        },
      })
    ).toEqual([
      { clubNumber: '3778', status: 'Suspended' },
      { clubNumber: '3045', status: 'Active' },
    ])
  })

  it('falls back to data.clubPerformance Club Number / Club Status', () => {
    expect(
      clubStatusesOf({
        data: {
          clubPerformance: [
            { 'Club Number': '00003778', 'Club Status': 'Suspended' },
          ],
        },
      })
    ).toEqual([{ clubNumber: '3778', status: 'Suspended' }])
  })

  it('returns nothing for a file without clubs', () => {
    expect(clubStatusesOf({})).toEqual([])
    expect(clubStatusesOf(null)).toEqual([])
  })
})

describe('rowsSha256 and the file', () => {
  it('is stable and independent of key insertion order', () => {
    const a = rowsSha256({ '3778': '2025-03-31', '1314924': '2024-09-30' })
    const b = rowsSha256({ '1314924': '2024-09-30', '3778': '2025-03-31' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(rowsSha256({ '3778': '2024-09-30' })).not.toBe(a)
  })

  it('builds a schema-valid file that expires 2027-10-01', () => {
    const rows = deriveSuspensionDeadlines(D61)
    const file = buildLegacySuspensionDeadlines({
      rows,
      sourceDates: MONTHS,
      generatedAt: '2026-11-21T12:00:00.000Z',
    })
    expect(LegacySuspensionDeadlinesSchema.safeParse(file).success).toBe(true)
    expect(file.expires).toBe('2027-10-01')
    expect(file.rowCount).toBe(9)
    expect(file.rowsSha256).toBe(rowsSha256(rows))
    expect(file.sourceDates).toEqual(MONTHS)
  })
})

describe('planLegacySources: which objects the job reads', () => {
  const listing = [
    '   1808470  2026-06-12T15:42:31Z  gs://b/snapshots/2024-07-31/district_61.json',
    '     65881  2026-06-12T15:42:31Z  gs://b/snapshots/2024-07-31/district_61_reports.json',
    '     26124  2026-10-14T14:32:00Z  gs://b/snapshots/2025-03-31/district_F.json',
    '       100  2026-10-14T14:32:00Z  gs://b/snapshots/2024-06-30/district_61.json',
    '       200  2026-10-14T14:32:00Z  gs://b/snapshots/2025-07-31/district_61.json',
    'TOTAL: 5 objects, 1900325 bytes (1.81MiB)',
  ].join('\n')

  it('keeps district_<id>.json inside the window, with sizes', () => {
    expect(LEGACY_SOURCE_FROM).toBe('2024-07-01')
    expect(LEGACY_SOURCE_TO).toBe('2025-06-30')
    const plan = planLegacySources(listing)
    expect(plan.objects.map(o => o.url)).toEqual([
      'gs://b/snapshots/2024-07-31/district_61.json',
      'gs://b/snapshots/2025-03-31/district_F.json',
    ])
    expect(plan.count).toBe(2)
    expect(plan.bytes).toBe(1808470 + 26124)
    expect(plan.dates).toEqual(['2024-07-31', '2025-03-31'])
  })
})

describe('checkAgainstExpected: the upload gate (#3109 review)', () => {
  const expected = { rowCount: 1303, rowsSha256: 'a'.repeat(64) }

  it('passes when the row count and checksum both match', () => {
    expect(
      checkAgainstExpected(
        { rowCount: 1303, rowsSha256: 'a'.repeat(64) },
        expected
      )
    ).toEqual([])
  })

  it('names each mismatch', () => {
    expect(
      checkAgainstExpected(
        { rowCount: 1302, rowsSha256: 'b'.repeat(64) },
        expected
      )
    ).toEqual([
      'rowCount 1302, expected 1303',
      `rowsSha256 ${'b'.repeat(64)}, expected ${'a'.repeat(64)}`,
    ])
  })

  it('the committed expectation is the PR’s figures: 1,303 rows and their checksum', () => {
    const file = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'scripts/legacy-suspension-deadlines.expected.json'
        ),
        'utf-8'
      )
    ) as { rowCount: number; rowsSha256: string }
    expect(file.rowCount).toBe(1303)
    expect(file.rowsSha256).toBe(
      '40692ca8636d6b99f59cbd1070243c5d1f3219c4a941643e5e135e81ffe239a7'
    )
  })
})
