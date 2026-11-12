/**
 * Clubs table layout CSS (#2676, spec §5, §12 test 11; risk R-1).
 *
 * jsdom has no layout engine (lesson 075), so these read the stylesheets:
 *  - there is no inner vertical scroller (the 70vh box is gone);
 *  - the header sticks to the page at `--table-sticky-top`;
 *  - no ancestor between the table and the page is a scroll container, which
 *    would silently kill page-level stickiness (R-1);
 *  - the club name link is a 44px target under a coarse pointer.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '..')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory())
      return name === '__tests__' ? [] : cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })

const allCss = cssFiles(stylesDir)
  .map(f => stripComments(readFileSync(f, 'utf8')))
  .join('\n')

const dataTableCss = stripComments(
  readFileSync(resolve(stylesDir, 'components/data-table.css'), 'utf8')
)
const appShellCss = stripComments(
  readFileSync(resolve(stylesDir, 'components/app-shell.css'), 'utf8')
)

/** Every `selector-list { body }` pair, nested at-rules flattened. */
function rules(css: string): Array<{ selectors: string[]; body: string }> {
  const out: Array<{ selectors: string[]; body: string }> = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({
      selectors: m[1]!
        .split(',')
        .map(s => s.trim().replace(/\s+/g, ' '))
        .filter(Boolean),
      body: m[2]!,
    })
  }
  return out
}

const rulesFor = (css: string, selector: string) =>
  rules(css).filter(r => r.selectors.includes(selector))

describe('no inner vertical scroller (spec §5.1)', () => {
  it('app-shell.css has no .clubs-table-scroll rule and no 70vh cap', () => {
    expect(appShellCss).not.toMatch(/\.clubs-table-scroll\b/)
    expect(appShellCss).not.toMatch(/max-height\s*:\s*70vh/)
  })
})

describe('sticky header against the page (spec §5.2, test 11)', () => {
  it('defines --table-sticky-top once, on .app-shell', () => {
    const shell = rulesFor(appShellCss, '.app-shell')
    expect(shell.some(r => /--table-sticky-top\s*:/.test(r.body))).toBe(true)
  })

  it('sticks the header cells at --table-sticky-top', () => {
    const body = rules(dataTableCss)
      .filter(r => r.selectors.some(s => /\.dt thead th$/.test(s)))
      .map(r => r.body)
      .join(';')
    expect(body).toMatch(/position\s*:\s*sticky/)
    expect(body).toMatch(/top\s*:\s*var\(--table-sticky-top/)
    expect(body).toMatch(/background-color\s*:\s*var\(--surface-2\)/)
  })

  it('lets the header scroll away in overflow mode (no synced clone, Q2)', () => {
    const body = rules(dataTableCss)
      .filter(r =>
        r.selectors.some(s => /\[data-overflow='true'\] \.dt thead th$/.test(s))
      )
      .map(r => r.body)
      .join(';')
    expect(body).toMatch(/top\s*:\s*auto/)
  })

  it('scrolls only in overflow mode: the wrapper is overflow:visible by default', () => {
    const base = rulesFor(dataTableCss, '.dt-scroll')
      .map(r => r.body)
      .join(';')
    expect(base).not.toMatch(/overflow(-[xy])?\s*:\s*(auto|scroll|hidden)/)
    const overflow = rulesFor(dataTableCss, ".dt-scroll[data-overflow='true']")
      .map(r => r.body)
      .join(';')
    expect(overflow).toMatch(/overflow-x\s*:\s*auto/)
  })
})

describe('no scroll container above the table (R-1)', () => {
  // Any ancestor with overflow other than visible/clip becomes the sticky
  // header's scrollport, so the header stops sticking to the page.
  const ANCESTORS = [
    '.redesign-panel',
    '.district-detail-page',
    '.district-detail-page-root',
    '.app-shell',
    '.app-shell__main',
    '.dt-scroll-wrap',
    '.clubs-table__scroll-wrap',
  ]

  it.each(ANCESTORS)(
    '%s never sets overflow other than visible or clip',
    sel => {
      const bad = rulesFor(allCss, sel).filter(r =>
        /overflow(-[xy])?\s*:\s*(auto|scroll|hidden|overlay)/.test(r.body)
      )
      expect(bad.map(r => r.body.trim())).toEqual([])
    }
  )

  it('the wrapper components add no overflow utility class', () => {
    const src = resolve(here, '../..')
    for (const file of [
      'components/ClubsTable.tsx',
      'components/dataTable/DataTable.tsx',
      'pages/DistrictClubsPage.tsx',
    ]) {
      const code = readFileSync(resolve(src, file), 'utf8')
      expect(code, file).not.toMatch(
        /\boverflow-(x-|y-)?(auto|hidden|scroll)\b/
      )
    }
  })
})

describe('club name link target (spec §6)', () => {
  it('is a 44px-tall block under a coarse pointer', () => {
    const blocks = [
      ...dataTableCss.matchAll(
        /@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?\n {2}\})/g
      ),
    ].map(m => m[1]!)
    const link = blocks
      .flatMap(b => rules(b))
      .filter(r => r.selectors.some(s => /\.clubs-name-link$/.test(s)))
      .map(r => r.body)
      .join(';')
    expect(link).toMatch(/min-height\s*:\s*44px/)
    expect(link).toMatch(/display\s*:\s*(flex|block|inline-flex)/)
  })
})
