/**
 * Red Vote block contrast (#2249, review B3). The block is the one surface in
 * Red Vote's own palette, so the app's dark-mode remaps do not cover it: this
 * resolves each role's colour through the brand tokens (rt-brand-v1.css) and
 * the block's own light / dark rules, and checks WCAG AA (≥ 4.5:1) with the
 * shipped calculator. Computed from source, like AwardsDarkModeContrast.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const tokensCss = strip(
  readFileSync(resolve(stylesDir, 'tokens/rt-brand-v1.css'), 'utf8')
)
const blockCss = strip(
  readFileSync(resolve(stylesDir, 'components/red-vote-block.css'), 'utf8')
)

const tokens = new Map<string, string>()
for (const m of tokensCss.matchAll(/(--rt-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  tokens.set(m[1]!, m[2]!.toLowerCase())
}

/** The value of `prop` in the FIRST block whose selector matches `selector`
    exactly (as written), resolved through the brand tokens. */
function colour(selector: string, prop: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`)
  const m = re.exec(blockCss)
  if (!m) throw new Error(`rule not found: ${selector}`)
  const decl = new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`).exec(m[1]!)
  if (!decl) throw new Error(`${prop} not declared in ${selector}`)
  const raw = decl[1]!.trim()
  const v = /var\((--rt-[\w-]+)\)/.exec(raw)
  const hex = v ? tokens.get(v[1]!) : raw.toLowerCase()
  if (!hex) throw new Error(`unresolved colour ${raw} in ${selector}`)
  return hex
}

const ratio = (fg: string, bg: string) => calculateContrastRatio(fg, bg)

describe('Red Vote block — WCAG AA contrast from the brand tokens (#2249 B3)', () => {
  it('light: fine print and eyebrow (the disclaimer line) clear 4.5:1 on paper', () => {
    const paper = colour('.red-vote-block', 'background-color')
    expect(
      ratio(colour('.red-vote-block__fine', 'color'), paper)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(colour('.red-vote-block__eyebrow', 'color'), paper)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(colour('.red-vote-block__body', 'color'), paper)
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('light: the CTA at rest and on hover clears 4.5:1', () => {
    expect(
      ratio(
        colour('.red-vote-block__cta', 'color'),
        colour('.red-vote-block__cta', 'background-color')
      )
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(
        colour('.red-vote-block__cta:hover', 'color'),
        colour('.red-vote-block__cta:hover', 'background-color')
      )
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('dark: the CTA at rest and on hover clears 4.5:1', () => {
    expect(
      ratio(
        colour("[data-theme='dark'] .red-vote-block__cta", 'color'),
        colour("[data-theme='dark'] .red-vote-block__cta", 'background-color')
      )
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      ratio(
        colour("[data-theme='dark'] .red-vote-block__cta:hover", 'color'),
        colour(
          "[data-theme='dark'] .red-vote-block__cta:hover",
          'background-color'
        )
      )
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('dark: fine print, eyebrow and body clear 4.5:1 on the dark surface', () => {
    const bg = colour("[data-theme='dark'] .red-vote-block", 'background-color')
    for (const sel of [
      "[data-theme='dark'] .red-vote-block__eyebrow,\n  [data-theme='dark'] .red-vote-block__fine",
      "[data-theme='dark'] .red-vote-block__body",
    ]) {
      expect(ratio(colour(sel, 'color'), bg), sel).toBeGreaterThanOrEqual(4.5)
    }
  })
})
