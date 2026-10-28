/**
 * Success Plan entry placement guard (#2297).
 *
 * The collapsed disclosure panel adds 62px to the page. At 375px that broke
 * the hub's 4,000px page budget (`e2e/district-overview-hub-mobile.smoke.ts`,
 * run 40785204087). On the hub layout the page must therefore hand the panel
 * to the hub, whose button sits in an existing row, and render the
 * disclosure only on the strip layout.
 *
 * Source guard, not a page mount (R22), in the same style as
 * `districtOverviewReserve.guard.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const page = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)

describe('Success Plan entry placement (#2297)', () => {
  it('renders the disclosure panel only off the hub layout', () => {
    expect(page).toMatch(/!isHubLayout\s*&&[\s\S]{0,80}planPanel/)
  })

  it('hands the hub its in-row entry instead', () => {
    const hub = page.match(/<DistrictOverviewHub[\s\S]*?\/>/)?.[0] ?? ''
    expect(hub).toMatch(/planTargetsPanel=\{/)
  })
})
