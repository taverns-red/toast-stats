/**
 * Membership retention badge wiring guard (#1614).
 *
 * The trophy case renders the badge only if DistrictDetailPage passes one.
 * The page must build it from the competitive-awards file it already reads
 * for the displayed date, through `membershipRetentionBadgeFor`, so the
 * status, finite-number and tie rules live in one place.
 *
 * A source guard rather than a page mount (R22), the same pattern as
 * `trophyCaseProgramYear.guard.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const caller = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)

describe('membership retention badge wiring (#1614)', () => {
  it('builds the badge from the page competitive-awards read', () => {
    expect(caller).toMatch(
      /membershipRetentionBadgeFor\(\s*competitiveAwards,\s*districtId,\s*retentionYearClosed\s*\)/
    )
  })

  it("treats a past year's last snapshot as final (#3075)", () => {
    expect(caller).toMatch(
      /\bconst\s+retentionYearClosed\s*=(?!=)\s*isPastProgramYearClose\(/
    )
  })

  it('judges the year against the site-wide newest year (#3075)', () => {
    // A district's own index can end early (a retired district, or a lag in
    // July), so it must not decide whether the year has ended.
    expect(caller).toMatch(
      /isPastProgramYearClose\(\s*effectiveEndDate\s*\?\?\s*undefined,\s*cachedDatesInProgramYear,\s*newestProgramYearWithData\s*\)/
    )
    expect(caller).toMatch(
      /\bconst\s+newestProgramYearWithData\s*=(?!=)\s*useNewestProgramYearWithData\(\s*\)/
    )
  })

  it('passes it to the trophy case', () => {
    expect(caller).toMatch(/membershipRetention=\{membershipRetentionBadge\}/)
  })
})
