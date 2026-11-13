import { describe, it, expect } from 'vitest'
import {
  contrast,
  declsFor,
  over,
  parseColor,
  prop,
  readSrcCss,
  sourceTexts,
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

describe('dark remaps of the tint tokens match their Tailwind twins (#2642)', () => {
  // .tm-bg-<c>-N paint var(--tm-<c>-N); the Tailwind twin .bg-tm-<c>-N already
  // has a dark rgba. A token left at its light value would paint a bright wash
  // in dark mode wherever the .tm-bg-* class is used.
  it.each([
    ['--tm-true-maroon-10', '.bg-tm-true-maroon-10'],
    ['--tm-cool-gray-30', '.bg-tm-cool-gray-30'],
    ['--tm-happy-yellow-20', '.bg-tm-happy-yellow-20'],
    ['--tm-happy-yellow-30', '.bg-tm-happy-yellow-30'],
  ])('%s equals the dark fill of %s', (token, twin) => {
    const toks = tokens('dark')
    const want = parseColor(
      prop(
        declsFor(darkCss, `[data-theme='dark'] ${twin}`),
        'background-color'
      )!,
      toks
    )
    expect(toks.get(token), `dark ${token}`).toBeDefined()
    expect(parseColor(`var(${token})`, toks)).toEqual(want)
  })
})

describe('tinted /N fills carry an explicit rule per theme (#2642)', () => {
  // `bg-tm-x/N` compiles to an oklab() color-mix that axe cannot resolve and
  // that ignores the dark palette; dark-mode.css pins an rgba per theme (the
  // `bg-tm-loyal-blue\/10` pattern). These two replaced `bg-tm-x bg-opacity-20`
  // pairs, whose solid base class used to match the dark overrides.
  const fills = ['bg-tm-happy-yellow/20', 'bg-tm-cool-gray/20']

  it('are still the fills the source uses', () => {
    const all = sourceTexts().join('\n')
    for (const cls of fills) expect(all).toContain(cls)
  })

  it.each(fills)('%s has a light and a dark rule', cls => {
    const esc = cls.replace('/', '\\/')
    for (const theme of THEMES) {
      const decls = declsFor(darkCss, `[data-theme='${theme}'] .${esc}`)
      expect(
        prop(decls, 'background-color'),
        `${theme} rule for ${cls}`
      ).toMatch(/^rgba\(/)
    }
  })

  // DistrictDetailPage limited-data banner: bg-tm-happy-yellow/20 with
  // text-tm-black copy and a text-tm-loyal-blue icon, on the page surfaces.
  it.each(THEMES)('limited-data banner text clears AA (%s)', theme => {
    const toks = tokens(theme)
    const fill = parseColor(
      prop(
        declsFor(darkCss, `[data-theme='${theme}'] .bg-tm-happy-yellow\\/20`),
        'background-color'
      )!,
      toks
    )
    const ink =
      theme === 'dark'
        ? parseColor(
            prop(
              declsFor(darkCss, "[data-theme='dark'] .text-tm-black"),
              'color'
            )!,
            toks
          )
        : parseColor('#000000', toks)
    const accent =
      theme === 'dark'
        ? parseColor('#5dade2', toks)
        : parseColor('#004165', toks)
    for (const surface of surfaces(theme)) {
      const bg = over(fill, surface)
      expect(contrast(ink, bg), 'copy').toBeGreaterThanOrEqual(AA)
      expect(contrast(accent, bg), 'icon').toBeGreaterThanOrEqual(3)
    }
  })

  it('retires the descendant-ink rule the old solid banner needed', () => {
    // The banner is a tint now, so dark ink on it would be wrong; nothing else
    // nests text-tm-black / text-gray-600 inside a solid happy-yellow fill.
    expect(darkCss).not.toMatch(/\.bg-tm-happy-yellow \.text-tm-black/)
    expect(darkCss).not.toMatch(/\.bg-tm-happy-yellow \.text-gray-600/)
  })
})
