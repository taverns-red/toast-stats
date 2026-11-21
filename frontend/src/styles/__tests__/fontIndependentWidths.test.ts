import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* A `ch` width is the width of the current font's "0". While Montserrat /
   Source Sans 3 download, the metric-matched Arial fallback is in force, and
   its size-adjust matches the average letter width, not the "0": at 14px,
   60ch is 438.8px under the fallback and 417.5px once Source Sans 3 loads.
   Text measured in ch narrows at the swap, re-wraps, and moves everything
   below it (council notes h105 -> h126, #2685; Action List intro h63 -> h84,
   #2922). A measure stated in em tracks font-size only, so these files keep
   Source Sans 3's ch measure as N x 0.497em (its "0" is 497/1000). The live
   check for the Action List is the font-swap test in
   e2e/district-subpages-cls.smoke.ts. */

const SOURCE_SANS_3_ZERO_EM = 0.497
const TOLERANCE_EM = 0.05

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (file: string) =>
  readFileSync(resolve(__dirname, '../components', file), 'utf-8')

const MEASURES = [
  { file: 'council.css', selector: '.council-note', chars: 70 },
  {
    file: 'action-list.css',
    selector: '.action-list-page__subtitle',
    chars: 60,
  },
] as const

describe.each(MEASURES)(
  '$file widths do not depend on the loaded font',
  ({ file, selector, chars }) => {
    const css = read(file)

    it('uses no ch unit, which is the width of the current font’s "0"', () => {
      expect(css.match(/[\d.]+ch\b/g)).toBeNull()
    })

    it(`keeps ${selector} at the ${chars}-character measure of Source Sans 3, in em`, () => {
      const start = css.indexOf(`${selector} {`)
      expect(start, `no ${selector} rule`).toBeGreaterThanOrEqual(0)
      const rule = css.slice(start, css.indexOf('}', start))
      const em = Number(rule.match(/max-width:\s*([\d.]+)em/)?.[1])
      expect(Math.abs(em - chars * SOURCE_SANS_3_ZERO_EM)).toBeLessThanOrEqual(
        TOLERANCE_EM
      )
    })
  }
)
