/**
 * Unit Tests for CSV Export utility functions (#282)
 *
 * Covers: arrayToCSV, downloadCSV, generateFilename, exportMembershipHistory,
 * exportClubs, exportEducationalAwards, exportDailyReports,
 * exportDailyReportDetail, exportDistrictStatistics,
 * exportHistoricalRankData
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  arrayToCSV,
  downloadCSV,
  generateFilename,
  exportMembershipHistory,
  exportClubs,
  exportEducationalAwards,
  exportDailyReports,
  exportDailyReportDetail,
  exportDistrictStatistics,
  exportHistoricalRankData,
} from '../csvExport'

// ─── Shared test infrastructure ──────────────────────────────────────

let originalCreateObjectURL: typeof URL.createObjectURL
let originalRevokeObjectURL: typeof URL.revokeObjectURL
let originalBlob: typeof Blob
let capturedCSVContent: string | null = null

function setupDownloadMocks() {
  originalCreateObjectURL = URL.createObjectURL
  originalRevokeObjectURL = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()

  capturedCSVContent = null

  const mockLink = {
    setAttribute: vi.fn(),
    click: vi.fn(),
    style: { visibility: '' },
  }

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      return mockLink as unknown as HTMLAnchorElement
    }
    return document.createElement(tagName)
  })

  vi.spyOn(document.body, 'appendChild').mockImplementation(
    () => null as unknown as HTMLElement
  )
  vi.spyOn(document.body, 'removeChild').mockImplementation(
    () => null as unknown as HTMLElement
  )

  originalBlob = globalThis.Blob
  globalThis.Blob = class MockBlob {
    constructor(
      parts?: (string | Blob | ArrayBuffer | ArrayBufferView)[],
      options?: { type?: string; endings?: 'transparent' | 'native' }
    ) {
      if (parts && parts.length > 0) {
        capturedCSVContent = parts[0] as string
      }
      return new originalBlob(parts, options)
    }
  } as typeof Blob

  return mockLink
}

function teardownDownloadMocks() {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  globalThis.Blob = originalBlob
  vi.restoreAllMocks()
}

/** Parse captured CSV into lines */
function csvLines(): string[] {
  expect(capturedCSVContent).not.toBeNull()
  return capturedCSVContent!.split('\n')
}

// ─── arrayToCSV ──────────────────────────────────────────────────────

describe('arrayToCSV', () => {
  it('converts a simple 2D array to CSV', () => {
    const result = arrayToCSV([
      ['Name', 'Age'],
      ['Alice', 30],
    ])
    expect(result).toBe('Name,Age\nAlice,30')
  })

  it('returns empty string for empty array', () => {
    expect(arrayToCSV([])).toBe('')
  })

  it('handles a single row', () => {
    expect(arrayToCSV([['a', 'b', 'c']])).toBe('a,b,c')
  })

  it('wraps cells containing commas in quotes', () => {
    const result = arrayToCSV([['hello, world', 'plain']])
    expect(result).toBe('"hello, world",plain')
  })

  it('escapes double quotes by doubling them', () => {
    const result = arrayToCSV([['say "hi"', 'ok']])
    expect(result).toBe('"say ""hi""",ok')
  })

  it('wraps cells containing newlines in quotes', () => {
    const result = arrayToCSV([['line1\nline2', 'ok']])
    expect(result).toBe('"line1\nline2",ok')
  })

  it('handles cells with both commas and quotes', () => {
    const result = arrayToCSV([['value "with, both"', 'ok']])
    expect(result).toBe('"value ""with, both""",ok')
  })

  it('converts numbers to strings', () => {
    const result = arrayToCSV([[42, 3.14, 0]])
    expect(result).toBe('42,3.14,0')
  })
})

// ─── downloadCSV ─────────────────────────────────────────────────────

describe('downloadCSV', () => {
  let mockLink: ReturnType<typeof setupDownloadMocks>

  beforeEach(() => {
    mockLink = setupDownloadMocks()
  })
  afterEach(teardownDownloadMocks)

  it('creates a Blob with CSV content type', () => {
    downloadCSV('a,b\n1,2', 'test.csv')
    expect(capturedCSVContent).toBe('a,b\n1,2')
  })

  it('sets href and download attributes on the link', () => {
    downloadCSV('data', 'report.csv')
    expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:mock-url')
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'report.csv')
  })

  it('hides the link, appends to body, clicks, and removes', () => {
    downloadCSV('data', 'report.csv')
    expect(mockLink.style.visibility).toBe('hidden')
    expect(document.body.appendChild).toHaveBeenCalled()
    expect(mockLink.click).toHaveBeenCalled()
    expect(document.body.removeChild).toHaveBeenCalled()
  })

  it('revokes the object URL after download', () => {
    downloadCSV('data', 'report.csv')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

// ─── generateFilename ────────────────────────────────────────────────

describe('generateFilename', () => {
  it('should generate filename with data type, district ID, and date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const filename = generateFilename('membership_history', 'D123')
    expect(filename).toBe('membership_history_district_D123_2024-01-15.csv')

    vi.useRealTimers()
  })

  it('should generate filename for clubs export', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const filename = generateFilename('clubs', 'D456')
    expect(filename).toBe('clubs_district_D456_2024-01-15.csv')

    vi.useRealTimers()
  })

  it('should generate filename for educational awards', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const filename = generateFilename('educational_awards', 'D789')
    expect(filename).toBe('educational_awards_district_D789_2024-01-15.csv')

    vi.useRealTimers()
  })

  it('should generate filename for daily reports', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))

    const filename = generateFilename('daily_reports', 'D101')
    expect(filename).toBe('daily_reports_district_D101_2024-01-15.csv')

    vi.useRealTimers()
  })
})

// ─── exportMembershipHistory ─────────────────────────────────────────

describe('exportMembershipHistory', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  it('exports with Date and Member Count headers', () => {
    exportMembershipHistory(
      [{ date: '2025-01-01', count: 100 }],
      '61',
      'District 61'
    )
    const content = capturedCSVContent!
    expect(content).toContain('Date,Member Count')
  })

  it('includes district metadata in preamble', () => {
    exportMembershipHistory(
      [{ date: '2025-01-01', count: 100 }],
      '61',
      'District 61'
    )
    const lines = csvLines()
    expect(lines[0]).toContain('District 61')
    expect(lines[0]).toContain('61')
  })

  it('includes data rows with correct values', () => {
    const data = [
      { date: '2025-01-01', count: 100 },
      { date: '2025-02-01', count: 105 },
    ]
    exportMembershipHistory(data, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('2025-01-01,100')
    expect(content).toContain('2025-02-01,105')
  })
})

// ─── exportClubs ─────────────────────────────────────────────────────

describe('exportClubs', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleClubs = [
    {
      id: '1234',
      name: 'Toast Masters',
      status: 'thriving',
      memberCount: 25,
      distinguished: true,
      distinguishedLevel: 'President',
      awards: 7,
    },
    {
      id: '5678',
      name: 'Speech Club',
      status: 'vulnerable',
      memberCount: 12,
      distinguished: false,
      awards: 2,
    },
  ]

  it('exports with correct headers', () => {
    exportClubs(sampleClubs, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain(
      'Club ID,Club Name,Status,Member Count,Distinguished,Distinguished Level,Awards'
    )
  })

  it('maps distinguished boolean to Yes/No', () => {
    exportClubs(sampleClubs, '61', 'District 61')
    const content = capturedCSVContent!
    // First club: distinguished = true
    expect(content).toContain('1234,Toast Masters,thriving,25,Yes,President,7')
    // Second club: distinguished = false
    expect(content).toContain('5678,Speech Club,vulnerable,12,No,N/A,2')
  })

  it('includes total clubs count in preamble', () => {
    exportClubs(sampleClubs, '61', 'District 61')
    const lines = csvLines()
    expect(lines[2]).toContain('Total Clubs: 2')
  })

  it('handles club names with commas', () => {
    const clubs = [
      {
        id: '1',
        name: 'Club, Inc.',
        status: 'active',
        memberCount: 10,
        distinguished: false,
        awards: 0,
      },
    ]
    exportClubs(clubs, '61', 'District 61')
    expect(capturedCSVContent).toContain('"Club, Inc."')
  })
})

// ─── exportEducationalAwards ─────────────────────────────────────────

describe('exportEducationalAwards', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleData = {
    totalAwards: 15,
    byType: [
      { type: 'CC', count: 5 },
      { type: 'AC', count: 10 },
    ],
    topClubs: [{ clubId: '1234', clubName: 'Top Club', awards: 8 }],
    byMonth: [
      { month: 'January', count: 3 },
      { month: 'February', count: 5 },
    ],
  }

  it('includes all three sections', () => {
    exportEducationalAwards(sampleData, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Awards by Type')
    expect(content).toContain('Top Performing Clubs')
    expect(content).toContain('Awards by Month')
  })

  it('includes total awards in preamble', () => {
    exportEducationalAwards(sampleData, '61', 'District 61')
    const lines = csvLines()
    expect(lines[2]).toContain('Total Awards: 15')
  })

  it('includes award type data', () => {
    exportEducationalAwards(sampleData, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('CC,5')
    expect(content).toContain('AC,10')
  })

  it('includes top clubs data', () => {
    exportEducationalAwards(sampleData, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('1234,Top Club,8')
  })

  it('includes monthly data', () => {
    exportEducationalAwards(sampleData, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('January,3')
    expect(content).toContain('February,5')
  })
})

// ─── exportDailyReports ──────────────────────────────────────────────

describe('exportDailyReports', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleReports = [
    {
      date: '2025-03-01',
      newMembers: 5,
      renewals: 3,
      clubChanges: [{ clubId: '1', change: 'added' }],
      awards: 2,
    },
    {
      date: '2025-03-02',
      newMembers: 2,
      renewals: 1,
      clubChanges: [],
      awards: 0,
    },
  ]

  it('exports with correct headers', () => {
    exportDailyReports(sampleReports, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain(
      'Date,New Members,Renewals,Club Changes,Awards,Net Change'
    )
  })

  it('computes net change as newMembers + renewals', () => {
    exportDailyReports(sampleReports, '61', 'District 61')
    const content = capturedCSVContent!
    // First report: 5 + 3 = 8
    expect(content).toContain('2025-03-01,5,3,1,2,8')
    // Second report: 2 + 1 = 3
    expect(content).toContain('2025-03-02,2,1,0,0,3')
  })

  it('includes date range in preamble', () => {
    exportDailyReports(sampleReports, '61', 'District 61')
    const lines = csvLines()
    expect(lines[2]).toContain('2025-03-01')
    expect(lines[2]).toContain('2025-03-02')
  })
})

// ─── exportDailyReportDetail ─────────────────────────────────────────

describe('exportDailyReportDetail', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleReport = {
    date: '2025-03-15',
    newMembers: [{ name: 'Alice', clubId: '100', clubName: 'Club A' }],
    renewals: [{ name: 'Bob', clubId: '200', clubName: 'Club B' }],
    clubChanges: [
      {
        clubId: '300',
        clubName: 'Club C',
        changeType: 'Added',
        details: 'New charter',
      },
    ],
    awards: [
      {
        type: 'CC',
        level: 'Competent',
        recipient: 'Carol',
        clubId: '100',
        clubName: 'Club A',
      },
    ],
    summary: {
      totalNewMembers: 1,
      totalRenewals: 1,
      totalAwards: 1,
      netMembershipChange: 2,
      dayOverDayChange: 1,
    },
  }

  it('includes summary section with all metrics', () => {
    exportDailyReportDetail(sampleReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Summary')
    expect(content).toContain('Total New Members,1')
    expect(content).toContain('Total Renewals,1')
    expect(content).toContain('Total Awards,1')
    expect(content).toContain('Net Membership Change,2')
    expect(content).toContain('Day-over-Day Change,1')
  })

  it('includes new members section', () => {
    exportDailyReportDetail(sampleReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('New Members')
    expect(content).toContain('Alice,100,Club A')
  })

  it('includes renewals section', () => {
    exportDailyReportDetail(sampleReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Renewals')
    expect(content).toContain('Bob,200,Club B')
  })

  it('includes club changes section', () => {
    exportDailyReportDetail(sampleReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Club Changes')
    expect(content).toContain('300,Club C,Added,New charter')
  })

  it('includes awards section', () => {
    exportDailyReportDetail(sampleReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('CC,Competent,Carol,100,Club A')
  })

  it('omits empty sections', () => {
    const emptyReport = {
      ...sampleReport,
      newMembers: [],
      renewals: [],
      clubChanges: [],
      awards: [],
    }
    exportDailyReportDetail(emptyReport, '61', 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Summary')
    // Section headers for empty arrays should not appear
    const lines = content.split('\n')
    const newMemberHeaders = lines.filter(l => l.trim() === 'New Members')
    expect(newMemberHeaders).toHaveLength(0)
  })
})

// ─── exportDistrictStatistics ────────────────────────────────────────

describe('exportDistrictStatistics', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleStats = {
    districtId: '61',
    asOfDate: '2025-03-15',
    membership: {
      total: 5000,
      change: 100,
      changePercent: 2.0,
    },
    clubs: {
      total: 200,
      active: 180,
      suspended: 20,
      distinguished: 50,
    },
    education: {
      totalAwards: 300,
    },
  }

  it('includes all three stat sections', () => {
    exportDistrictStatistics(sampleStats, 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Membership Statistics')
    expect(content).toContain('Club Statistics')
    expect(content).toContain('Educational Statistics')
  })

  it('includes membership metrics', () => {
    exportDistrictStatistics(sampleStats, 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Total Members,5000')
    expect(content).toContain('Change,100')
    expect(content).toContain('Change Percent,2%')
  })

  it('includes club metrics', () => {
    exportDistrictStatistics(sampleStats, 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Total Clubs,200')
    expect(content).toContain('Active Clubs,180')
    expect(content).toContain('Suspended Clubs,20')
    expect(content).toContain('Distinguished Clubs,50')
  })

  it('computes distinguished percentage', () => {
    exportDistrictStatistics(sampleStats, 'District 61')
    const content = capturedCSVContent!
    // 50/200 = 25.0%
    expect(content).toContain('Distinguished Percentage,25.0%')
  })

  it('includes educational statistics', () => {
    exportDistrictStatistics(sampleStats, 'District 61')
    const content = capturedCSVContent!
    expect(content).toContain('Total Awards,300')
  })
})

// ─── exportHistoricalRankData ────────────────────────────────────────

describe('exportHistoricalRankData', () => {
  beforeEach(setupDownloadMocks)
  afterEach(teardownDownloadMocks)

  const sampleData = [
    {
      districtId: '61',
      districtName: 'District 61',
      history: [
        {
          date: '2025-01-01',
          aggregateScore: 85.5,
          clubsRank: 3,
          paymentsRank: 5,
          distinguishedRank: 2,
        },
        {
          date: '2025-02-01',
          aggregateScore: 90.2,
          clubsRank: 2,
          paymentsRank: 4,
          distinguishedRank: 1,
        },
      ],
    },
  ]

  it('creates headers with district metric columns', () => {
    exportHistoricalRankData(sampleData)
    const content = capturedCSVContent!
    expect(content).toContain('Date')
    expect(content).toContain('District 61 - Overall Score')
    expect(content).toContain('District 61 - Clubs Rank')
    expect(content).toContain('District 61 - Payments Rank')
    expect(content).toContain('District 61 - Distinguished Rank')
  })

  it('sorts dates chronologically', () => {
    exportHistoricalRankData(sampleData)
    const content = capturedCSVContent!
    const dateIndex1 = content.indexOf('2025-01-01')
    const dateIndex2 = content.indexOf('2025-02-01')
    expect(dateIndex1).toBeLessThan(dateIndex2)
  })

  it('rounds aggregate scores', () => {
    exportHistoricalRankData(sampleData)
    const content = capturedCSVContent!
    // 85.5 rounds to 86, 90.2 rounds to 90
    expect(content).toContain('2025-01-01,86,3,5,2')
    expect(content).toContain('2025-02-01,90,2,4,1')
  })

  it('includes program year when provided', () => {
    const py = {
      startDate: '2024-07-01',
      endDate: '2025-06-30',
      year: '2024-2025',
    }
    exportHistoricalRankData(sampleData, py)
    const content = capturedCSVContent!
    expect(content).toContain('Program Year: 2024-2025')
  })

  it('omits program year line when not provided', () => {
    exportHistoricalRankData(sampleData)
    const content = capturedCSVContent!
    expect(content).not.toContain('Program Year:')
  })

  it('handles multiple districts with different date sets', () => {
    const multiDistrict = [
      {
        districtId: '61',
        districtName: 'District 61',
        history: [
          {
            date: '2025-01-01',
            aggregateScore: 85,
            clubsRank: 3,
            paymentsRank: 5,
            distinguishedRank: 2,
          },
        ],
      },
      {
        districtId: '42',
        districtName: 'District 42',
        history: [
          {
            date: '2025-02-01',
            aggregateScore: 70,
            clubsRank: 10,
            paymentsRank: 8,
            distinguishedRank: 12,
          },
        ],
      },
    ]
    exportHistoricalRankData(multiDistrict)
    const content = capturedCSVContent!
    expect(content).toContain('District 61')
    expect(content).toContain('District 42')
    // District 61 has data for Jan, District 42 has data for Feb
    // Missing data points should be empty strings
    expect(content).toContain('2025-01-01,85,3,5,2,,,,')
    expect(content).toContain('2025-02-01,,,,,70,10,8,12')
  })
})
