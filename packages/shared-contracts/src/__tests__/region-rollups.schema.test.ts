import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  REGION_ROLLUPS_FILE_NAME,
  REGION_ROLLUPS_FORMAT,
  RegionRollupsSchema,
  type RegionRollups,
} from '../index.js'

/**
 * #1799 (epic #1781) — `snapshots/{date}/region-rollups.json`, the region
 * and world rollups of the district figures (health, club status,
 * distinguished, compliance, growth).
 *
 * The fixture is the builder's own output over recorded staging inputs
 * (`packages/analytics-core/src/rollup/__tests__/fixtures/region-rollups/`,
 * the 2025-26 June close), not a hand-written shape.
 */
const RECORDED = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/recorded-region-rollups.json', import.meta.url),
    'utf-8'
  )
) as RegionRollups

describe('RegionRollupsSchema (#1799)', () => {
  it('parses the recorded artifact unchanged', () => {
    expect(RegionRollupsSchema.parse(RECORDED)).toEqual(RECORDED)
    expect(RECORDED._format).toEqual(REGION_ROLLUPS_FORMAT)
    expect(REGION_ROLLUPS_FILE_NAME).toBe('region-rollups.json')
  })

  it('keeps "not available" (null) apart from a measured 0', () => {
    // Prospective clubs were not collected at the 2026 June close.
    expect(RECORDED.world.growth.prospective).toBeNull()
    expect(RECORDED.districts['111']!.growth.suspended).toBe(0)
  })

  it('rejects a negative count', () => {
    const bad = structuredClone(RECORDED)
    bad.world.clubs = -1
    expect(RegionRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a program year that is not YYYY-YYYY', () => {
    const bad = structuredClone(RECORDED)
    bad.programYear = '2025-26'
    expect(RegionRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an extra field: counts only, never club or person data', () => {
    const bad = structuredClone(RECORDED) as unknown as {
      districts: Record<string, Record<string, unknown>>
    }
    bad.districts['111']!.clubNames = ['A club']
    expect(RegionRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a region block with no districts', () => {
    const bad = structuredClone(RECORDED)
    bad.regions!['07']!.districtIds = []
    expect(RegionRollupsSchema.safeParse(bad).success).toBe(false)
  })
})
