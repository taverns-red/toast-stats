/**
 * Unit tests for scripts/lib/monthEndDates.ts
 * Run with: npx jest scripts/lib/__tests__/monthEndDates.test.ts
 */

import {
  getProgramYearForMonth,
  isProgramYearComplete,
  groupByDataMonth,
  findLastClosingDate,
  findMonthEndKeeperForward,
  getMonthsInProgramYear,
  buildMonthEndSummary,
  type RawCSVEntry,
} from '../monthEndDates'

// Reference "today": Feb 27, 2026 (mid-year 2025-2026)
const TODAY = new Date(Date.UTC(2026, 1, 27))

// ── getProgramYearForMonth ──────────────────────────────────────────────

describe('getProgramYearForMonth', () => {
  it('maps July start of program year correctly', () => {
    expect(getProgramYearForMonth('2024-07')).toBe('2024-2025')
  })

  it('maps June end of program year correctly', () => {
    expect(getProgramYearForMonth('2025-06')).toBe('2024-2025')
  })

  it('maps January mid-year correctly', () => {
    expect(getProgramYearForMonth('2026-01')).toBe('2025-2026')
  })

  it('maps August to the program year starting that calendar year', () => {
    expect(getProgramYearForMonth('2022-08')).toBe('2022-2023')
  })

  it('throws on invalid format', () => {
    expect(() => getProgramYearForMonth('not-valid')).toThrow()
  })
})

// ── isProgramYearComplete ───────────────────────────────────────────────

describe('isProgramYearComplete', () => {
  it('marks 2022-2023 as complete', () => {
    expect(isProgramYearComplete('2022-2023', TODAY)).toBe(true)
  })

  it('marks 2024-2025 as complete (ended Jun 30 2025)', () => {
    expect(isProgramYearComplete('2024-2025', TODAY)).toBe(true)
  })

  it('marks 2025-2026 as incomplete (ends Jun 30 2026)', () => {
    expect(isProgramYearComplete('2025-2026', TODAY)).toBe(false)
  })

  it('returns true exactly one day after June 30', () => {
    const dayAfter = new Date(Date.UTC(2025, 6, 1)) // July 1, 2025
    expect(isProgramYearComplete('2024-2025', dayAfter)).toBe(true)
  })

  it('returns false on the end date itself', () => {
    const endDate = new Date(Date.UTC(2025, 5, 30)) // June 30, 2025
    expect(isProgramYearComplete('2024-2025', endDate)).toBe(false)
  })
})

// ── getMonthsInProgramYear ──────────────────────────────────────────────

describe('getMonthsInProgramYear', () => {
  it('returns 12 months for 2024-2025', () => {
    const months = getMonthsInProgramYear('2024-2025')
    expect(months).toHaveLength(12)
  })

  it('starts with July of the start year', () => {
    const months = getMonthsInProgramYear('2024-2025')
    expect(months[0]).toBe('2024-07')
  })

  it('ends with June of the end year', () => {
    const months = getMonthsInProgramYear('2024-2025')
    expect(months[months.length - 1]).toBe('2025-06')
  })

  it('contains all 12 expected months in order', () => {
    const months = getMonthsInProgramYear('2022-2023')
    expect(months).toEqual([
      '2022-07',
      '2022-08',
      '2022-09',
      '2022-10',
      '2022-11',
      '2022-12',
      '2023-01',
      '2023-02',
      '2023-03',
      '2023-04',
      '2023-05',
      '2023-06',
    ])
  })
})

// ── groupByDataMonth ────────────────────────────────────────────────────

describe('groupByDataMonth', () => {
  const entries: RawCSVEntry[] = [
    {
      collectionDate: '2024-09-01',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-02',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-03',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-04',
      isClosingPeriod: false,
      dataMonth: undefined,
    }, // regular
    {
      collectionDate: '2024-10-01',
      isClosingPeriod: true,
      dataMonth: '2024-09',
    },
    {
      collectionDate: '2024-08-15',
      isClosingPeriod: false,
      dataMonth: undefined,
    }, // regular
  ]

  it('groups closing-period entries by dataMonth', () => {
    const grouped = groupByDataMonth(entries)
    expect(grouped.get('2024-08')).toHaveLength(3)
    expect(grouped.get('2024-09')).toHaveLength(1)
  })

  it('excludes non-closing-period entries', () => {
    const grouped = groupByDataMonth(entries)
    // 2024-09-04 is not closing period — should not appear as a key
    const allDates = Array.from(grouped.values()).flat()
    expect(allDates).not.toContain('2024-08-15')
    expect(allDates).not.toContain('2024-09-04')
  })

  it('sorts dates ascending within each group', () => {
    const grouped = groupByDataMonth(entries)
    expect(grouped.get('2024-08')).toEqual([
      '2024-09-01',
      '2024-09-02',
      '2024-09-03',
    ])
  })

  it('returns empty map when no closing-period entries', () => {
    const nonClosing: RawCSVEntry[] = [
      {
        collectionDate: '2024-08-15',
        isClosingPeriod: false,
        dataMonth: undefined,
      },
    ]
    expect(groupByDataMonth(nonClosing).size).toBe(0)
  })

  it('handles entries with undefined dataMonth gracefully', () => {
    const mixed: RawCSVEntry[] = [
      {
        collectionDate: '2024-09-01',
        isClosingPeriod: true,
        dataMonth: undefined,
      },
      {
        collectionDate: '2024-09-02',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      },
    ]
    const grouped = groupByDataMonth(mixed)
    // Only the entry with a dataMonth should be grouped
    expect(grouped.size).toBe(1)
    expect(grouped.get('2024-08')).toEqual(['2024-09-02'])
  })
})

// ── findLastClosingDate ─────────────────────────────────────────────────

describe('findLastClosingDate', () => {
  const entries: RawCSVEntry[] = [
    {
      collectionDate: '2024-09-01',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-02',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-03',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    }, // ← last
    {
      collectionDate: '2024-09-04',
      isClosingPeriod: false,
      dataMonth: undefined,
    },
    {
      collectionDate: '2024-10-01',
      isClosingPeriod: true,
      dataMonth: '2024-09',
    },
    {
      collectionDate: '2024-10-02',
      isClosingPeriod: true,
      dataMonth: '2024-09',
    }, // ← last for Sep
  ]

  it('returns the lexically greatest collection date for the target month', () => {
    expect(findLastClosingDate(entries, '2024-08')).toBe('2024-09-03')
  })

  it('works correctly when there is only one closing-period date', () => {
    expect(findLastClosingDate(entries, '2024-09')).toBe('2024-10-02')
  })

  it('returns null when no closing-period data exists for the month', () => {
    expect(findLastClosingDate(entries, '2024-07')).toBeNull()
  })

  it('ignores non-closing-period entries for the target month', () => {
    // 2024-09-04 is not a closing period — must not be returned for '2024-08'
    expect(findLastClosingDate(entries, '2024-08')).toBe('2024-09-03')
  })

  it('is not confused by similar-looking dates for different months', () => {
    const specific: RawCSVEntry[] = [
      {
        collectionDate: '2025-02-01',
        isClosingPeriod: true,
        dataMonth: '2025-01',
      },
      {
        collectionDate: '2025-03-01',
        isClosingPeriod: true,
        dataMonth: '2025-02',
      },
      {
        collectionDate: '2025-02-02',
        isClosingPeriod: true,
        dataMonth: '2025-01',
      },
    ]
    expect(findLastClosingDate(specific, '2025-01')).toBe('2025-02-02')
    expect(findLastClosingDate(specific, '2025-02')).toBe('2025-03-01')
  })
})

// ── buildMonthEndSummary ────────────────────────────────────────────────

describe('buildMonthEndSummary', () => {
  // Build a realistic set of entries for PY 2022-2023 (complete) and PY 2025-2026 (current)
  const entries: RawCSVEntry[] = [
    // PY 2022-2023: closing periods for August and September 2022
    {
      collectionDate: '2022-09-01',
      isClosingPeriod: true,
      dataMonth: '2022-08',
    },
    {
      collectionDate: '2022-09-02',
      isClosingPeriod: true,
      dataMonth: '2022-08',
    },
    {
      collectionDate: '2022-10-01',
      isClosingPeriod: true,
      dataMonth: '2022-09',
    },
    // PY 2022-2023: regular daily entries
    {
      collectionDate: '2022-08-15',
      isClosingPeriod: false,
      dataMonth: undefined,
    },
    // PY 2025-2026 (current): regular entries (closing period irrelevant)
    {
      collectionDate: '2026-02-15',
      isClosingPeriod: false,
      dataMonth: undefined,
    },
  ]

  it('returns summaries sorted descending by program year', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    expect(summaries[0]?.year).toBe('2025-2026')
    expect(summaries[1]?.year).toBe('2022-2023')
  })

  it('marks 2025-2026 as isComplete = false', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    const current = summaries.find(s => s.year === '2025-2026')
    expect(current?.isComplete).toBe(false)
    expect(current?.monthResults).toHaveLength(0)
  })

  it('marks 2022-2023 as isComplete = true', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    const past = summaries.find(s => s.year === '2022-2023')
    expect(past?.isComplete).toBe(true)
  })

  it('correctly identifies lastClosingDate for months with closing-period data', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    const past = summaries.find(s => s.year === '2022-2023')
    const aug = past?.monthResults.find(r => r.dataMonth === '2022-08')
    expect(aug?.lastClosingDate).toBe('2022-09-02')
    expect(aug?.allClosingDates).toEqual(['2022-09-01', '2022-09-02'])
  })

  it('adds months with no closing-period data to missingMonths', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    const past = summaries.find(s => s.year === '2022-2023')
    // 10 months are missing (only Aug and Sep have data)
    expect(past?.missingMonths).toHaveLength(10)
    expect(past?.missingMonths).toContain('2022-10')
    expect(past?.missingMonths).toContain('2023-06')
  })

  it('does not include monthResults for incomplete program years', () => {
    const summaries = buildMonthEndSummary(entries, TODAY)
    const current = summaries.find(s => s.year === '2025-2026')
    expect(current?.monthResults).toHaveLength(0)
    expect(current?.missingMonths).toHaveLength(0)
  })
})

// ── findMonthEndKeeperForward ───────────────────────────────────────────────
//
// New algorithm: given entries from the *first N days of month X+1*, find the
// last collection date where isClosingPeriod=true and dataMonth=X.
// Reads far fewer metadata files than the exhaustive scan (only ~14 per month).

describe('findMonthEndKeeperForward', () => {
  // Simulates raw-csv entries for the first 10 days of September 2024
  // when we're looking for the month-end keeper for August 2024.
  const AUGUST_WINDOW: RawCSVEntry[] = [
    {
      collectionDate: '2024-09-01',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-02',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-03',
      isClosingPeriod: true,
      dataMonth: '2024-08',
    },
    {
      collectionDate: '2024-09-04',
      isClosingPeriod: false,
      dataMonth: '2024-09',
    }, // first non-closing
    {
      collectionDate: '2024-09-05',
      isClosingPeriod: false,
      dataMonth: '2024-09',
    },
  ]

  it('returns the last isClosingPeriod=true date for the target month', () => {
    const result = findMonthEndKeeperForward('2024-08', AUGUST_WINDOW)
    expect(result).toBe('2024-09-03')
  })

  it('ignores entries where isClosingPeriod=false', () => {
    const result = findMonthEndKeeperForward('2024-08', AUGUST_WINDOW)
    expect(result).not.toBe('2024-09-04')
    expect(result).not.toBe('2024-09-05')
  })

  it('ignores closing-period entries for a different dataMonth', () => {
    // Mix in entries for a different month
    const mixed: RawCSVEntry[] = [
      {
        collectionDate: '2024-09-01',
        isClosingPeriod: true,
        dataMonth: '2024-07',
      }, // wrong month
      {
        collectionDate: '2024-09-02',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      }, // correct
    ]
    const result = findMonthEndKeeperForward('2024-08', mixed)
    expect(result).toBe('2024-09-02')
  })

  it('returns null when no closing-period entries exist for the target month', () => {
    const noClosing: RawCSVEntry[] = [
      {
        collectionDate: '2024-09-01',
        isClosingPeriod: false,
        dataMonth: '2024-09',
      },
      {
        collectionDate: '2024-09-02',
        isClosingPeriod: false,
        dataMonth: '2024-09',
      },
    ]
    const result = findMonthEndKeeperForward('2024-08', noClosing)
    expect(result).toBeNull()
  })

  it('returns null for an empty window', () => {
    const result = findMonthEndKeeperForward('2024-08', [])
    expect(result).toBeNull()
  })

  it('handles a window where closing-period dates span many days (June data in July)', () => {
    // June data may have closing-period dates collected all the way to July 14
    const juneWindow: RawCSVEntry[] = [
      {
        collectionDate: '2024-07-01',
        isClosingPeriod: true,
        dataMonth: '2024-06',
      },
      {
        collectionDate: '2024-07-02',
        isClosingPeriod: true,
        dataMonth: '2024-06',
      },
      {
        collectionDate: '2024-07-10',
        isClosingPeriod: true,
        dataMonth: '2024-06',
      },
      {
        collectionDate: '2024-07-14',
        isClosingPeriod: true,
        dataMonth: '2024-06',
      },
      {
        collectionDate: '2024-07-15',
        isClosingPeriod: false,
        dataMonth: '2024-07',
      },
    ]
    const result = findMonthEndKeeperForward('2024-06', juneWindow)
    expect(result).toBe('2024-07-14')
  })

  it('returns the single closing-period date when only one exists', () => {
    const single: RawCSVEntry[] = [
      {
        collectionDate: '2024-09-01',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      },
    ]
    const result = findMonthEndKeeperForward('2024-08', single)
    expect(result).toBe('2024-09-01')
  })

  it('correctly finds a keeper on day 17 of the next month (past the old 14-day window)', () => {
    // Validates the bug-fix: a fixed 14-day window would have returned null here.
    // The prefix-filter approach finds this regardless of how late it falls.
    const lateClosing: RawCSVEntry[] = [
      {
        collectionDate: '2024-09-15',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      },
      {
        collectionDate: '2024-09-16',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      },
      {
        collectionDate: '2024-09-17',
        isClosingPeriod: true,
        dataMonth: '2024-08',
      }, // would be missed by 14-day cap
      {
        collectionDate: '2024-09-18',
        isClosingPeriod: false,
        dataMonth: '2024-09',
      },
    ]
    const result = findMonthEndKeeperForward('2024-08', lateClosing)
    expect(result).toBe('2024-09-17')
  })
})
