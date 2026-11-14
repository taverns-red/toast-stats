/**
 * The synthetic RegionRollups compat fixture is generated, not hand-edited
 * (#2562). Regenerating it must give the committed JSON, so the generator and
 * the file cannot drift: when buildRegionRollups changes its output, this
 * fails until the fixture is regenerated on purpose.
 *
 * Regenerate: npx tsx scripts/lib/__tests__/fixtures/gen-region-rollups-distinguished.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  FIXTURE_PATH,
  buildDistinguishedFixture,
} from './fixtures/gen-region-rollups-distinguished'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('recorded-region-rollups-distinguished.json (#2562)', () => {
  it('is what its generator produces', () => {
    const committed = JSON.parse(
      readFileSync(join(repoRoot, FIXTURE_PATH), 'utf-8')
    ) as unknown
    expect(JSON.parse(JSON.stringify(buildDistinguishedFixture()))).toEqual(
      committed
    )
  })
})
