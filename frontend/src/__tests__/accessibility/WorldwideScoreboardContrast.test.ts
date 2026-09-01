/**
 * Worldwide scoreboard contrast audit (#1500, epic #1496 Sprint 4).
 *
 * jest-axe cannot see this: axe auto-disables `color-contrast` under JSDOM
 * (no layout engine), so a section can pass every axe scan and still be
 * illegible in dark mode. That is exactly how the preset-chip regression of
 * 2026-08-31 shipped — `dark-mode.css` intercepts common Tailwind utilities
 * with `!important`, beating a component's own `theme-dark:` variant, and the
 * break looks half-applied because only the intercepted properties lose.
 *
 * `worldwide-scoreboard.css` therefore uses NO Tailwind colour utilities at
 * all: every colour is a redesign token, which remaps light↔dark by design.
 * This test proves two things about that choice:
 *
 *   1. every foreground/background pair the section uses clears WCAG AA in
 *      BOTH themes, and
 *   2. the stylesheet contains no Tailwind colour utility that `dark-mode.css`
 *      could intercept — the structural guard against the regression coming
 *      back the next time someone adds a row.
 *
 * Reads the real CSS, like the sibling dark-mode audits (#608/#609). Lives in
 * `__tests__/accessibility/` so it routes to the integration project (R22).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (p: string) =>
  stripComments(readFileSync(resolve(stylesDir, p), 'utf8'))

const redesignCss = read('tokens/redesign.css')
const scoreboardCss = read('components/worldwide-scoreboard.css')

/** `--name: value;` declarations of the first rule matching `selectorLiteral`. */
function parseTokenBlock(css: string, selectorLiteral: string) {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selectorLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) return new Map<string, string>()
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  const map = new Map<string, string>()
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1]!.trim(), d[2]!.trim())
  }
  return map
}

const light = parseTokenBlock(redesignCss, ':root')
const dark = parseTokenBlock(redesignCss, "[data-theme='dark']")

function token(name: string, theme: 'light' | 'dark'): string {
  const value =
    (theme === 'dark' ? dark.get(name) : undefined) ?? light.get(name)
  if (!value) throw new Error(`token ${name} is undefined in ${theme}`)
  return value
}

/** Every ink/surface pair the scoreboard actually paints. */
const PAIRS: ReadonlyArray<{ fg: string; bg: string; where: string }> = [
  { fg: '--ink', bg: '--surface', where: 'numeric cells' },
  { fg: '--ink-2', bg: '--surface', where: 'column + row headers' },
  { fg: '--ink-3', bg: '--surface', where: 'stated basis under a row label' },
  { fg: '--ink-2', bg: '--surface-2', where: 'group heading + legend text' },
  {
    fg: '--ink-3',
    bg: '--surface-2',
    where: 'group note + legend marker — the absence markers',
  },
  { fg: '--ink', bg: '--surface-2', where: 'placeholder headline' },
]

describe('Worldwide scoreboard — contrast in both themes (#1500)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const pair of PAIRS) {
      it(`${theme}: ${pair.fg} on ${pair.bg} (${pair.where}) clears AA`, () => {
        const ratio = calculateContrastRatio(
          token(pair.fg, theme),
          token(pair.bg, theme)
        )
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('the absent-value underline clears the 3:1 non-text bar in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const ratio = calculateContrastRatio(
        token('--ink-4', theme),
        token('--surface', theme)
      )
      expect(ratio).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('Worldwide scoreboard — no interceptable Tailwind colours (#1500)', () => {
  it('uses redesign tokens for every colour, never a Tailwind colour utility', () => {
    // `dark-mode.css` overrides utilities like `.bg-gray-100` with
    // `!important`, which outranks any component rule. Selecting on one here
    // would reintroduce the half-applied dark palette.
    const utilitySelectors = scoreboardCss.match(
      /\.(bg|text|border)-(gray|slate|zinc|neutral|stone|red|blue|green|yellow|purple|amber|indigo)-\d{2,3}\b/g
    )
    expect(utilitySelectors).toBeNull()
  })

  it('declares no raw hex colour — colour comes from tokens only', () => {
    const declarations = scoreboardCss.match(
      /(?:color|background|background-color|border[\w-]*)\s*:[^;]*#[0-9a-fA-F]{3,8}/g
    )
    expect(declarations).toBeNull()
  })

  it('needs no [data-theme="dark"] override block, because tokens remap themselves', () => {
    expect(scoreboardCss).not.toMatch(/\[data-theme=/)
  })
})
