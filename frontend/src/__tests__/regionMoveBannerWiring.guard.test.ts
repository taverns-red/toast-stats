/**
 * The moved-region banner (#1821) reads the district page's OWN program
 * year (R3) — the one its controls name — not a year re-derived from the
 * history or the rankings response.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const page = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)

describe('DistrictRegionMoveBanner wiring (#1821)', () => {
  it("passes the page's program year and the shared history", () => {
    const banner = /<DistrictRegionMoveBanner[\s\S]*?\/>/.exec(page)?.[0]
    expect(banner).toBeDefined()
    expect(banner).toMatch(
      /programYear=\{\(effectiveProgramYear \?\? selectedProgramYear\)\.label\}/
    )
    expect(banner).toMatch(/history=\{regionHistory\}/)
    expect(page).toMatch(/useDistrictRegionHistory\(\)/)
  })

  it('mounts below the District overview section, never above it (#1821 CLS)', () => {
    /* The banner mounts late, after the history file lands. Above the
       overview it pushed the whole stack down (CLS 0.22-0.25 at 412px);
       below the overview section it shifts nothing in view. */
    const bannerAt = page.indexOf('<DistrictRegionMoveBanner')
    const overviewOpen = page.indexOf(
      '<section aria-label="District overview">'
    )
    const overviewClose = page.indexOf('</section>', overviewOpen)
    expect(overviewOpen).toBeGreaterThan(-1)
    expect(overviewClose).toBeGreaterThan(overviewOpen)
    expect(bannerAt).toBeGreaterThan(overviewClose)
  })
})
