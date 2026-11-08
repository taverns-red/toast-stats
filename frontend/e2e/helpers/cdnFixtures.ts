/* Run-scoped CDN fixtures for the PR Preview shards (#2545).
 *
 * Not implemented yet: the tests in src/__tests__/ci/cdnFixtures.test.ts and
 * e2e/cdn-fixtures.smoke.ts define the behaviour.
 */
import type { BrowserContext } from '@playwright/test'

export const CDN_STAGING_ORIGIN = 'https://cdn-staging.taverns.red'

export interface CdnFixtureTally {
  hits: string[]
  misses: string[]
  leaks: string[]
  recorded: string[]
}

export interface InstallOptions {
  dir?: string
  origin?: string
  recordFile?: string
}

export function fixturePath(
  _url: string,
  _origin: string = CDN_STAGING_ORIGIN
): string | null {
  throw new Error('not implemented')
}

export function describeFixtureProblems(
  _tally: CdnFixtureTally
): string | null {
  throw new Error('not implemented')
}

export async function installCdnFixtures(
  _context: BrowserContext,
  _options: InstallOptions
): Promise<CdnFixtureTally> {
  throw new Error('not implemented')
}
