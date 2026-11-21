import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #2922 — the Action List intro re-wrapped when the web font swapped in and
   pushed the controls down 21px. `max-width: 60ch` is measured in the width
   of the current font's "0": 438.8px at 14px under the Arial fallback,
   417.5px once Source Sans 3 loads. The fallback's size-adjust matches the
   average letter width, not the "0", so no fallback metric can hold a ch
   measure. 60 x 0.497em (Source Sans 3's "0") keeps the loaded width in a
   unit that tracks font-size only. The live check is the font-swap test in
   e2e/district-subpages-cls.smoke.ts. */

const SOURCE_SANS_3_ZERO_EM = 0.497
const MEASURE_EM = 60 * SOURCE_SANS_3_ZERO_EM
const TOLERANCE_EM = 0.05

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/action-list.css'),
  'utf-8'
)

describe('action-list.css widths do not depend on the loaded font (#2922)', () => {
  it('uses no ch unit, which is the width of the current font’s "0"', () => {
    expect(css.match(/[\d.]+ch\b/g)).toBeNull()
  })

  it('keeps the intro at the 60ch measure of Source Sans 3, in em', () => {
    const rule = css.match(/\.action-list-page__subtitle\s*\{[^}]*\}/)?.[0]
    const em = Number(rule?.match(/max-width:\s*([\d.]+)em/)?.[1])
    expect(Math.abs(em - MEASURE_EM)).toBeLessThanOrEqual(TOLERANCE_EM)
  })
})
