/**
 * Test-only mint for the `SnapshotDate` brand (#1368).
 *
 * Fixtures need branded dates constantly, and `as SnapshotDate` is banned
 * repo-wide (`no-restricted-syntax`, proved by
 * `src/__tests__/lint/no-snapshot-date-cast.test.ts`) — the cast is the exact
 * five characters that re-admit the #1315 blank-UI class. This wraps the real
 * mint rather than bypassing it, so a fixture date that is not a real calendar
 * date fails loudly at construction instead of laundering through.
 *
 * Production code must NOT use this: outside a test, provenance has to come
 * from the CDN dates index or manifest (`snapshotDatesFrom` /
 * `snapshotDateFromManifest`), not from a literal.
 */

import { toSnapshotDate, type SnapshotDate } from '../types/snapshotDate'

/**
 * Mint a `SnapshotDate` for a fixture.
 *
 * @throws if `raw` is not a real `YYYY-MM-DD` calendar date.
 */
export function snap(raw: string): SnapshotDate {
  const minted = toSnapshotDate(raw)
  if (!minted) {
    throw new Error(
      `snap(): "${raw}" is not a real YYYY-MM-DD calendar date, so it cannot name a snapshot.`
    )
  }
  return minted
}
