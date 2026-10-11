import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1831 — CSS contract for the phone context bar + bottom sheet. Geometry,
   breakpoints, reduced motion and safe-area are CSS-only behaviours jsdom
   cannot see; the preview smoke (e2e/context-bar.smoke.ts) measures them in
   real pixels. These regexes pin the rules that smoke depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const css = read('../components/context-bar.css')
const indexCss = read('../../index.css')
const clubHistoryCss = read('../components/club-history.css')

/** Body of the first `@media (<query>) { … }` block matching `query`. */
const mediaBlocks = (src: string, query: RegExp): string[] =>
  src.match(
    new RegExp(
      `@media\\s*\\(${query.source}\\)\\s*\\{[\\s\\S]*?\\n {2}\\}`,
      'g'
    )
  ) ?? []

/** Same, for an unlayered file whose @media blocks close at column 0. */
const topLevelMediaBlocks = (src: string, query: RegExp): string[] =>
  src.match(
    new RegExp(`@media\\s*\\(${query.source}\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'g')
  ) ?? []

describe('context-bar.css (#1831)', () => {
  it('is imported by index.css', () => {
    expect(indexCss).toMatch(
      /@import '\.\/styles\/components\/context-bar\.css'/
    )
  })

  it('is a 44px sticky row under the 56px top bar (≤64px sticky budget)', () => {
    const bar = css.match(/\n {2}\.context-bar\s*\{[^}]*\}/)?.[0] ?? ''
    expect(bar).toMatch(/position:\s*sticky/)
    expect(bar).toMatch(/top:\s*56px/)
    expect(bar).toMatch(/height:\s*44px/)
  })

  it('is hidden from 768 up, where the desktop header is unchanged', () => {
    const at768 = mediaBlocks(css, /min-width:\s*768px/).join('\n')
    expect(at768).toMatch(/\.context-bar\s*\{[^}]*display:\s*none/)
  })

  it('collapses the district header stack and breadcrumb below 768 but keeps the H1 for AT', () => {
    const below = mediaBlocks(css, /max-width:\s*767px/).join('\n')
    expect(below).toMatch(
      /\.district-detail-page-header__lede[\s\S]*?display:\s*none/
    )
    expect(below).toMatch(
      /\.district-detail-page-header__actions[\s\S]*?display:\s*none/
    )
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.subpage-breadcrumb[\s\S]*?display:\s*none/
    )
    // The H1 is visually hidden (clip pattern), never display:none.
    const title =
      below.match(/\.district-detail-page-header__title[^{]*\{[^}]*\}/)?.[0] ??
      ''
    expect(title).toMatch(/clip/)
    expect(title).not.toMatch(/display:\s*none/)
    // A page whose H1 is a sibling of the bar (What Changed) gets the same.
    expect(below).toMatch(/\.context-bar\s*~\s*h1[\s\S]*?clip/)
  })

  it('collapses the shared entity header (.districts-page-header) after a bar below 768', () => {
    const below = mediaBlocks(css, /max-width:\s*767px/).join('\n')
    for (const part of ['__lede', '__actions', '__eyebrow']) {
      expect(below, part).toMatch(
        new RegExp(
          `\\.context-bar\\s*~\\s*\\.districts-page-header\\s+\\.districts-page-header${part}[\\s\\S]*?display:\\s*none`
        )
      )
    }
    // Title visually hidden, kept for AT.
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.districts-page-header\s+\.districts-page-header__title[^{]*\{[^}]*clip/
    )
    // The bar sits flush under the top bar on a plain page container too.
    expect(below).toMatch(
      /\.app-shell__page:has\(>\s*\.context-bar\)\s*\{[^}]*padding-top:\s*0/
    )
    // …and on the wide data-grid container (region, clubs-world).
    expect(below).toMatch(
      /\.districts-page:has\(>\s*\.context-bar\)[^{]*\{[^}]*padding-top:\s*0/
    )
  })

  it('moves the club hero PY/date chips into the bar below 768 (hero H1 stays visible)', () => {
    const below = mediaBlocks(css, /max-width:\s*767px/).join('\n')
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.club-hero\s+\.club-hero__controls[^{]*\{[^}]*display:\s*none/
    )
    expect(below).not.toMatch(/\.club-hero__title[^{]*\{[^}]*clip/)
  })

  it('bleeds the bar across whatever gutter the host page sets', () => {
    const bar = css.match(/\n {2}\.context-bar\s*\{[^}]*\}/)?.[0] ?? ''
    expect(bar).toMatch(/var\(--context-bar-bleed,\s*24px\)/)
  })

  it('collapses the club history header after a bar below 768 (unlayered file, so the rules live there)', () => {
    const below = topLevelMediaBlocks(
      clubHistoryCss,
      /max-width:\s*767px/
    ).join('\n')
    expect(below).toMatch(
      /\.club-history-page:has\(>\s*\.context-bar\)\s*\{[^}]*padding-top:\s*0/
    )
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.club-history-page__header\s+\.club-history-page__sub[\s\S]*?display:\s*none/
    )
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.club-history-page__header\s+\.club-history-page__export[\s\S]*?display:\s*none/
    )
    expect(below).toMatch(
      /\.context-bar\s*~\s*\.club-history-page__header\s+\.club-history-page__title[^{]*\{[^}]*clip/
    )
  })

  it('gives sheet selects a 16px font (no iOS focus zoom)', () => {
    expect(css).toMatch(/\.context-sheet__select\s*\{[^}]*font-size:\s*16px/)
  })

  it('pads the sheet for the bottom safe-area inset', () => {
    expect(css).toMatch(/\.bottom-sheet\s*\{[^}]*env\(safe-area-inset-bottom/)
  })

  it('drops the sheet slide-in under prefers-reduced-motion', () => {
    const reduced = mediaBlocks(css, /prefers-reduced-motion:\s*reduce/).join(
      '\n'
    )
    expect(reduced).toMatch(/\.bottom-sheet\s*\{[^}]*animation:\s*none/)
  })

  it('keeps tap targets at 44px (back crumb, chip, close)', () => {
    for (const cls of [
      'context-bar__back',
      'context-bar__chip',
      'bottom-sheet__close',
    ]) {
      const rule = css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? ''
      expect(rule, cls).toMatch(/min-height:\s*44px|height:\s*44px/)
    }
  })
})
