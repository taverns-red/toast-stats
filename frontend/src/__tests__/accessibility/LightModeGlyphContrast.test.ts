// Light-mode glyph, icon, placeholder and input-border contrast (#2643).
//
// Light mode only (dark already passes). `text-gray-300` is 1.47:1 and
// `text-gray-400` is 2.54:1 on white; `--line` as an input border is 1.15:1;
// `--ink-4` as a placeholder is 3.29-3.44:1. The fix direction is `--ink-3`
// (5.9:1) for anything meaningful, so these checks pin the source to it.
//
// Greppy on purpose, like small-text-light-mode.test.ts: a stylesheet cascade
// is proven in real pixels by e2e/light-glyph-contrast.smoke.ts; this catches
// the regression at unit speed. Decorative separators carry aria-hidden and
// are exempt from WCAG contrast, but the components below drop the grey
// anyway so the ban stays simple and absolute.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../..')
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf-8')

// Every regex metacharacter, plus the hyphen and slash, so a CSS selector
// such as `.a-b::placeholder` is matched literally.
const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

/** Body of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const re = new RegExp(
    `^[ \\t]*${escapeRegExp(selector)}[ \\t]*\\{([^}]*)\\}`,
    'm'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`no rule found for ${selector}`)
  return m[1] ?? ''
}

// `theme-dark:` / `dark:` variants only apply in dark mode, so they are fine.
const LIGHT_GLYPH_GREY = /(?<![\w:-])text-gray-(?:300|400)(?![\w-])/g
const LIGHT_TICK_GREY = /(?<![\w:-])bg-gray-400(?![\w-])/g

describe('no text-gray-300/400 on glyph spans in the touched components (#2643)', () => {
  const FILES = [
    'components/InfoTooltip.tsx',
    'components/SubpageBreadcrumb.tsx',
    'components/KpiBulletCard.tsx',
    'components/DatePairPicker.tsx',
    'components/DateSelector.tsx',
    'components/ProgramYearSelector.tsx',
    'components/DCPProjectionsTable.tsx',
    'components/MilestonesCallout.tsx',
    'pages/RegionPage.tsx',
    'pages/DistrictsPage.tsx',
  ]

  it.each(FILES)('%s has no light-mode text-gray-300/400', file => {
    const hits = read(file).match(LIGHT_GLYPH_GREY) ?? []
    expect(hits).toEqual([])
  })

  it('KPI tier ticks are not bg-gray-400', () => {
    expect(read('components/KpiBulletCard.tsx').match(LIGHT_TICK_GREY)).toBe(
      null
    )
  })

  it('the "Set as my district" star is not off-palette yellow', () => {
    expect(read('pages/DistrictsPage.tsx')).not.toMatch(/text-yellow-500/)
  })

  it('a "no value" dash in the region tier cell has an accessible label', () => {
    const src = read('pages/RegionPage.tsx')
    expect(src).toMatch(/sr-only[^<]*>No tier</)
  })
})

describe('placeholders, icons and input borders use --ink-3 (#2643)', () => {
  const appShell = read('styles/components/app-shell.css')
  const landing = read('styles/components/landing-search.css')

  it.each([
    ['app-shell.css', appShell, '.header-search__input::placeholder'],
    [
      'app-shell.css',
      appShell,
      '.districts-toolbar__search-input::placeholder',
    ],
    ['app-shell.css', appShell, '.clubs-filter-input::placeholder'],
    ['app-shell.css', appShell, '.command-palette__input::placeholder'],
    ['landing-search.css', landing, '.landing-search__input::placeholder'],
  ])('%s %s placeholder is --ink-3', (_f, css, selector) => {
    expect(ruleBody(css, selector)).toMatch(/color:\s*var\(--ink-3\)/)
  })

  it.each([
    ['app-shell.css', appShell, '.districts-toolbar__search-icon'],
    ['landing-search.css', landing, '.landing-search__icon'],
  ])('%s %s icon is --ink-3', (_f, css, selector) => {
    expect(ruleBody(css, selector)).toMatch(/color:\s*var\(--ink-3\)/)
  })

  it('the hero search input border is --ink-3 (was --line, 1.15:1)', () => {
    expect(ruleBody(landing, '.landing-search__input')).toMatch(
      /border:\s*2px solid var\(--ink-3\)/
    )
  })

  it('the rankings filter input border is --ink-3 (was --line, 1.24:1)', () => {
    expect(ruleBody(appShell, '.districts-toolbar__search-input')).toMatch(
      /border:\s*1px solid var\(--ink-3\)/
    )
  })
})
