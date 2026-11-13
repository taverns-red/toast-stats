import { describe, it, expect } from 'vitest'
import {
  contrast,
  declsFor,
  over,
  parseColor,
  prop,
  readSrcCss,
  surfaces,
  tokens,
  type Theme,
} from './cssColor'

/* #2642 — the brand utilities went live, so the text/fill pairings they make
   must clear WCAG AA (4.5:1) in both themes. Colours are computed from the
   shipped CSS and tokens, not from class names. */

const AA = 4.5
const THEMES: Theme[] = ['light', 'dark']
const utilities = readSrcCss('styles/components/brand-utilities.css')
const darkCss = readSrcCss('styles/dark-mode.css')

/** Declarations that apply to `.cls` in `theme`: base rule, then dark scope. */
function classDecls(cls: string, theme: Theme): string {
  const base = declsFor(utilities, `.${cls}`)
  const dark =
    theme === 'dark'
      ? declsFor(utilities, `[data-theme='dark'] .${cls}`) +
        ';' +
        declsFor(darkCss, `[data-theme='dark'] .${cls}`)
      : ''
  return `${base};${dark}`
}

describe('.tm-text-cool-gray is readable text, not a decorative tint (#2642)', () => {
  // Consumers: RankingCard, DivisionSummary, GlobalRankingsTab. Plain on the
  // page surface, and on the cool-gray-20 neutral badge fill.
  it.each(THEMES)(
    'clears AA on every surface and on the neutral badge (%s)',
    theme => {
      const toks = tokens(theme)
      const colour = prop(classDecls('tm-text-cool-gray', theme), 'color')
      expect(colour, 'a .tm-text-cool-gray colour rule').toBeDefined()
      const fg = parseColor(colour!, toks)
      const tint = parseColor(
        prop(classDecls('tm-bg-cool-gray-20', theme), 'background-color')!,
        toks
      )
      for (const surface of surfaces(theme)) {
        for (const bg of [surface, over(tint, surface)]) {
          expect(contrast(over(fg, surface), bg)).toBeGreaterThanOrEqual(AA)
        }
      }
    }
  )
})
