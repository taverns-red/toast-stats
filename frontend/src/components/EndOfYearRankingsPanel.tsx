import React from 'react'
import RankingCard from './RankingCard'
import type { EndOfYearRankings } from '../hooks/useGlobalRankings'
import type { ProgramYear } from '../utils/programYear'

/**
 * Props for the EndOfYearRankingsPanel component
 */
export interface EndOfYearRankingsPanelProps {
  /** End-of-year rankings data for all four metrics */
  rankings: EndOfYearRankings | null
  /** Whether the data is currently loading */
  isLoading: boolean
  /** The program year being displayed */
  programYear: ProgramYear
  /** Previous year's rankings for year-over-year comparison (optional) */
  previousYearRankings?: EndOfYearRankings | null
  /**
   * Why the previous-year rank comparison is deliberately absent, when it is
   * (#1442). Rendered as a note beside the program year; null means the
   * comparison is either shown or simply has no prior year to draw on.
   */
  comparisonUnavailableNote?: string | null
}

/**
 * Trophy icon for Overall Rank
 */
const TrophyIcon: React.FC = () => (
  <svg
    className="w-6 h-6"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 2C13.1 2 14 2.9 14 4H19C19.55 4 20 4.45 20 5V8C20 10.21 18.21 12 16 12H15.92C15.43 13.96 13.68 15.5 11.5 15.91V18H14C14.55 18 15 18.45 15 19V21C15 21.55 14.55 22 14 22H10C9.45 22 9 21.55 9 21V19C9 18.45 9.45 18 10 18H12V15.91C9.82 15.5 8.07 13.96 7.58 12H7.5C5.29 12 3.5 10.21 3.5 8V5C3.5 4.45 3.95 4 4.5 4H10C10 2.9 10.9 2 12 2ZM5.5 6V8C5.5 9.1 6.4 10 7.5 10H7.58C7.53 9.67 7.5 9.34 7.5 9V6H5.5ZM16.5 6V9C16.5 9.34 16.47 9.67 16.42 10H16.5C17.6 10 18.5 9.1 18.5 8V6H16.5Z" />
  </svg>
)

/**
 * Building/Club icon for Paid Clubs Rank
 */
const ClubsIcon: React.FC = () => (
  <svg
    className="w-6 h-6"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 7V3H2V21H22V7H12ZM6 19H4V17H6V19ZM6 15H4V13H6V15ZM6 11H4V9H6V11ZM6 7H4V5H6V7ZM10 19H8V17H10V19ZM10 15H8V13H10V15ZM10 11H8V9H10V11ZM10 7H8V5H10V7ZM20 19H12V17H14V15H12V13H14V11H12V9H20V19ZM18 11H16V13H18V11ZM18 15H16V17H18V15Z" />
  </svg>
)

/**
 * Payment/Dollar icon for Membership Payments Rank
 */
const PaymentsIcon: React.FC = () => (
  <svg
    className="w-6 h-6"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M11.8 10.9C9.53 10.31 8.8 9.7 8.8 8.75C8.8 7.66 9.81 6.9 11.5 6.9C13.28 6.9 13.94 7.75 14 9H16.21C16.14 7.28 15.09 5.7 13 5.19V3H10V5.16C8.06 5.58 6.5 6.84 6.5 8.77C6.5 11.08 8.41 12.23 11.2 12.9C13.7 13.5 14.2 14.38 14.2 15.31C14.2 16 13.71 17.1 11.5 17.1C9.44 17.1 8.63 16.18 8.52 15H6.32C6.44 17.19 8.08 18.42 10 18.83V21H13V18.85C14.95 18.48 16.5 17.35 16.5 15.3C16.5 12.46 14.07 11.49 11.8 10.9Z" />
  </svg>
)

/**
 * Star/Award icon for Distinguished Clubs Rank
 */
const DistinguishedIcon: React.FC = () => (
  <svg
    className="w-6 h-6"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z" />
  </svg>
)

/**
 * EndOfYearRankingsPanel Component
 *
 * Displays four ranking cards showing end-of-year positions for:
 * - Overall Rank (aggregate Borda count)
 * - Paid Clubs Rank
 * - Membership Payments Rank
 * - Distinguished Clubs Rank
 *
 * Features:
 * - Loading skeleton state while data is fetching
 * - Partial year indicator when data is incomplete
 * - Year-over-year change indicators when previous year data is available
 * - Responsive grid layout (stacks on mobile < 640px)
 *
 * Follows Toastmasters brand guidelines:
 * - Uses brand color palette (blue, green, purple, yellow)
 * - Meets WCAG AA contrast requirements
 * - Provides 44px minimum touch targets
 * - Uses Montserrat for headings, Source Sans 3 for body
 *
 * @component
 * @example
 * ```tsx
 * <EndOfYearRankingsPanel
 *   rankings={endOfYearRankings}
 *   isLoading={false}
 *   programYear={{ year: 2024, startDate: '2024-07-01', endDate: '2025-06-30', label: '2024-2025' }}
 *   previousYearRankings={previousYearRankings}
 * />
 * ```
 */
const EndOfYearRankingsPanel: React.FC<EndOfYearRankingsPanelProps> = ({
  rankings,
  isLoading,
  programYear,
  previousYearRankings,
  comparisonUnavailableNote = null,
}) => {
  // Format the as-of date for display
  // Uses UTC to ensure consistent display regardless of timezone
  const formatAsOfDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }

  return (
    <section
      className="w-full"
      aria-labelledby="end-of-year-rankings-heading"
      aria-busy={isLoading}
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h2
          id="end-of-year-rankings-heading"
          className="text-lg sm:text-xl font-semibold text-gray-900 font-tm-headline"
        >
          End-of-Year Rankings
        </h2>

        {/* Data freshness and partial year indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {rankings && (
            <span className="text-sm text-gray-600 font-tm-body">
              As of {formatAsOfDate(rankings.asOfDate)}
            </span>
          )}

          {rankings?.isPartialYear && (
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium bg-amber-100 text-amber-800"
              role="status"
              aria-label="Partial year data - program year not yet complete"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Partial Year
            </span>
          )}
        </div>
      </div>

      {/* Program Year Label */}
      <p className="text-sm text-gray-600 font-tm-body mb-4">
        {programYear.label} Program Year
      </p>

      {/* #1442: the previous-year rank delta is deliberately absent here.
          Say why, rather than silently dropping the comparison. */}
      {comparisonUnavailableNote && (
        <p className="text-sm text-gray-600 font-tm-body mb-4" role="note">
          {comparisonUnavailableNote}
        </p>
      )}

      {/* Rankings Grid - 4 columns on large screens, 2 on medium, 1 on mobile */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        role="list"
        aria-label="End-of-year ranking metrics"
      >
        {/* Overall Rank Card */}
        <div role="listitem">
          <RankingCard
            title="Overall Rank"
            rank={rankings?.overall.rank ?? 0}
            totalDistricts={rankings?.overall.totalDistricts ?? 0}
            percentile={rankings?.overall.percentile ?? 0}
            icon={<TrophyIcon />}
            colorScheme="blue"
            isLoading={isLoading}
            {...(previousYearRankings?.overall.rank !== undefined && {
              previousYearRank: previousYearRankings.overall.rank,
            })}
          />
        </div>

        {/* Paid Clubs Rank Card */}
        <div role="listitem">
          <RankingCard
            title="Paid Clubs"
            rank={rankings?.paidClubs.rank ?? 0}
            totalDistricts={rankings?.paidClubs.totalDistricts ?? 0}
            percentile={rankings?.paidClubs.percentile ?? 0}
            icon={<ClubsIcon />}
            colorScheme="green"
            isLoading={isLoading}
            {...(previousYearRankings?.paidClubs.rank !== undefined && {
              previousYearRank: previousYearRankings.paidClubs.rank,
            })}
          />
        </div>

        {/* Membership Payments Rank Card */}
        <div role="listitem">
          <RankingCard
            title="Payments"
            rank={rankings?.membershipPayments.rank ?? 0}
            totalDistricts={rankings?.membershipPayments.totalDistricts ?? 0}
            percentile={rankings?.membershipPayments.percentile ?? 0}
            icon={<PaymentsIcon />}
            colorScheme="purple"
            isLoading={isLoading}
            {...(previousYearRankings?.membershipPayments.rank !==
              undefined && {
              previousYearRank: previousYearRankings.membershipPayments.rank,
            })}
          />
        </div>

        {/* Distinguished Clubs Rank Card */}
        <div role="listitem">
          <RankingCard
            title="Distinguished"
            rank={rankings?.distinguishedClubs.rank ?? 0}
            totalDistricts={rankings?.distinguishedClubs.totalDistricts ?? 0}
            percentile={rankings?.distinguishedClubs.percentile ?? 0}
            icon={<DistinguishedIcon />}
            colorScheme="yellow"
            isLoading={isLoading}
            {...(previousYearRankings?.distinguishedClubs.rank !==
              undefined && {
              previousYearRank: previousYearRankings.distinguishedClubs.rank,
            })}
          />
        </div>
      </div>
    </section>
  )
}

export default EndOfYearRankingsPanel
