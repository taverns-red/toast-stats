import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  REPORTS_ROLLUPS_FILE_NAME,
  REPORTS_ROLLUPS_FORMAT,
  ReportsRollupsSchema,
  type ReportsRollups,
} from '../index.js'

/**
 * #2012 — `snapshots/{date}/reports-rollups.json`, the reports-derived
 * region and world rollups (prospective by stage, coached, dues renewal,
 * officer lists, sponsors/mentors).
 *
 * The fixture is the builder's own output over the recorded prod D61 sidecar
 * (`scripts/lib/__tests__/fixtures/reports-rollups/`, 2026-10-15, names
 * blanked), not a hand-written shape. Regenerate with
 * UPDATE_REPORTS_ROLLUPS_SAMPLE=1 (scripts/lib/__tests__/reportsRollupsPipeline.test.ts).
 */
const RECORDED = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/recorded-reports-rollups.json', import.meta.url),
    'utf-8'
  )
) as ReportsRollups

/** Written before #2388: no `byStepsComplete`. Past dates keep this shape. */
const LEGACY = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/recorded-reports-rollups-v1.0.0.json',
      import.meta.url
    ),
    'utf-8'
  )
) as ReportsRollups

describe('ReportsRollupsSchema (#2012)', () => {
  it('still parses a v1.0.0 artifact without steps-complete counts (#2388)', () => {
    expect(LEGACY._format.version).toBe('1.0.0')
    expect(LEGACY.world.prospective).not.toHaveProperty('byStepsComplete')
    expect(ReportsRollupsSchema.parse(LEGACY)).toEqual(LEGACY)
  })

  it('carries prospective clubs by steps complete (#2388)', () => {
    expect(RECORDED._format.version).toBe('1.1.0')
    expect(RECORDED.world.prospective?.byStepsComplete).toEqual([
      { stepsComplete: 1, clubs: 6 },
    ])
  })

  it('rejects a steps-complete count above the six steps', () => {
    const bad = structuredClone(RECORDED)
    bad.world.prospective!.byStepsComplete = [{ stepsComplete: 7, clubs: 1 }]
    expect(ReportsRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('parses the recorded artifact unchanged', () => {
    expect(ReportsRollupsSchema.parse(RECORDED)).toEqual(RECORDED)
    expect(RECORDED._format).toEqual(REPORTS_ROLLUPS_FORMAT)
    expect(REPORTS_ROLLUPS_FILE_NAME).toBe('reports-rollups.json')
  })

  it('keeps "not available" (null) apart from a measured 0', () => {
    const missing = structuredClone(RECORDED)
    missing.world.coached = null
    expect(ReportsRollupsSchema.safeParse(missing).success).toBe(true)
    expect(RECORDED.world.octoberDues?.other).toBe(0)
  })

  it('rejects a negative count', () => {
    const bad = structuredClone(RECORDED)
    bad.world.officerList!.submitted = -1
    expect(ReportsRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an extra field: counts only, never a club or person name', () => {
    const bad = structuredClone(RECORDED) as unknown as {
      districts: Record<string, { sponsorsMentors: Record<string, unknown> }>
    }
    bad.districts['61']!.sponsorsMentors.names = ['A Person']
    expect(ReportsRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown reports status', () => {
    const bad = structuredClone(RECORDED) as unknown as {
      districts: Record<string, { reports: string }>
    }
    bad.districts['61']!.reports = 'zero'
    expect(ReportsRollupsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a program year that is not YYYY-YYYY', () => {
    const bad = structuredClone(RECORDED)
    bad.programYear = '2026-27'
    expect(ReportsRollupsSchema.safeParse(bad).success).toBe(false)
  })
})
