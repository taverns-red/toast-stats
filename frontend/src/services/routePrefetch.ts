import type { QueryClient } from '@tanstack/react-query'

/**
 * Start a route's first-paint data reads from the entry (#1901 option A).
 * Stub — implementation follows the red tests.
 */
export function prefetchRouteData(
  _client: QueryClient,
  _location: { pathname: string; search: string }
): void {}
