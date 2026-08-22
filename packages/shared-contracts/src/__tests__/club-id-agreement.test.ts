/**
 * Club-id agreement guard (#1440) — the durable half of the fix.
 *
 * The bug was never one bad comparison: it was EIGHT independent sites that
 * each decided, privately, what "the same club" means (raw / bare / 8-char
 * padded), where every disagreement degrades to an empty state rather than an
 * error. Fixing the seven files without pinning them together just resets the
 * clock until a ninth site is added.
 *
 * This test is the pin. It reads the real source of every site in the #1440
 * table and fails if any of them:
 *   - stops routing club identity through `@taverns-red/shared-contracts`, or
 *   - reintroduces a bare `===` on a club id, a raw `clubs[clubId]` key
 *     lookup, or a local `padStart(8, '0')` / `replace(/^0+/, '')`
 *     re-implementation of the normalizer.
 *
 * It is a source-text guard on purpose (same shape as the mcp-server's
 * `no-analytics-core-dependency` and analytics-core's `no-stdout-leak`
 * guards): the per-site BEHAVIOURAL tests live next to each site, but only a
 * cross-package scan can assert that no site has quietly opted out.
 *
 * Adding a ninth site? Add it to SITES. That is the point.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// __tests__ → src → shared-contracts → packages → repo root
const repoRoot = join(here, '..', '..', '..', '..')

interface Site {
  /** Repo-relative path of the file that decides club identity. */
  file: string
  /** What the site does with a club id, for the failure message. */
  what: string
  /**
   * Set when another in-flight issue owns the file and this sprint must not
   * edit it. A deferred site is still REGISTERED here (so it cannot be
   * forgotten), but its conformance is not asserted yet. Clear the field —
   * and the site joins the guard — when the owning issue lands.
   */
  deferredTo?: string
}

const SITES: Site[] = [
  {
    file: 'packages/analytics-core/src/transformation/DataTransformer.ts',
    what: 'canonicalizes clubId at write time and joins clubPerf↔districtPerf',
  },
  {
    file: 'packages/collector-cli/src/services/FindAClubMerger.ts',
    what: 'joins the FAC registry onto clubPerformance and clubs[]',
  },
  {
    file: 'packages/analytics-core/src/analytics/diffSnapshots.ts',
    what: 'keys both snapshots for the What Changed diff',
  },
  {
    file: 'packages/mcp-server/src/cdn/CdnClient.ts',
    what: 'resolves a club id to its district via config/club-index.json',
  },
  {
    file: 'frontend/src/pages/ClubDetailPage.tsx',
    what: 'matches the URL club id against analytics and raw clubPerformance',
  },
  {
    file: 'frontend/src/pages/ClubRedirectPage.tsx',
    what: 'resolves the district-free /club/:clubId URL via the club index',
  },
  {
    file: 'frontend/src/hooks/useClubHistory.ts',
    what: 'matches the URL club id against each year-end snapshot',
    // #1437 is rewriting this file in a concurrent sprint. Editing it here
    // would collide; it adopts the shared helper on rebase.
    deferredTo: '#1437',
  },
]

/** Strip // line comments and block comments so prose can't trip the scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Identity decisions that must never be made locally again. */
const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  {
    re: /\bclubId\s*(?:===|!==)/,
    why: 'bare strict comparison on a club id — use clubIdsMatch()',
  },
  {
    re: /(?:===|!==)\s*clubId\b/,
    why: 'bare strict comparison on a club id — use clubIdsMatch()',
  },
  {
    re: /\bclubs\s*\[\s*clubId\s*\]/,
    why: 'raw-keyed club-index lookup — use findClubEntry()',
  },
  {
    re: /padStart\(\s*8\s*,/,
    why: 'local 8-char padding — the third convention; use normalizeClubId()',
  },
  {
    re: /replace\(\s*\/\^0\+\//,
    why: 'local leading-zero strip — use normalizeClubId()',
  },
  {
    re: /(?:function|const|let|private|public)\s+normali[sz]eClub/,
    why: 'a second definition of the normalizer — import the shared one',
  },
  {
    re: /this\.normali[sz]eClub/,
    why: 'a private normalizer method — import the shared one',
  },
]

const HELPER_USE =
  /\b(?:normalizeClubId|clubIdsMatch|findClubEntry|normalizeClubIdKey)\s*\(/

const active = SITES.filter(s => !s.deferredTo)
const deferred = SITES.filter(s => s.deferredTo)

describe('club-id agreement (#1440)', () => {
  it('registers every site from the #1440 table', () => {
    // Eight rows in the issue table, seven distinct files (ClubDetailPage
    // contributes two rows: the analytics match and the raw-record match).
    expect(SITES).toHaveLength(7)
  })

  describe.each(active)('$file', site => {
    const src = stripComments(readFileSync(join(repoRoot, site.file), 'utf8'))

    it(`routes club identity through shared-contracts (${site.what})`, () => {
      expect(
        /@taverns-red\/shared-contracts/.test(src),
        `${site.file} must import the canonical club-id helper from @taverns-red/shared-contracts`
      ).toBe(true)
      expect(
        HELPER_USE.test(src),
        `${site.file} must CALL the shared helper (normalizeClubId / clubIdsMatch / findClubEntry)`
      ).toBe(true)
    })

    it.each(FORBIDDEN)('does not reintroduce: $why', ({ re, why }) => {
      const hit = re.exec(src)
      expect(
        hit,
        `${site.file} reintroduced a private club-id convention (${why}): ${hit?.[0] ?? ''}`
      ).toBeNull()
    })
  })

  // Deferred sites are registered, not asserted. They are listed here so the
  // handoff is visible in the test output rather than living only in a PR body.
  it.each(deferred)(
    '$file — club-id conformance deferred to $deferredTo (registered, not yet asserted)',
    site => {
      expect(site.deferredTo).toBeTruthy()
      // The file must still exist; a rename must come back through this table.
      expect(() =>
        readFileSync(join(repoRoot, site.file), 'utf8')
      ).not.toThrow()
    }
  )
})
