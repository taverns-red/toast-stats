import React from 'react'

interface ErrorDisplayProps {
  error: Error | string | null
  onRetry?: () => void
  title?: string
  /**
   * What failed to load, as a noun phrase with its determiner ("this
   * division", "the regions"): used in the copy, so plurals read as English.
   */
  subject?: string
  showDetails?: boolean
  variant?: 'inline' | 'card' | 'full'
  className?: string
}

/**
 * Reusable error display component with retry functionality
 * Provides user-friendly error messages and optional retry actions
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  title = 'Error Loading Data',
  subject = 'this data',
  showDetails = false,
  variant = 'card',
  className = '',
}) => {
  if (!error) return null

  const errorMessage = typeof error === 'string' ? error : error.message

  // Determine if this is a network error
  const isNetworkError =
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('fetch') ||
    // Safari's wording for a failed fetch.
    errorMessage.toLowerCase().includes('load failed') ||
    errorMessage.toLowerCase().includes('connection')

  // Determine if this is a not found error
  const isNotFoundError =
    errorMessage.toLowerCase().includes('404') ||
    errorMessage.toLowerCase().includes('not found')

  const getErrorIcon = () => {
    if (isNetworkError) {
      return (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      )
    }
    return (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    )
  }

  const getUserFriendlyMessage = () => {
    if (isNetworkError) {
      return `We couldn't load ${subject}. Check your connection and try again.`
    }
    if (isNotFoundError) {
      return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} could not be found.`
    }
    return errorMessage
  }

  if (variant === 'inline') {
    return (
      <div
        className={`flex items-center gap-2 text-red-600 text-sm ${className}`}
        role="alert"
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{getUserFriendlyMessage()}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-2 tm-btn-secondary text-sm"
            aria-label="Retry loading data"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (variant === 'full') {
    return (
      <div
        className={`tm-card min-h-screen bg-gray-100 flex items-center justify-center px-4 ${className}`}
      >
        <div className="tm-card max-w-md w-full" role="alert">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <div className="text-red-600">{getErrorIcon()}</div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            {title}
          </h2>

          <p className="text-gray-600 text-center mb-6">
            {getUserFriendlyMessage()}
          </p>

          {showDetails && errorMessage && (
            <div className="mb-6 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600 font-mono break-words">
                {errorMessage}
              </p>
            </div>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="tm-btn-primary w-full"
              aria-label="Retry loading data"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  // card variant (default)
  return (
    <div
      className={`redesign-panel p-4 ${className}`}
      style={{ color: 'var(--ink)' }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
          {getErrorIcon()}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold mb-1">{title}</h3>
          <p className="text-sm mb-3">{getUserFriendlyMessage()}</p>

          {showDetails && errorMessage && (
            <details className="mb-3">
              <summary className="text-xs cursor-pointer font-medium">
                Technical Details
              </summary>
              <p className="mt-2 text-xs font-mono p-2 rounded break-words">
                {errorMessage}
              </p>
            </details>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="tm-btn-secondary text-sm"
              aria-label="Try again: retry loading data"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state component for when no data is available
 */
interface EmptyStateProps {
  title?: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  icon?: 'data' | 'search' | 'backfill'
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Data Available',
  message,
  action,
  icon = 'data',
  className = '',
}) => {
  const getIcon = () => {
    if (icon === 'search') {
      return (
        <svg
          className="w-16 h-16 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      )
    }
    if (icon === 'backfill') {
      return (
        <svg
          className="w-16 h-16 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      )
    }
    return (
      <svg
        className="w-16 h-16 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
    )
  }

  return (
    <div className={`tm-card text-center py-12 ${className}`} role="status">
      <div className="flex justify-center mb-4">{getIcon()}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-6 max-w-lg mx-auto px-4">{message}</p>
      {action && (
        <button onClick={action.onClick} className="tm-btn-primary">
          {action.label}
        </button>
      )}
    </div>
  )
}
