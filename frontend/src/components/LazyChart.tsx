import React, { useEffect, useRef, useState } from 'react'
import { LoadingSkeleton } from './LoadingSkeleton'

interface LazyChartProps {
  children: React.ReactNode
  height?: string
  threshold?: number
}

/**
 * Lazy loading wrapper for charts
 * Only renders chart content when it's visible in the viewport
 */
export const LazyChart: React.FC<LazyChartProps> = ({
  children,
  height = '400px',
  threshold = 0.1,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const observer = new window.IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasLoaded) {
            setIsVisible(true)
            setHasLoaded(true)
          }
        })
      },
      {
        threshold,
        rootMargin: '50px', // Start loading slightly before visible
      }
    )

    if (container) {
      observer.observe(container)
    }

    return () => {
      if (container) {
        observer.unobserve(container)
      }
    }
  }, [threshold, hasLoaded])

  return (
    <div ref={containerRef} style={{ minHeight: height }}>
      {isVisible ? (
        children
      ) : (
        <LoadingSkeleton variant="chart" height={height} />
      )}
    </div>
  )
}
