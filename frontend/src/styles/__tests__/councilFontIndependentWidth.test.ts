import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #2685 — /district/61/council retried in the throttled CLS smoke at 1280px
   (0.13632 against a 0.1 budget, on #2672 and #2684).

   Mechanism, reproduced in the Playwright Linux image with the fonts held
   until the headline had painted: `max-width: 70ch` is measured in the width
   of the element's own "0" glyph. While Montserrat / Source Sans 3 download,
   the metric-matched Arial fallback is in force and 70ch is 560px; when the
   web font lands it is 490px. The notes narrow by 70px, the disclaimer wraps
   to one more line (h105 -> h126) and the export button and both club lists
   drop 21px. Whether the swap lands before or after the headline paints is a
   race, hence a failure that passes on retry.

   A measure that must not move with the font is stated in em, which tracks
   font-size only. 70 x 0.497em (Source Sans 3's "0", 497/1000) is the 70ch
   measure of the loaded font: 487px at the 14px these notes use, against the
   490px (hinted to 7px a digit) it rendered before. */

const SOURCE_SANS_3_ZERO_EM = 0.497
const MEASURE_EM = 70 * SOURCE_SANS_3_ZERO_EM
const TOLERANCE_EM = 0.05

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const css = readFileSync(
  resolve(__dirname, '../components/council.css'),
  'utf-8'
)

describe('council.css widths do not depend on the loaded font (#2685)', () => {
  it('uses no ch unit, which is the width of the current font’s "0"', () => {
    expect(css.match(/[\d.]+ch\b/g)).toBeNull()
  })

  it('keeps the 70ch measure of Source Sans 3 as an em width', () => {
    const measures = [...css.matchAll(/max-width:\s*([\d.]+)em/g)].map(m =>
      Number(m[1])
    )
    expect(measures).toHaveLength(2)
    for (const em of measures) {
      expect(Math.abs(em - MEASURE_EM)).toBeLessThanOrEqual(TOLERANCE_EM)
    }
  })
})
