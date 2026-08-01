/**
 * Recognition badge contrast (#1361 AC: "≥4.5:1 for badge text in both
 * themes. Do not reintroduce the `#c9b748`-on-white failure tracked in
 * #1360").
 *
 * The design decision this test pins down: the badge's TEXT is themed ink on a
 * themed surface (`--ink-2` on `--surface-2`), and the per-item accent is
 * carried by the GLYPH only. That is what makes the AC satisfiable for all
 * seven items at once — an accent-coloured *label* would have to clear 4.5:1
 * in both themes for seven different hues, which is exactly the trap #1360
 * documents. The glyph is decorative (the visible short label and the badge's
 * accessible name both carry the meaning), so WCAG 1.4.11 does not gate it,
 * but the accents are still checked against the 3:1 non-text floor in the
 * theme where each is actually used.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const tokensCss = stripComments(
  readFileSync(resolve(stylesDir, 'tokens/redesign.css'), 'utf8')
)
const brandCss = stripComments(
  readFileSync(resolve(stylesDir, 'tokens/rt-brand-v1.css'), 'utf8')
)

function parseBlock(css: string, selector: string): Map<string, string> {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`block ${selector} not found`)
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  const map = new Map<string, string>()
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1].trim(), d[2].trim())
  }
  return map
}

const brand = parseBlock(brandCss, ':root')
const light = parseBlock(tokensCss, ':root')
const dark = parseBlock(tokensCss, "[data-theme='dark']")

/** Resolve `var(--x)` chains against a theme map, falling back to light/brand. */
function resolve_(
  value: string,
  theme: Map<string, string>,
  depth = 0
): string {
  if (depth > 8) throw new Error(`var() chain too deep: ${value}`)
  const v = value.trim()
  const m = /^var\((--[\w-]+)\)$/.exec(v)
  if (!m) return v
  const next = theme.get(m[1]) ?? light.get(m[1]) ?? brand.get(m[1])
  if (!next) throw new Error(`unresolved token ${m[1]}`)
  return resolve_(next, theme, depth + 1)
}

const ACCENTS = [
  '--recognition-extension',
  '--recognition-twenty-plus',
  '--recognition-retention',
  '--recognition-distinguished',
  '--recognition-select',
  '--recognition-presidents',
  '--recognition-smedley',
]

describe('recognition badge contrast (#1361)', () => {
  for (const [themeName, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`clears AA for badge text in the ${themeName} theme`, () => {
      const ink = resolve_('var(--ink-2)', theme)
      const surface = resolve_('var(--surface-2)', theme)
      const ratio = calculateContrastRatio(ink, surface)
      expect(
        ratio,
        `${ink} on ${surface} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5)
    })

    it(`defines all seven accents in the ${themeName} theme`, () => {
      for (const accent of ACCENTS) {
        expect(theme.has(accent), `${accent} missing from ${themeName}`).toBe(
          true
        )
      }
    })

    it(`keeps every accent glyph above the 3:1 non-text floor in ${themeName}`, () => {
      const surface = resolve_('var(--surface-2)', theme)
      for (const accent of ACCENTS) {
        const hex = resolve_(`var(${accent})`, theme)
        const ratio = calculateContrastRatio(hex, surface)
        expect(
          ratio,
          `${accent} (${hex}) on ${surface} = ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('keeps the seven accents visually distinct in each theme', () => {
    for (const theme of [light, dark]) {
      const values = ACCENTS.map(a =>
        resolve_(`var(${a})`, theme).toLowerCase()
      )
      expect(new Set(values).size).toBe(ACCENTS.length)
    }
  })

  it('does not reintroduce the #c9b748-on-white failure (#1360)', () => {
    for (const theme of [light, dark]) {
      for (const accent of ACCENTS) {
        expect(resolve_(`var(${accent})`, theme).toLowerCase()).not.toBe(
          '#c9b748'
        )
      }
    }
  })
})
