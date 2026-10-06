/**
 * District overview slot-reservation wiring guard (#1647).
 *
 * The CLS fix for `/district/:id` lives partly in the components' structural
 * skeletons and partly in how the page hands them their pending states. The
 * page half is a call-site shape that no component test can see, and every
 * part of it was missing when the overview measured CLS 0.25–0.69:
 *
 *  1. The header toolbar gains the freshness pill only once the date index
 *     lands; at 412px that rewrapped it from one row to three. The page must
 *     tell the header the date is pending so it reserves the pill's slot.
 *  2. The Overview panel mounted only once the dates had resolved
 *     (`hasValidDates && effectiveProgramYear`), inserting a 208–468px panel
 *     above everything else. While the dates are pending its skeleton must
 *     hold the slot.
 *  3. The KPI strip and the Overview stack were gated on `hasOverviewData`,
 *     so on a slow analytics read they inserted from 0px. They must render
 *     (as skeletons) while the overview is loading too.
 *
 * Source guard, not a page mount (R22) — same pattern as
 * `clubGrowthCardWiring.guard.test.ts`. The live CLS budget itself is
 * enforced on the preview by `e2e/district-overview-cls.smoke.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const page = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)

describe('district overview slot reservation wiring (#1647)', () => {
  it('tells the header the snapshot date is pending', () => {
    const header = page.match(/<DistrictDetailHeader[\s\S]*?\/>/)?.[0] ?? ''
    expect(header).toMatch(/freshnessPending=\{/)
  })

  it('holds the Overview slot with its skeleton while the dates resolve', () => {
    expect(page).toMatch(/<DistrictOverviewSkeleton/)
  })

  it('renders the KPI strip and Overview stack while the overview loads', () => {
    expect(page).toMatch(
      /districtId\s*&&\s*\(hasOverviewData\s*\|\|\s*isLoadingOverview\)\s*&&\s*\(\s*<DistrictKpiStrip/
    )
    expect(page).toMatch(
      /districtId\s*&&\s*\(hasOverviewData\s*\|\|\s*isLoadingOverview\)\s*&&\s*\(\s*<section aria-label="District overview">/
    )
  })
})
