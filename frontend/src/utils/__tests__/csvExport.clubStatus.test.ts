/**
 * Unit Tests for CSV Export - Club Status Column
 *
 * Feature: club-status-field
 * Task: 5.2 Write unit tests for club status export
 *
 * Validates: Requirements 6.1, 6.2
 *
 * Per the property-testing-guidance.md steering document, this feature uses unit tests
 * rather than property-based tests because the operations are simple (string export)
 * and 3-5 well-chosen examples fully cover the behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportClubPerformance } from '../csvExport'

describe('CSV Export - Club Status Column', () => {
  // Store the original URL methods and Blob
  let originalCreateObjectURL: typeof URL.createObjectURL
  let originalRevokeObjectURL: typeof URL.revokeObjectURL
  let originalBlob: typeof Blob
  let capturedCSVContent: string | null = null

  beforeEach(() => {
    // Mock URL methods
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    // Reset captured content
    capturedCSVContent = null

    // Mock document methods to capture CSV content
    const mockLink = {
      setAttribute: vi.fn(),
      click: vi.fn(),
      style: { visibility: '' },
    }

    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName === 'a') {
          return mockLink as unknown as HTMLAnchorElement
        }
        return document.createElement(tagName)
      }
    )

    vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => null as unknown as HTMLElement
    )
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      () => null as unknown as HTMLElement
    )

    // Capture the Blob content using a class mock (must be a class to work with 'new')
    originalBlob = globalThis.Blob
    globalThis.Blob = class MockBlob {
      constructor(
        parts?: ConstructorParameters<typeof Blob>[0],
        options?: ConstructorParameters<typeof Blob>[1]
      ) {
        if (parts && parts.length > 0) {
          capturedCSVContent = parts[0] as string
        }
        // Return a real Blob for type compatibility
        return new originalBlob(parts, options)
      }
    } as typeof Blob
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    globalThis.Blob = originalBlob
    vi.restoreAllMocks()
  })

  /**
   * Helper function to create a minimal club for export testing
   */
  const createExportClub = (
    clubId: string,
    clubName: string,
    clubStatus?: string
  ) => ({
    clubId,
    clubName,
    divisionName: 'Division A',
    areaName: 'Area 1',
    membershipTrend: [{ date: '2024-01-01', count: 20 }],
    dcpGoalsTrend: [{ date: '2024-01-01', goalsAchieved: 5 }],
    currentStatus: 'thriving' as const,
    distinguishedLevel: 'Distinguished',
    riskFactors: [],
    octoberRenewals: 10,
    aprilRenewals: 8,
    newMembers: 5,
    clubStatus,
  })

  /**
   * Helper function to parse CSV content and get headers
   */
  const getCSVHeaders = (): string[] => {
    expect(capturedCSVContent).not.toBeNull()
    const lines = capturedCSVContent!.split('\n')
    // Line 4 is the header row (after metadata rows)
    return lines[4].split(',')
  }

  /**
   * Helper function to parse CSV content and get data rows
   */
  const getCSVDataRows = (): string[][] => {
    expect(capturedCSVContent).not.toBeNull()
    const lines = capturedCSVContent!.split('\n')
    // Data rows start at line 5
    return lines
      .slice(5)
      .filter(line => line.trim())
      .map(line => line.split(','))
  }

  /**
   * Helper function to get the value of a specific column for a data row
   */
  const getColumnValue = (
    headers: string[],
    row: string[],
    columnName: string
  ): string => {
    const index = headers.indexOf(columnName)
    expect(index).toBeGreaterThanOrEqual(0)
    return row[index]
  }

  describe('CSV Header Structure', () => {
    /**
     * Test: CSV includes Club Status column in headers
     * Validates: Requirement 6.1 - WHEN exporting club data to CSV, THE System SHALL include a "Club Status" column
     */
    it('should include Club Status column in CSV headers', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Active')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      expect(headers).toContain('Club Status')
    })

    /**
     * Test: Club Status column is positioned correctly
     * Validates: Requirement 6.1 - Column should be in a logical position
     */
    it('should position Club Status column after Status column', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Active')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const statusIndex = headers.indexOf('Status')
      const clubStatusIndex = headers.indexOf('Club Status')

      expect(statusIndex).toBeGreaterThanOrEqual(0)
      expect(clubStatusIndex).toBeGreaterThanOrEqual(0)
      expect(clubStatusIndex).toBe(statusIndex + 1)
    })
  })

  describe('Defined Club Status Values', () => {
    /**
     * Test: Active status exports correctly
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain the clubStatus value
     */
    it('should export "Active" status correctly', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Active')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('Active')
    })

    /**
     * Test: Suspended status exports correctly
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain the clubStatus value
     */
    it('should export "Suspended" status correctly', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Suspended')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('Suspended')
    })

    /**
     * Test: Ineligible status exports correctly
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain the clubStatus value
     */
    it('should export "Ineligible" status correctly', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Ineligible')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('Ineligible')
    })

    /**
     * Test: Low status exports correctly
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain the clubStatus value
     */
    it('should export "Low" status correctly', () => {
      const clubs = [createExportClub('1234', 'Test Club', 'Low')]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('Low')
    })
  })

  describe('Undefined Club Status Values', () => {
    /**
     * Test: Undefined status exports as empty string
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain empty string for undefined values
     */
    it('should export undefined clubStatus as empty string', () => {
      const clubs = [createExportClub('1234', 'Test Club', undefined)]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('')
    })

    /**
     * Test: Club without clubStatus property exports as empty string
     * Validates: Requirement 6.2 - THE exported Club Status column SHALL contain empty string for undefined values
     */
    it('should export club without clubStatus property as empty string', () => {
      // Create a club without the clubStatus property
      const club = {
        clubId: '1234',
        clubName: 'Test Club',
        divisionName: 'Division A',
        areaName: 'Area 1',
        membershipTrend: [{ date: '2024-01-01', count: 20 }],
        dcpGoalsTrend: [{ date: '2024-01-01', goalsAchieved: 5 }],
        currentStatus: 'thriving' as const,
        distinguishedLevel: 'Distinguished',
        riskFactors: [],
        octoberRenewals: 10,
        aprilRenewals: 8,
        newMembers: 5,
        // Note: clubStatus is intentionally omitted
      }
      exportClubPerformance([club], 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()
      const clubStatusValue = getColumnValue(
        headers,
        dataRows[0],
        'Club Status'
      )

      expect(clubStatusValue).toBe('')
    })
  })

  describe('Multiple Clubs Export', () => {
    /**
     * Test: Multiple clubs with mixed status values export correctly
     * Validates: Requirements 6.1, 6.2 - All clubs should have correct Club Status values
     */
    it('should export multiple clubs with mixed status values correctly', () => {
      const clubs = [
        createExportClub('1001', 'Active Club', 'Active'),
        createExportClub('1002', 'Suspended Club', 'Suspended'),
        createExportClub('1003', 'No Status Club', undefined),
        createExportClub('1004', 'Low Club', 'Low'),
        createExportClub('1005', 'Ineligible Club', 'Ineligible'),
      ]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()

      expect(dataRows).toHaveLength(5)

      // Verify each club's status
      expect(getColumnValue(headers, dataRows[0], 'Club Status')).toBe('Active')
      expect(getColumnValue(headers, dataRows[1], 'Club Status')).toBe(
        'Suspended'
      )
      expect(getColumnValue(headers, dataRows[2], 'Club Status')).toBe('')
      expect(getColumnValue(headers, dataRows[3], 'Club Status')).toBe('Low')
      expect(getColumnValue(headers, dataRows[4], 'Club Status')).toBe(
        'Ineligible'
      )
    })

    /**
     * Test: All clubs with undefined status export as empty strings
     * Validates: Requirement 6.2 - All undefined values should be empty strings
     */
    it('should export all clubs with undefined status as empty strings', () => {
      const clubs = [
        createExportClub('1001', 'Club A', undefined),
        createExportClub('1002', 'Club B', undefined),
        createExportClub('1003', 'Club C', undefined),
      ]
      exportClubPerformance(clubs, 'D123')

      const headers = getCSVHeaders()
      const dataRows = getCSVDataRows()

      expect(dataRows).toHaveLength(3)

      // All clubs should have empty Club Status
      dataRows.forEach(row => {
        expect(getColumnValue(headers, row, 'Club Status')).toBe('')
      })
    })
  })
})
