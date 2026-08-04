import React, { useState, useRef, useEffect } from 'react'
import { useViewportClampedTooltip } from '../hooks/useViewportClampedTooltip'

/**
 * Props for the Tooltip component
 */
interface TooltipProps {
  /** The content to display in the tooltip */
  content: string | React.ReactNode
  /** The element that triggers the tooltip */
  children: React.ReactNode
  /** Position of the tooltip relative to the trigger element */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Optional CSS classes for the tooltip container */
  className?: string
  /** Delay before showing tooltip in milliseconds */
  delay?: number
}

/**
 * Tooltip Component
 *
 * Displays helpful information when users hover over or focus on an element.
 * Fully accessible with keyboard navigation and screen reader support.
 *
 * Features:
 * - Keyboard accessible (shows on focus)
 * - Screen reader friendly with aria-describedby
 * - Configurable position
 * - Optional delay before showing
 * - Responsive positioning
 *
 * @component
 * @example
 * ```tsx
 * <Tooltip content="This metric shows the total number of active members">
 *   <span>Total Membership</span>
 * </Tooltip>
 * ```
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
  delay = 200,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipId] = useState(
    () => `tooltip-${Math.random().toString(36).substr(2, 9)}`
  )
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keeps the panel inside the viewport when the trigger sits near an edge.
  const { panelRef, style: clampStyle } =
    useViewportClampedTooltip<HTMLDivElement>(isVisible)

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /* Placement. The horizontal centring (and the viewport-collision shift that
     composes into it) lives in `styles/components/tooltip.css` — see #1405:
     Tailwind v4's `-translate-x-1/2` compiles to the `translate` property, so
     the utility and the measured shift cannot both own that declaration. */
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom':
        return 'top-full tooltip-panel--centered mt-2'
      case 'left':
        return 'right-full top-1/2 tooltip-panel--side mr-2'
      case 'right':
        return 'left-full top-1/2 tooltip-panel--side ml-2'
      case 'top':
      default:
        return 'bottom-full tooltip-panel--centered mb-2'
    }
  }

  const getArrowClasses = () => {
    switch (position) {
      case 'bottom':
        return 'bottom-full tooltip-arrow--centered border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent'
      case 'left':
        return 'left-full top-1/2 tooltip-arrow--side border-l-gray-900 border-t-transparent border-b-transparent border-r-transparent'
      case 'right':
        return 'right-full top-1/2 tooltip-arrow--side border-r-gray-900 border-t-transparent border-b-transparent border-l-transparent'
      case 'top':
      default:
        return 'top-full tooltip-arrow--centered border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent'
    }
  }

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={isVisible ? tooltipId : undefined}
        className="inline-flex items-center"
      >
        {children}
      </div>

      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          ref={panelRef}
          style={clampStyle}
          className={`absolute z-50 px-4 py-3 text-sm text-white bg-gray-900 rounded-lg shadow-lg w-80 tooltip-panel ${getPositionClasses()} ${className} animate-fade-in`}
        >
          {content}
          <div
            className={`absolute w-0 h-0 border-4 ${getArrowClasses()}`}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

/**
 * InfoIcon Component
 *
 * A small info icon that can be used with tooltips to indicate
 * additional information is available.
 *
 * @component
 * @example
 * ```tsx
 * <Tooltip content="Helpful information">
 *   <InfoIcon />
 * </Tooltip>
 * ```
 */
export const InfoIcon: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  return (
    <svg
      className={`w-4 h-4 text-gray-500 hover:text-gray-700 transition-colors cursor-help ${className}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  )
}
