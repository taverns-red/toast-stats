import { useState, useEffect } from 'react'

/**
 * Hook to compute responsive tick interval for Recharts XAxis.
 * On mobile viewports, shows fewer labels to prevent overlap.
 *
 * @param dataPointCount - Number of data points in the chart
 * @returns The XAxis `interval` prop value
 */
export function useResponsiveTickInterval(
  dataPointCount: number
): number | 'preserveStartEnd' {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (dataPointCount <= 4) return 'preserveStartEnd' // Always show all labels for small datasets

  if (width < 480) {
    // Phone: show every 3rd or 4th label
    return Math.max(Math.ceil(dataPointCount / 4) - 1, 2)
  }
  if (width < 768) {
    // Tablet: show every 2nd or 3rd label
    return Math.max(Math.ceil(dataPointCount / 6) - 1, 1)
  }
  return 'preserveStartEnd' // Desktop: Recharts auto-manages
}
