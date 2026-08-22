/**
 * Unit tests for the shared PY-end snapshot-date selection rule (#1435).
 *
 * The rule itself is the one `scripts/validate-vs-ceo-report.ts` has always
 * used — these tests exist because the CI job (#1435) has to apply it to a
 * GCS *listing* before any snapshot has been synced, and two rules that
 * disagree is the defect epic #1426 keeps rediscovering.
 */

import { describe, expect, it } from 'vitest'
import {
  formatCoverageCensus,
  parseSnapshotDateListing,
  programYearForSnapshotDate,
  resolveCeoReportSnapshotDates,
  selectYearEndSnapshot,
  SNAPSHOT_DATE_DIR_PATTERN,
} from '../ceoReportSnapshotDates.js'

describe('programYearForSnapshotDate', () => {
  it('starts a new program year on July 1', () => {
    expect(programYearForSnapshotDate('2025-07-01')).toBe('2025-2026')
    expect(programYearForSnapshotDate('2025-06-30')).toBe('2024-2025')
  })

  it('keeps a June 30 freeze in the year it closes', () => {
    expect(programYearForSnapshotDate('2022-06-30')).toBe('2021-2022')
  })

  it('is calendar-pure — a July date is the NEXT program year', () => {
    // Lesson 139: a year-end snapshot's `sourceCsvDate` falls in July. This
    // function is only ever called on the snapshot DIRECTORY date, so July
    // meaning "next PY" is correct here and must not be softened.
    expect(programYearForSnapshotDate('2024-07-19')).toBe('2024-2025')
  })
})

describe('selectYearEndSnapshot', () => {
  const dates = [
    '2021-08-31',
    '2022-05-31',
    '2022-06-30',
    '2022-07-31',
    '2023-06-30',
  ]

  it('picks the last snapshot belonging to the program year', () => {
    expect(selectYearEndSnapshot(dates, '2021-2022')).toBe('2022-06-30')
  })

  it('does not hardcode June 30 — a later in-year date wins', () => {
    // A closing period can push the settled snapshot into a different dated
    // directory, so the rule is "last date in the PY", not "-06-30".
    expect(selectYearEndSnapshot([...dates, '2022-06-27'], '2021-2022')).toBe(
      '2022-06-30'
    )
    expect(
      selectYearEndSnapshot(['2022-06-27', '2022-05-31'], '2021-2022')
    ).toBe('2022-06-27')
  })

  it('is order-independent — an unsorted listing selects the same date', () => {
    const shuffled = ['2022-06-30', '2021-08-31', '2022-05-31']
    expect(selectYearEndSnapshot(shuffled, '2021-2022')).toBe('2022-06-30')
  })

  it('returns undefined when the program year has no snapshot at all', () => {
    expect(selectYearEndSnapshot(dates, '2024-2025')).toBeUndefined()
  })
})

describe('parseSnapshotDateListing', () => {
  it('reads dated prefixes out of a gsutil listing', () => {
    const listing = [
      'gs://toast-stats-data-ca/snapshots/2022-06-30/',
      'gs://toast-stats-data-ca/snapshots/2023-06-30/',
      '',
    ].join('\n')
    expect(parseSnapshotDateListing(listing)).toEqual([
      '2022-06-30',
      '2023-06-30',
    ])
  })

  it('ignores non-date prefixes, files and blank lines', () => {
    const listing = [
      'gs://bucket/snapshots/',
      'gs://bucket/snapshots/analytics/',
      'gs://bucket/snapshots/2024-06-30/all-districts-rankings.json',
      'gs://bucket/snapshots/2024-06-30/',
      '   ',
    ].join('\n')
    expect(parseSnapshotDateListing(listing)).toEqual(['2024-06-30'])
  })

  it('sorts and de-duplicates', () => {
    const listing = [
      'gs://bucket/snapshots/2023-06-30/',
      'gs://bucket/snapshots/2022-06-30/',
      'gs://bucket/snapshots/2023-06-30/',
    ].join('\n')
    expect(parseSnapshotDateListing(listing)).toEqual([
      '2022-06-30',
      '2023-06-30',
    ])
  })

  it('accepts bare date lines too', () => {
    expect(parseSnapshotDateListing('2022-06-30\n2021-06-30\n')).toEqual([
      '2021-06-30',
      '2022-06-30',
    ])
  })
})

describe('resolveCeoReportSnapshotDates', () => {
  it('resolves one entry per published CEO Report year, in report order', () => {
    const resolved = resolveCeoReportSnapshotDates([])
    expect(resolved.map(entry => entry.programYear)).toEqual([
      '2021-2022',
      '2022-2023',
      '2023-2024',
      '2024-2025',
      '2025-2026',
    ])
  })

  it('reports an absent year as noData rather than a substituted date', () => {
    // A missing year must never borrow another year's snapshot — the
    // comparator models noData, and a substitution would read as a scoring
    // mismatch instead of a coverage hole.
    const resolved = resolveCeoReportSnapshotDates([
      '2022-06-30',
      '2023-06-30',
      '2024-06-30',
      '2025-06-30',
      '2026-06-30',
    ])
    expect(resolved).toEqual([
      { programYear: '2021-2022', snapshotDate: '2022-06-30' },
      { programYear: '2022-2023', snapshotDate: '2023-06-30' },
      { programYear: '2023-2024', snapshotDate: '2024-06-30' },
      { programYear: '2024-2025', snapshotDate: '2025-06-30' },
      { programYear: '2025-2026', snapshotDate: '2026-06-30' },
    ])

    const missingFirst = resolveCeoReportSnapshotDates(['2023-06-30'])
    expect(missingFirst[0]).toEqual({ programYear: '2021-2022' })
    expect(missingFirst[0]?.snapshotDate).toBeUndefined()
  })

  it('ignores dates outside the report window', () => {
    const resolved = resolveCeoReportSnapshotDates([
      '2019-06-30',
      '2026-08-19',
      '2023-06-30',
    ])
    const chosen = resolved
      .map(entry => entry.snapshotDate)
      .filter((date): date is string => date !== undefined)
    expect(chosen).toEqual(['2023-06-30'])
  })
})

describe('formatCoverageCensus', () => {
  it('names present and absent program years explicitly', () => {
    const census = formatCoverageCensus(
      resolveCeoReportSnapshotDates(['2023-06-30'])
    )
    expect(census).toContain('2022-2023')
    expect(census).toContain('2023-06-30')
    expect(census).toMatch(/2021-2022.*noData/)
  })
})

describe('SNAPSHOT_DATE_DIR_PATTERN', () => {
  it('matches a dated snapshot directory only', () => {
    expect(SNAPSHOT_DATE_DIR_PATTERN.test('2026-06-30')).toBe(true)
    expect(SNAPSHOT_DATE_DIR_PATTERN.test('analytics')).toBe(false)
    expect(SNAPSHOT_DATE_DIR_PATTERN.test('2026-06-30/')).toBe(false)
  })
})
