/**
 * Utilities Index
 *
 * Exports all utility modules for the Collector CLI package.
 *
 * Requirements:
 * - 5.1: THE Collector_CLI SHALL operate without requiring the backend to be running
 * - 6.1: Retry with exponential backoff
 * - 6.2: Circuit breaker status reporting
 */

export { logger } from './logger.js'
export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
} from './CircuitBreaker.js'
export {
  RetryManager,
  type RetryOptions,
  type RetryResult,
} from './RetryManager.js'
export {
  ClosingPeriodDetector,
  type ClosingPeriodInfo,
} from './ClosingPeriodDetector.js'
export {
  resolveClosingWindow,
  ClosingPeriodUndecidedError,
  type ClosingWindowVerdict,
} from './closingWindowResolver.js'
export {
  isValidDistrictSummaryCsv,
  parseDistrictIdsFromSummaryCsv,
  resolveActiveProgramYear,
  type ProgramYearResolution,
} from './programYearResolver.js'
