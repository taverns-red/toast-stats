import React from 'react'
import type { ProgramYearSetter } from '../hooks/useUrlProgramYear'
import { USER_PICK } from '../hooks/useUrlProgramYear'
import {
  ProgramYear,
  formatProgramYear,
  getProgramYearProgress,
} from '../utils/programYear'
import { formatDisplayDate } from '../utils/dateFormatting'

interface ProgramYearSelectorProps {
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  /** Called with `USER_PICK` — a pick pushes a history entry (#2412). */
  onProgramYearChange: ProgramYearSetter
  className?: string
  showProgress?: boolean
  /** Whether the component is in an error state (Requirement 4.3) */
  isError?: boolean
  /** Error message to display when in error state */
  errorMessage?: string
  /** Callback for retry button when in error state */
  onRetry?: () => void
  /** Whether the component is loading */
  isLoading?: boolean
}

export const ProgramYearSelector: React.FC<ProgramYearSelectorProps> = ({
  availableProgramYears,
  selectedProgramYear,
  onProgramYearChange,
  className = '',
  showProgress = false,
  isError = false,
  errorMessage,
  onRetry,
  isLoading = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = parseInt(e.target.value)
    const programYear = availableProgramYears.find(py => py.year === year)
    if (programYear) {
      onProgramYearChange(programYear, USER_PICK)
    }
  }

  const progress = showProgress
    ? getProgramYearProgress(selectedProgramYear)
    : null

  // Loading state - shows skeleton UI
  if (isLoading) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
          <div className="h-10 w-full bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // Error state - shows user-friendly message with optional retry button (Requirement 4.3)
  if (isError) {
    return (
      <div
        className={`flex flex-col gap-2 ${className}`}
        role="alert"
        aria-live="polite"
      >
        <label className="text-xs sm:text-sm font-tm-body font-medium text-gray-700">
          Program Year
        </label>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-600">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium">
              {errorMessage ??
                'Unable to load program years. Please try again.'}
            </span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium text-tm-loyal-blue border-2 border-tm-loyal-blue rounded-lg hover:bg-tm-loyal-blue hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-tm-loyal-blue focus:ring-offset-2"
              aria-label="Retry loading program years"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  // Empty state - shows message when no program years are available (Requirement 4.2)
  if (availableProgramYears.length === 0) {
    return (
      <div
        className={`flex flex-col gap-2 ${className}`}
        role="status"
        aria-live="polite"
      >
        <label className="text-xs sm:text-sm font-tm-body font-medium text-gray-700">
          Program Year
        </label>
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
          <svg
            className="w-5 h-5 flex-shrink-0 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-sm font-medium">
            No program years available. Data may not have been collected yet.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor="program-year-selector"
        className="text-xs sm:text-sm font-tm-body font-medium text-gray-700"
      >
        Program Year
      </label>
      <div className="relative">
        <select
          id="program-year-selector"
          value={selectedProgramYear.year}
          onChange={handleChange}
          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-tm-loyal-blue focus:border-transparent bg-white text-gray-900 text-sm appearance-none pr-10 font-tm-body"
          style={{ color: 'var(--tm-black)' }}
        >
          {availableProgramYears.map(programYear => (
            <option
              key={programYear.year}
              value={programYear.year}
              className="text-gray-900 bg-white"
            >
              {formatProgramYear(programYear)}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
          <svg
            className="fill-current h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>

      {/* Progress Bar */}
      {showProgress && progress !== null && progress < 100 && (
        <div className="mt-1">
          <div className="flex justify-between items-center gap-2 text-xs font-tm-body text-gray-600 mb-1">
            <span>Program Year Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-tm-loyal-blue h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Date Range Display */}
      <div className="text-xs font-tm-body text-gray-500">
        {formatDisplayDate(selectedProgramYear.startDate)} -{' '}
        {formatDisplayDate(selectedProgramYear.endDate)}
      </div>
    </div>
  )
}
