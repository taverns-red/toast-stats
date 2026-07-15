/**
 * DivisionPerformanceCards Component
 *
 * Container component that orchestrates the rendering of division performance cards
 * for all divisions in a district. This component processes district snapshot data
 * and displays comprehensive performance metrics for divisions and their areas.
 *
 * This component validates Requirements 1.1, 1.2, 1.3, 10.3, 10.4:
 * - 1.1: Display one performance card for each division in the district
 * - 1.2: Display all division performance cards simultaneously on the same page
 * - 1.3: Order division performance cards by division identifier
 * - 10.4: Indicate loading state to the user when snapshot data is being refreshed
 *
 * (Req 10.3 "display the snapshot timestamp" is served by the page header's
 * freshness pill (#1310); this component's own timestamp panel was dead code
 * bound to a phantom field and was removed in #1321.)
 *
 * The component uses the extractDivisionPerformance utility to transform raw
 * snapshot data into typed performance structures, then renders a DivisionPerformanceCard
 * for each division.
 */

import React from 'react'
import { extractDivisionPerformance } from '../utils/extractDivisionPerformance'
import { DivisionPerformanceCard } from './DivisionPerformanceCard'
import { logger } from '../utils/logger'

/**
 * Props for the DivisionPerformanceCards component
 */
export interface DivisionPerformanceCardsProps {
  /** Raw district snapshot data containing division and area information */
  districtSnapshot: unknown
  /** Optional loading state indicator */
  isLoading?: boolean
  /**
   * The date (`YYYY-MM-DD`) the snapshot is PINNED to. Required (#1321): it
   * gates the area visit round/deadlines, so it is load-bearing, not display —
   * and when it was optional it fell through to the wall clock, which disagrees
   * with the viewed snapshot every closing window.
   */
  snapshotTimestamp: string
  /** District id — threaded to each card so its heading links to the division
   *  page (CC-7, #872). */
  districtId?: string | undefined
}

/**
 * DivisionPerformanceCards Component
 *
 * Renders a collection of division performance cards with the following features:
 * 1. Loading state handling
 * 2. Error state handling for invalid data
 * 3. Ordered rendering of division cards (by division identifier)
 * 4. Empty state handling when no divisions are present
 *
 * The component follows the existing patterns in DistrictDetailPage.tsx and uses
 * Toastmasters brand styling (TM Loyal Blue, Montserrat fonts) for consistency.
 *
 * @component
 * @example
 * ```tsx
 * <DivisionPerformanceCards
 *   districtSnapshot={snapshot}
 *   isLoading={false}
 *   snapshotTimestamp="2026-06-30"
 * />
 * ```
 */
export const DivisionPerformanceCards: React.FC<
  DivisionPerformanceCardsProps
> = ({
  districtSnapshot,
  isLoading = false,
  snapshotTimestamp,
  districtId,
}) => {
  // Extract division performance data from snapshot
  const divisions = React.useMemo(() => {
    if (isLoading || !districtSnapshot) {
      return []
    }
    try {
      return extractDivisionPerformance(districtSnapshot, snapshotTimestamp)
    } catch (error) {
      logger.error('Error extracting division performance:', error)
      return []
    }
  }, [districtSnapshot, isLoading, snapshotTimestamp])

  // Loading state
  if (isLoading) {
    return (
      <div className="redesign-panel">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-tm-loyal-blue mb-4"></div>
            <p
              className="font-tm-body text-gray-600"
              style={{ fontSize: '14px' }}
            >
              Loading division performance data...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Error state - invalid or missing data
  if (!districtSnapshot) {
    return (
      <div className="redesign-panel">
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3
            className="font-tm-headline font-semibold text-gray-900 mb-2"
            style={{ fontSize: '18px' }}
          >
            No Data Available
          </h3>
          <p
            className="font-tm-body text-gray-600"
            style={{ fontSize: '14px' }}
          >
            District snapshot data is not available. Please try refreshing the
            page.
          </p>
        </div>
      </div>
    )
  }

  // Empty state - no divisions found
  if (divisions.length === 0) {
    return (
      <div className="redesign-panel">
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3
            className="font-tm-headline font-semibold text-gray-900 mb-2"
            style={{ fontSize: '18px' }}
          >
            No Divisions Found
          </h3>
          <p
            className="font-tm-body text-gray-600"
            style={{ fontSize: '14px' }}
          >
            No division data was found in the district snapshot.
          </p>
        </div>
      </div>
    )
  }

  // Main render — division cards.
  //
  // A "Division & Area Performance" + "Data as of {date}" panel used to sit here
  // behind `{snapshotTimestamp && …}`. It was DEAD: its only caller
  // (DistrictDivisionsPage) fed it `districtStatistics.asOfDate` — the phantom
  // this sprint deletes — so the guard was always false and the panel has never
  // rendered in production. Its unit tests passed only because their fixtures
  // carried the phantom the wire never sends.
  //
  // Removed rather than resurrected (#1321). Passing the real pinned date would
  // have switched it on as a silent side effect, and it was redundant + wrong:
  // the header's freshness pill already reports the date (#1310), and labelling
  // a PINNED SNAPSHOT date "Data as of" is precisely the snapshot-vs-as-of
  // conflation epic #1319 exists to eliminate — a 5th recurrence, in new copy.
  // `snapshotTimestamp` stays required; it gates the visit round below.
  return (
    <div className="space-y-6">
      {/* Division Performance Cards */}
      <div
        className="space-y-6"
        role="region"
        aria-label="Division performance cards"
      >
        {divisions.map(division => (
          <DivisionPerformanceCard
            key={division.divisionId}
            division={division}
            districtId={districtId}
          />
        ))}
      </div>

      {/* Summary Footer */}
      <div className="redesign-panel">
        <p
          className="font-tm-body text-gray-600 text-center"
          style={{ fontSize: '14px' }}
        >
          Showing {divisions.length} division
          {divisions.length !== 1 ? 's' : ''} with{' '}
          {divisions.reduce((sum, div) => sum + div.areas.length, 0)} total area
          {divisions.reduce((sum, div) => sum + div.areas.length, 0) !== 1
            ? 's'
            : ''}
        </p>
      </div>
    </div>
  )
}

export default DivisionPerformanceCards
