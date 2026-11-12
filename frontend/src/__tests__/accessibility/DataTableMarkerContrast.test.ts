/**
 * Health marker and label contrast (#2676, spec §3.1 and §12 test 13).
 *
 * The Health markers must reach 3:1 non-text contrast (WCAG 1.4.11) against
 * the table surface and the hovered-row surface, and the labels 4.5:1, in BOTH
 * themes, using only existing legacy tokens. Like its siblings it reads the real
 * CSS rather than leaning on jest-axe, which disables `color-contrast` under
 * jsdom (lesson 075). It resolves each `var()` through the light tokens, then
 * the `[data-theme='dark']` overrides. Falsifiable: `__falsifiability__` shows a
 * deliberately weak pair goes red.
 *
 * Lives in `__tests__/accessibility/` (integration project, lesson 090).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (p: string): string => {
  const full = resolve(stylesDir, p)
  return existsSync(full) ? stripComments(readFileSync(full, 'utf8')) : ''
}

const colorsCss = read('tokens/colors.css')
const redesignCss = read('tokens/redesign.css')
const darkModeCss = read('dark-mode.css')
const dataTableCss = read('components/data-table.css')

/** Parse `--name: value;` from the first rule matching `selectorLiteral`. */
function parseTokenBlock(css: string, selectorLiteral: string) {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selectorLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  const map = new Map<string, string>()
  if (!m) return map
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    map.set(d[1].trim(), d[2].trim())
  return map
}

const lightTokens = new Map([
  ...parseTokenBlock(colorsCss, ':root'),
  ...parseTokenBlock(redesignCss, ':root'),
])
const darkTokens = new Map([
  ...parseTokenBlock(redesignCss, "[data-theme='dark']"),
  ...parseTokenBlock(darkModeCss, "[data-theme='dark']"),
])

function resolveVar(value: string, theme: 'light' | 'dark', depth = 0): string {
  if (depth > 8) throw new Error(`var() too deep: ${value}`)
  const v = value.trim()
  const m = v.match(/^var\((--[\w-]+)\)$/)
  if (!m) return v
  const next =
    theme === 'dark'
      ? (darkTokens.get(m[1]) ?? lightTokens.get(m[1]))
      : lightTokens.get(m[1])
  if (!next) throw new Error(`token ${m[1]} undefined in ${theme}`)
  return resolveVar(next, theme, depth + 1)
}

/** Value of `prop` in the rule whose selector is exactly `selectorLiteral`.
 *  Throws if the rule is missing so a renamed surface fails loudly. */
function ruleProp(css: string, selectorLiteral: string, prop: string): string {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selectorLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`rule ${selectorLiteral} not found in data-table.css`)
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  const pm = css
    .slice(open + 1, close)
    .match(new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;!]+)'))
  if (!pm) throw new Error(`prop ${prop} not in rule ${selectorLiteral}`)
  return pm[1].trim()
}

const NON_TEXT = 3.0 // WCAG 1.4.11
const TEXT = 4.5 // WCAG 1.4.3

const SURFACES = ['var(--surface)', 'var(--surface-3)'] as const
const THEMES = ['light', 'dark'] as const

describe('Health marker contrast (#2676)', () => {
  const MARKERS = [
    { sel: '.dt-marker--intervention-required', prop: 'color' },
    { sel: '.dt-marker--vulnerable', prop: 'color' },
    { sel: '.dt-marker--thriving', prop: 'color' },
  ] as const

  it.each(MARKERS)(
    '$sel clears 3:1 on the row and hovered-row surface in both themes',
    ({ sel, prop }) => {
      const token = ruleProp(dataTableCss, sel, prop)
      for (const theme of THEMES) {
        for (const surface of SURFACES) {
          const fg = resolveVar(token, theme)
          const bg = resolveVar(surface, theme)
          const ratio = calculateContrastRatio(fg, bg)
          expect(
            ratio,
            `${sel} ${fg} on ${surface} ${bg} (${theme}) = ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(NON_TEXT)
        }
      }
    }
  )

  it('the intervention x knockout clears 3:1 against the maroon circle', () => {
    const fillToken = ruleProp(
      dataTableCss,
      '.dt-marker--intervention-required',
      'color'
    )
    const knockoutToken = ruleProp(
      dataTableCss,
      '.dt-marker__knockout',
      'stroke'
    )
    for (const theme of THEMES) {
      const fill = resolveVar(fillToken, theme)
      const knock = resolveVar(knockoutToken, theme)
      const ratio = calculateContrastRatio(knock, fill)
      expect(
        ratio,
        `knockout ${knock} on ${fill} (${theme}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(NON_TEXT)
    }
  })

  it.each([
    ['.dt-health', 'color'],
    ['.dt-tier', 'color'],
    ['.dt-tier__provisional', 'color'],
    ['.dt-legend', 'color'],
    ['.dt-legend__note', 'color'],
  ] as const)(
    '%s text clears 4.5:1 on the row and hovered-row surface in both themes',
    (sel, prop) => {
      const token = ruleProp(dataTableCss, sel, prop)
      for (const theme of THEMES) {
        for (const surface of SURFACES) {
          const fg = resolveVar(token, theme)
          const bg = resolveVar(surface, theme)
          const ratio = calculateContrastRatio(fg, bg)
          expect(
            ratio,
            `${sel} ${fg} on ${surface} ${bg} (${theme}) = ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(TEXT)
        }
      }
    }
  )

  it('__falsifiability__ the old pastel yellow fails the marker threshold', () => {
    const ratio = calculateContrastRatio('#fef9c3', '#ffffff')
    expect(ratio).toBeLessThan(NON_TEXT)
  })
})
