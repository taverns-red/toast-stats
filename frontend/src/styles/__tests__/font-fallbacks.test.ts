import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1373 — metric-matched fallback faces for the Google-Fonts `display=swap`
   reflow.
 *
 * Measured on a deployed preview channel (cold cache, Fast-3G, layout-shift
 * observer installed pre-navigation), the swap was 95% of the 375px CLS —
 * 0.151 against a 0.1 budget. A two-state geometry diff (fonts blocked vs
 * fonts on, both fully loaded) named the mechanism: it is a WIDTH problem,
 * not a reserve problem. Source Sans 3 is ~6% narrower than the system-ui
 * fallback, so every rankings row that wrapped to two lines in the fallback
 * collapses to one when the font swaps in — 28px per row, ~560px of table.
 *
 * The fix is the one CLAUDE.md already names: a fallback face built on a
 * metrically-stable local font (Arial, aliased to Liberation Sans/Roboto
 * where Arial is absent) with `size-adjust` + ascent/descent overrides, so
 * the fallback and the web font occupy identical space and the swap reflows
 * nothing. `local()` sources download nothing, so this needs no new origin
 * and no CSP change.
 *
 * These assertions are load-bearing, in the Lesson 81 sense: dropping the
 * fallback from a stack, or letting a descriptor drift from the measured
 * value, silently restores a 0.15 mobile CLS. The live proof is
 * `frontend/e2e/landing-font-swap-cls.smoke.ts`, which measures the real
 * number on the deployed preview channel. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8')

const fallbacks = read('../tokens/font-fallbacks.css')
const typography = read('../tokens/typography.css')
const redesign = read('../tokens/redesign.css')
const indexCss = read('../../index.css')

/** Grab one `@font-face { ... }` block by its font-family descriptor. */
function face(css: string, family: string): string {
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
  const found = blocks.filter(b =>
    new RegExp(`font-family:\\s*['"]${family}['"]`).test(b)
  )
  expect(
    found.length,
    `expected exactly one @font-face for '${family}'`
  ).toBeGreaterThan(0)
  return found.join('\n')
}

/** Every declared value of `prop` inside a block, as numbers (percent). */
function pct(block: string, prop: string): number[] {
  return [...block.matchAll(new RegExp(`${prop}:\\s*([\\d.]+)%`, 'g'))].map(m =>
    Number(m[1])
  )
}

describe('metric-matched font fallbacks (#1373)', () => {
  it('index.css imports font-fallbacks.css', () => {
    expect(indexCss).toMatch(
      /@import\s+['"]\.\/styles\/tokens\/font-fallbacks\.css['"]/
    )
  })

  describe.each([
    // family, measured size-adjust range, ascent, descent
    ['Montserrat Fallback', [108, 116], 1.219],
    ['Source Sans 3 Fallback', [89, 96], 1.424],
  ] as const)('%s', (family, sizeAdjustRange, normalLineHeight) => {
    const block = face(fallbacks, family)

    it('sources only local fonts — no new origin, so no CSP change', () => {
      expect(block).toMatch(/src:\s*local\(/)
      expect(block).not.toMatch(/url\(/)
    })

    it('names Arial first and a Linux/Android-reachable alias after it', () => {
      // fontconfig aliases Arial -> Liberation Sans, and Android maps it to
      // Roboto; naming Liberation Sans explicitly covers hosts that do
      // neither. Without a resolvable local() the whole face is skipped and
      // the stack quietly falls through to system-ui again.
      expect(block).toMatch(/local\(['"]Arial/)
      expect(block).toMatch(/Liberation Sans/)
    })

    it('carries a measured size-adjust in the expected range', () => {
      const values = pct(block, 'size-adjust')
      expect(values.length).toBeGreaterThan(0)
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(sizeAdjustRange[0])
        expect(v).toBeLessThanOrEqual(sizeAdjustRange[1])
      }
    })

    it('overrides ascent, descent and line-gap so line boxes match', () => {
      expect(pct(block, 'ascent-override').length).toBeGreaterThan(0)
      expect(pct(block, 'descent-override').length).toBeGreaterThan(0)
      expect(block).toMatch(/line-gap-override:\s*0%/)
    })

    it('reconstructs the web font’s normal line height from its descriptors', () => {
      // ascent+descent are expressed relative to the size-adjusted em, so
      // (ascent + descent) * size-adjust must reproduce the measured
      // line-height:normal of the real font. This is the assertion that
      // catches a hand-edited descriptor.
      const s = pct(block, 'size-adjust')
      const a = pct(block, 'ascent-override')
      const d = pct(block, 'descent-override')
      for (let i = 0; i < s.length; i++) {
        const lh = ((a[i] + d[i]) * s[i]) / 10000
        expect(lh).toBeCloseTo(normalLineHeight, 2)
      }
    })

    it('declares a bold bucket that resolves to a real bold local face', () => {
      // A single 400-only face would make the browser synthesise bold, which
      // is both wider than the measured ratio and visibly wrong mid-swap.
      expect(block).toMatch(/font-weight:\s*[\d]+\s+[\d]+/)
      expect(block).toMatch(/local\(['"]Arial Bold/)
    })
  })

  it('inserts the fallback into the tm-* stacks ahead of system-ui', () => {
    expect(typography).toMatch(
      /--tm-font-headline:\s*"Montserrat",\s*"Montserrat Fallback",\s*system-ui/
    )
    expect(typography).toMatch(
      /--tm-font-body:\s*"Source Sans 3",\s*"Source Sans 3 Fallback",\s*system-ui/
    )
  })

  it('inserts the fallback into the redesign --serif / --sans stacks', () => {
    expect(redesign).toMatch(
      /--serif:\s*'Montserrat',\s*'Montserrat Fallback',\s*system-ui/
    )
    expect(redesign).toMatch(
      /--sans:\s*'Source Sans 3',\s*'Source Sans 3 Fallback',\s*system-ui/
    )
  })
})
