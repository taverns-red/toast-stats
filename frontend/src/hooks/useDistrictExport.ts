import { useState, useCallback } from 'react'
import {
  fetchLatestSnapshotDate,
  fetchCdnDistrictSnapshot,
} from '../services/cdn'
import { arrayToCSV, downloadCSV, generateFilename } from '../utils/csvExport'
import type { SnapshotDate } from '../types/snapshotDate'

interface ExportState {
  isExporting: boolean
  error: Error | null
}

interface UseDistrictExportResult extends ExportState {
  exportToCSV: (
    startDate?: SnapshotDate,
    endDate?: SnapshotDate
  ) => Promise<void>
  clearError: () => void
}

/**
 * Hook to handle district data export to CSV.
 * Fetches snapshot data from CDN and generates CSV client-side.
 */
export const useDistrictExport = (
  districtId: string | null
): UseDistrictExportResult => {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    error: null,
  })

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const exportToCSV = useCallback(
    async (startDate?: SnapshotDate, _endDate?: SnapshotDate) => {
      if (!districtId) {
        setState(prev => ({
          ...prev,
          error: new Error('District ID is required'),
        }))
        return
      }

      setState({ isExporting: true, error: null })

      try {
        // Determine the date for snapshot lookup
        const date = startDate || (await fetchLatestSnapshotDate())

        // Fetch snapshot data from CDN
        const snapshot = await fetchCdnDistrictSnapshot<{
          districtId: string
          districtName: string
          membershipPayments: { currentMonthPaid?: number }
          clubPerformance: Array<{
            clubId: string
            clubName: string
            divisionName?: string
            areaName?: string
            memberCount: number
            activeMemberCount?: number
            dcpGoals: number
            status: string
            distinguishedLevel?: string | null
          }>
          metadata?: { sourceCsvDate?: string }
        }>(date, districtId)

        // Generate CSV from snapshot data
        const headers = [
          'Club ID',
          'Club Name',
          'Division',
          'Area',
          'Members',
          'Active Members',
          'DCP Goals',
          'Status',
          'Distinguished Level',
        ]

        const rows = (snapshot.clubPerformance || []).map(club => [
          club.clubId,
          club.clubName,
          club.divisionName || 'N/A',
          club.areaName || 'N/A',
          club.memberCount,
          club.activeMemberCount ?? club.memberCount,
          club.dcpGoals,
          club.status,
          club.distinguishedLevel || 'None',
        ])

        const csvData: (string | number)[][] = [
          [`District ${districtId} - ${snapshot.districtName || 'Analytics'}`],
          [`Export Date: ${new Date().toISOString()}`],
          [`Data As Of: ${snapshot.metadata?.sourceCsvDate || date}`],
          [`Total Clubs: ${rows.length}`],
          [],
          headers,
          ...rows,
        ]

        const csvContent = arrayToCSV(csvData)
        const filename = generateFilename('analytics', districtId)
        downloadCSV(csvContent, filename)

        setState({ isExporting: false, error: null })
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to export data')
        setState({ isExporting: false, error })
      }
    },
    [districtId]
  )

  return {
    ...state,
    exportToCSV,
    clearError,
  }
}
