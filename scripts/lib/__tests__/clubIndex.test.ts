/**
 * Unit tests for scripts/lib/clubIndex.ts (#1469)
 *
 * config/club-index.json resolves a club id to its district, so a club that
 * moved districts in the 2026 reformation still resolves from its old-district
 * URL (#1441/#1445) instead of rendering "Club Not Found".
 *
 * This lib exists because the generator used to be inline `node -e` inside
 * .github/workflows/data-pipeline.yml, where it could not be tested. It shipped
 * an index covering 2 of 94 districts (345 clubs of ~14,355) for an unknown
 * period: `gsutil cp -I` silently consumed only the first two of its stdin
 * source URLs and exited 0, and the step discarded both stderr and the exit
 * code. Nothing failed; the index was simply wrong.
 *
 * Fixtures are TRIMMED CAPTURES of live snapshots (2026-08-30), not synthetic
 * shapes (Lesson 154): district_02 (a legacy district), district_61, and
 * district_201 (a renumbered post-reformation district).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildClubIndex, type ClubIndex } from '../clubIndex'
import { syncCoverageError } from '../syncCoverage'

const FIXTURES = join(__dirname, 'fixtures', 'club-index')

const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'))

const AT = '2026-08-31T00:00:00.000Z'
const DATE = '2026-08-30'

describe('buildClubIndex', () => {
  it('indexes every district it is given, not just the first', () => {
    const files = [
      loadFixture('district_02.json'),
      loadFixture('district_61.json'),
      loadFixture('district_201.json'),
    ]
    const index: ClubIndex = buildClubIndex(files, DATE, AT)

    const districts = new Set(Object.values(index.clubs).map(c => c.districtId))
    expect([...districts].sort()).toEqual(['02', '201', '61'])
    expect(index.totalClubs).toBe(9)
  })

  it('keys clubs on the canonical (unpadded) club id', () => {
    const index = buildClubIndex([loadFixture('district_61.json')], DATE, AT)
    // Live ids in this fixture are already canonical; the index must not
    // reintroduce padding or mix key forms.
    expect(Object.keys(index.clubs)).toEqual(
      expect.arrayContaining(['3045', '9560', '1849755'])
    )
    for (const key of Object.keys(index.clubs)) {
      expect(key).toBe(String(Number(key)))
    }
  })

  it('carries the snapshot date and generation timestamp through', () => {
    const index = buildClubIndex([loadFixture('district_02.json')], DATE, AT)
    expect(index.snapshotDate).toBe(DATE)
    expect(index.generatedAt).toBe(AT)
  })

  it('skips a payload with no usable districtId rather than indexing a phantom', () => {
    const index = buildClubIndex(
      [{ data: null, districtId: '99' }, loadFixture('district_02.json')],
      DATE,
      AT
    )
    const districts = new Set(Object.values(index.clubs).map(c => c.districtId))
    expect([...districts]).toEqual(['02'])
  })

  it('is permutation-invariant so successive daily uploads diff cleanly', () => {
    const a = [loadFixture('district_02.json'), loadFixture('district_61.json')]
    const b = [...a].reverse()
    expect(JSON.stringify(buildClubIndex(a, DATE, AT))).toBe(
      JSON.stringify(buildClubIndex(b, DATE, AT))
    )
  })
})

describe('syncCoverageError', () => {
  // The actual #1469 defect: the sync silently delivered 2 of 94 files and
  // the step reported success. The builder cannot detect this on its own —
  // 2 files is a perfectly valid input — so the count must be checked
  // against what the listing found.
  it('reports an error when fewer files were synced than were listed', () => {
    expect(syncCoverageError(94, 2)).toMatch(/2 of 94/)
  })

  it('names the likely cause so the next reader does not re-derive it', () => {
    expect(syncCoverageError(94, 2)).toMatch(/sync/i)
  })

  it('accepts a complete sync', () => {
    expect(syncCoverageError(94, 94)).toBeNull()
  })

  it('accepts more parsed than listed rather than failing on a benign race', () => {
    expect(syncCoverageError(94, 95)).toBeNull()
  })

  it('treats an empty listing as nothing to check', () => {
    expect(syncCoverageError(0, 0)).toBeNull()
  })

  it('rejects a total sync failure loudly', () => {
    expect(syncCoverageError(94, 0)).toMatch(/0 of 94/)
  })
})
