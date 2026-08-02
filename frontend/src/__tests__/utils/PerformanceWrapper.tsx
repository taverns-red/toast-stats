import React, { useEffect } from 'react'
import { testPerformanceMonitor } from './performanceMonitor'

// Performance monitoring wrapper component
export const PerformanceWrapper = ({
  children,
  testName,
  enableMonitoring,
}: {
  children: React.ReactNode
  testName?: string
  enableMonitoring?: boolean
}) => {
  useEffect(() => {
    if (enableMonitoring && testName) {
      testPerformanceMonitor.startMonitoring(testName)

      return () => {
        try {
          testPerformanceMonitor.stopMonitoring(testName)
        } catch (error) {
          // Silently handle missing monitoring sessions
          console.debug(
            `Performance monitoring cleanup warning for ${testName}:`,
            error
          )
        }
      }
    }
    // Explicit: an effect callback must return a cleanup or nothing on every
    // path (noImplicitReturns) (#1368).
    return undefined
  }, [testName, enableMonitoring])

  return <>{children}</>
}
