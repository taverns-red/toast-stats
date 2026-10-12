import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1847 — safe-area and landscape contract (mobile epic #1827, review S11 /
   §4.2 / §7 item 20). env(safe-area-inset-*) resolves to 0 unless the
   viewport opts in with viewport-fit=cover, and once it does, every edge the
   app paints to (the top bar, fixed bars, sheets) must pad itself clear of
   the notch and home indicator. jsdom cannot see either; the preview smoke
   (e2e/safe-area-landscape.smoke.ts) measures them in real pixels with
   emulated insets. These regexes pin the rules it depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const indexHtml = read('../../../index.html')
const indexCss = read('../../index.css')
// Read lazily-tolerant: a missing file fails its assertions, not the import.
const readOr = (p: string) => {
  try {
    return read(p)
  } catch {
    return ''
  }
}
const safeArea = readOr('../components/safe-area.css')
const contextBar = read('../components/context-bar.css')
const appShell = read('../components/app-shell.css')
const clubsRace = read('../components/clubs-race.css')
const clubHistory = read('../components/club-history.css')
const narrative = read('../components/district-narrative.css')
const chartSheet = read('../components/chart-sparkline-expand.css')

const LANDSCAPE = /\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)/

/** The body of the first `selector { … }` rule in src (no nesting). */
const rule = (src: string, selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return src.match(new RegExp(`${esc}\\s*\\{[^}]*\\}`))?.[0] ?? ''
}

/** Every `@media <query> {` prelude in src. */
const mediaPreludes = (src: string): string[] =>
  src.match(/@media[^{]*\{/g) ?? []

describe('viewport opt-in (#1847)', () => {
  it('sets viewport-fit=cover so env(safe-area-inset-*) is not 0', () => {
    const meta =
      indexHtml.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1] ?? ''
    expect(meta).toMatch(/width=device-width/)
    expect(meta).toMatch(/viewport-fit=cover/)
  })

  it('imports safe-area.css after every chrome sheet it overrides', () => {
    const at = indexCss.indexOf("@import './styles/components/safe-area.css'")
    expect(at).toBeGreaterThan(-1)
    for (const dep of [
      'app-shell.css',
      'context-bar.css',
      'section-bar.css',
      'chart-sparkline-expand.css',
      'priority-columns.css',
    ]) {
      expect(at).toBeGreaterThan(
        indexCss.indexOf(`@import './styles/components/${dep}'`)
      )
    }
  })
})

describe('safe-area.css — the shell pads itself clear of the notch (#1847)', () => {
  it('grows the top bar by the top inset and pads its sides past the notch', () => {
    const root = rule(safeArea, ':root')
    expect(root).toMatch(
      /--app-top-bar-h:\s*calc\(\s*56px\s*\+\s*env\(safe-area-inset-top/
    )
    const bar = rule(safeArea, '.app-shell-top-bar')
    expect(bar).toMatch(/height:\s*var\(--app-top-bar-h\)/)
    expect(bar).toMatch(/padding-top:\s*env\(safe-area-inset-top/)
    expect(bar).toMatch(/padding-left:\s*max\([^)]*env\(safe-area-inset-left/)
    expect(bar).toMatch(/padding-right:\s*max\([^)]*env\(safe-area-inset-right/)
  })

  it('insets the page content and footer horizontally (landscape notch)', () => {
    const main = rule(safeArea, '.app-shell__main')
    expect(main).toMatch(/margin-left:\s*env\(safe-area-inset-left/)
    expect(main).toMatch(/margin-right:\s*env\(safe-area-inset-right/)
    const footer = rule(safeArea, '.app-shell-footer')
    expect(footer).toMatch(/padding-left:\s*env\(safe-area-inset-left/)
    expect(footer).toMatch(/padding-right:\s*env\(safe-area-inset-right/)
  })

  it('pads every viewport-fixed sheet on the sides and the bottom', () => {
    for (const sel of ['.bottom-sheet', '.jump-to-sheet']) {
      const r = rule(safeArea, sel)
      expect(r, sel).toMatch(/padding-left:\s*env\(safe-area-inset-left/)
      expect(r, sel).toMatch(/padding-right:\s*env\(safe-area-inset-right/)
      expect(r, sel).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom/)
    }
    // Full-height sheets also start under the status bar / notch.
    for (const sel of [
      '.bottom-sheet.bottom-sheet--full',
      '.chart-expand-sheet',
    ]) {
      const r = rule(safeArea, sel)
      expect(r, sel).toMatch(/padding-top:\s*env\(safe-area-inset-top/)
    }
    const chart = rule(safeArea, '.chart-expand-sheet')
    expect(chart).toMatch(/padding-left:\s*env\(safe-area-inset-left/)
    expect(chart).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom/)
  })
})

describe('sheets size to the visible viewport: dvh, never vh (#1847)', () => {
  // vh is the LARGE viewport on iOS: with the URL bar showing, an 80vh
  // sheet runs past the bottom edge. dvh tracks what is actually visible.
  const sheetRules: [string, string][] = [
    [contextBar, '.bottom-sheet'],
    [appShell, '.jump-to-sheet'],
    [appShell, '.command-palette'],
    [appShell, '.command-palette__backdrop'],
    [appShell, '.header-search__dropdown'],
    [appShell, '.header-search__dropdown .command-palette__results'],
  ]
  for (const [src, sel] of sheetRules) {
    it(`${sel} uses dvh`, () => {
      const r = rule(src, `\n  ${sel}`)
      expect(r, sel).not.toBe('')
      expect(r, sel).not.toMatch(/\d\s*vh\b/)
    })
  }

  it('the shared chart sheet is no taller than the visible viewport', () => {
    expect(rule(chartSheet, '.chart-expand-sheet-overlay')).not.toMatch(
      /\d\s*vh\b/
    )
  })
})

describe('landscape phones get the phone chrome (#1847)', () => {
  // At 812×375 the desktop header stack put first data at 326px (overview)
  // and 700px (clubs). Short landscape gets the 44px context bar instead of
  // the eyebrow/H1/lede/controls stack, the lede moves into its sheet.
  it('context-bar.css shows the bar and collapses the header in short landscape', () => {
    const collapse = mediaPreludes(contextBar).filter(q =>
      /max-width:\s*767px/.test(q)
    )
    expect(collapse.length).toBeGreaterThan(0)
    for (const q of collapse) expect(q).toMatch(LANDSCAPE)

    const hide = mediaPreludes(contextBar).find(q =>
      /min-width:\s*768px/.test(q)
    )
    // ≥768 hides the bar only when the viewport is NOT a short landscape.
    expect(hide).toMatch(/min-height:\s*501px|orientation:\s*portrait/)
  })

  it('hides the district eyebrow and lede under the bar', () => {
    const block =
      contextBar.match(
        /@media[^{]*max-width:\s*767px[^{]*\{[\s\S]*?\n {2}\}/
      )?.[0] ?? ''
    expect(block).toMatch(/\.district-detail-page-header__eyebrow/)
    expect(block).toMatch(/\.district-detail-page-header__lede/)
  })

  it.each([
    { name: 'clubs-race.css', src: clubsRace },
    { name: 'club-history.css', src: clubHistory },
  ])(
    '$name collapses its header under the bar in short landscape too',
    ({ src }) => {
      const qs = mediaPreludes(src).filter(q => /max-width:\s*767px/.test(q))
      expect(qs.length).toBeGreaterThan(0)
      const withBar = qs.filter(q => {
        const i = src.indexOf(q)
        return /context-bar/.test(src.slice(i, i + 400))
      })
      expect(withBar.length).toBeGreaterThan(0)
      for (const q of withBar) expect(q).toMatch(LANDSCAPE)
    }
  )

  it('lets the top bar scroll away in short landscape; sticky chrome follows the offset token', () => {
    const block =
      safeArea.match(
        new RegExp(`@media\\s*${LANDSCAPE.source}\\s*\\{[\\s\\S]*?\\n {2}\\}`)
      )?.[0] ?? ''
    expect(block).toMatch(/\.app-shell-top-bar\s*\{[^}]*position:\s*relative/)
    expect(block).toMatch(/--app-top-offset:\s*env\(safe-area-inset-top/)

    expect(rule(contextBar, '\n  .context-bar')).toMatch(
      /top:\s*var\(--app-top-offset,\s*56px\)/
    )
    expect(rule(appShell, '\n  .jump-to-bar')).toMatch(
      /top:\s*var\(--app-top-offset,\s*56px\)/
    )
    expect(narrative).toMatch(/top:\s*var\(--app-top-offset,\s*56px\)/)
  })
})
