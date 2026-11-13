import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnDates } from '../services/cdn'
import { logger } from '../utils/logger'
import type { AvailableDatesResponse } from '../types/districts'

interface DateSelectorProps {
  onDateChange: (date: string) => void
  selectedDate?: string
}

/**
 * Error state interface for DateSelector
 * Validates: Requirements 3.1, 3.3
 */
interface DateSelectorErrorState {
  hasError: boolean
  errorMessage: string
  canRetry: boolean
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DateSelector: React.FC<DateSelectorProps> = ({
  onDateChange,
  selectedDate,
}) => {
  // Parse selected date to set month and day
  const { initialMonth, initialDay } = useMemo(() => {
    if (selectedDate) {
      const date = new Date(selectedDate)
      return {
        initialMonth: date.getMonth() + 1,
        initialDay: date.getDate(),
      }
    }
    return { initialMonth: null, initialDay: null }
  }, [selectedDate])

  // Initialize state from selectedDate
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    initialMonth
  )
  const [selectedDay, setSelectedDay] = useState<number | null>(initialDay)

  // Track the selectedDate prop to detect when it changes externally
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate)

  // Sync state when selectedDate prop changes from parent
  // This pattern is recommended by React docs for deriving state from props
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate)
    setSelectedMonth(initialMonth)
    setSelectedDay(initialDay)
  }

  // Fetch available dates from CDN (#173)
  // CDN returns flat date strings; transform to structured objects for the UI
  // Validates: Requirements 3.1, 3.3, 3.4, 3.5
  const {
    data: availableDatesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AvailableDatesResponse>({
    queryKey: ['available-dates'],
    queryFn: async () => {
      const cdnDates = await fetchCdnDates()
      // Transform flat "YYYY-MM-DD" strings to structured objects
      const dates = cdnDates.dates.map(dateStr => {
        const d = new Date(dateStr + 'T00:00:00')
        const month = d.getMonth() + 1
        return {
          date: dateStr,
          month,
          day: d.getDate(),
          monthName: MONTH_NAMES[month] ?? '',
        }
      })
      return { dates } as AvailableDatesResponse
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2, // Limit retries to prevent infinite retry loops (Requirement 3.4)
  })

  // Log errors for debugging (Requirement 3.5)
  useEffect(() => {
    if (isError && error) {
      logger.error('[DateSelector] Failed to load available dates:', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    }
  }, [isError, error])

  // Compute error state (Requirement 3.1)
  const errorState: DateSelectorErrorState = useMemo(() => {
    if (isError) {
      return {
        hasError: true,
        errorMessage: 'Unable to load available dates. Please try again.',
        canRetry: true,
      }
    }
    return {
      hasError: false,
      errorMessage: '',
      canRetry: false,
    }
  }, [isError])

  const availableDates = useMemo(
    () => availableDatesData?.dates || [],
    [availableDatesData]
  )

  // Get available months (months that have at least one date)
  const availableMonths = React.useMemo(() => {
    const months = new Set<number>()
    availableDates.forEach(d => months.add(d.month))
    return Array.from(months).sort((a, b) => a - b)
  }, [availableDates])

  // Get available days for selected month
  const availableDays = React.useMemo(() => {
    if (!selectedMonth) return []
    return availableDates
      .filter(d => d.month === selectedMonth)
      .map(d => d.day)
      .sort((a, b) => a - b)
  }, [availableDates, selectedMonth])

  // Handle month change
  const handleMonthChange = (month: number) => {
    setSelectedMonth(month)
    setSelectedDay(null) // Reset day when month changes
  }

  // Handle day change
  const handleDayChange = (day: number) => {
    setSelectedDay(day)

    // Find the full date string and trigger callback
    if (selectedMonth) {
      const dateObj = availableDates.find(
        d => d.month === selectedMonth && d.day === day
      )
      if (dateObj) {
        onDateChange(dateObj.date)
      }
    }
  }

  // Check if a specific month is available
  const isMonthAvailable = (month: number) => {
    return availableMonths.includes(month)
  }

  // Check if a specific day is available
  const isDayAvailable = (day: number) => {
    return availableDays.includes(day)
  }

  // Handle retry button click (Requirement 3.3)
  const handleRetry = () => {
    refetch()
  }

  // Loading state - shows skeleton UI (Requirement 3.4)
  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="animate-pulse flex gap-3">
          <div className="h-10 w-32 bg-gray-200 rounded"></div>
          <div className="h-10 w-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // Error state - shows user-friendly message with retry button (Requirements 3.1, 3.3, 3.4)
  if (errorState.hasError) {
    return (
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
        role="alert"
        aria-live="polite"
      >
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
          <span className="text-sm font-medium">{errorState.errorMessage}</span>
        </div>
        {errorState.canRetry && (
          <button
            onClick={handleRetry}
            className="px-4 py-2 text-sm font-medium text-tm-loyal-blue border-2 border-tm-loyal-blue rounded-lg hover:bg-tm-loyal-blue hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-tm-loyal-blue focus:ring-offset-2"
            aria-label="Retry loading available dates"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  // Empty state - shows message when no dates are available (Requirement 3.2)
  if (availableDates.length === 0) {
    return (
      <div
        className="flex items-center gap-2 text-gray-600"
        role="status"
        aria-live="polite"
      >
        <svg
          className="w-5 h-5 flex-shrink-0 text-[var(--ink-3)]"
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
          No dates available. Data may not have been collected yet.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <label className="text-sm font-medium text-gray-700">Select Date:</label>

      {/* Month Dropdown */}
      <div className="relative">
        <select
          value={selectedMonth || ''}
          onChange={e => handleMonthChange(Number(e.target.value))}
          className="px-4 py-2 border-2 border-gray-300 rounded-lg font-medium text-gray-900 hover:border-tm-loyal-blue focus:outline-hidden focus:ring-2 focus:ring-tm-loyal-blue transition-colors appearance-none pr-10 bg-white"
          aria-label="Select month"
        >
          <option value="">Select Month</option>
          {MONTHS.map(month => (
            <option
              key={month.value}
              value={month.value}
              disabled={!isMonthAvailable(month.value)}
            >
              {month.label}
              {!isMonthAvailable(month.value) ? ' (unavailable)' : ''}
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

      {/* Day Dropdown */}
      <div className="relative">
        <select
          value={selectedDay || ''}
          onChange={e => handleDayChange(Number(e.target.value))}
          disabled={!selectedMonth}
          className="px-4 py-2 border-2 border-gray-300 rounded-lg font-medium text-gray-900 hover:border-tm-loyal-blue focus:outline-hidden focus:ring-2 focus:ring-tm-loyal-blue transition-colors appearance-none pr-10 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
          aria-label="Select day"
        >
          <option value="">Select Day</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
            <option key={day} value={day} disabled={!isDayAvailable(day)}>
              {day}
              {selectedMonth && !isDayAvailable(day) ? ' (unavailable)' : ''}
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

      {/* Current Selection Indicator */}
      {selectedMonth && selectedDay && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-tm-cool-gray/20 border border-tm-cool-gray rounded-lg">
          <svg
            className="w-4 h-4 text-tm-loyal-blue"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-tm-loyal-blue">
            {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedDay}
          </span>
        </div>
      )}
    </div>
  )
}

export default DateSelector
