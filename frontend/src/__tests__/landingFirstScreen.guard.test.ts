/**
 * Landing first screen on phones (#1846, mobile epic #1827, review §7 item
 * 19). At 375 the first KPI sat at y=532: title + lede + a 4-line orientation
 * paragraph + freshness/PY/date chips + Export/Share all came first. The fix:
 *
 *  - the shared ContextBar replaces that stack below 768 (the orientation
 *    copy, PY/date and the actions move into its sheet);
 *  - the hero search is first in the stack (#861's order:-1 hoist);
 *  - the two horizontally scrolling chip rows fade only the edges that still
 *    hide chips, so the row says "more this way" and "this is the end".
 *
 * jsdom has no layout and no media queries (Lesson 66): geometry is proven by
 * e2e/landing-first-screen.smoke.ts on the preview; this pins the contract.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8')
const below768 = (css: string) =>
  (
    css.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n {2}\}/g) ?? []
  ).join('\n')

const page = read('../pages/DistrictsPage.tsx')
const contextBarCss = below768(read('../styles/components/context-bar.css'))
const appShellCss = below768(read('../styles/components/app-shell.css'))

describe('landing context bar (#1846)', () => {
  it('mounts the bar in the loading shell AND the loaded page (no CLS on data)', () => {
    expect(page.match(/<LandingContextBar\b/g) ?? []).toHaveLength(2)
  })

  it('keeps the one-line lede visible below 768 (the static LCP candidate)', () => {
    // Measured on the PR preview: with the whole header hidden, LCP moved
    // from the shell's orientation <p> (~1.65s) to post-data content
    // (~2.47s, against the 2.5s gate). The lede paints with the shell, so
    // it holds LCP early and names the page whose H1 is visually hidden.
    expect(
      page.match(
        /districts-page-header__lede districts-page-header__lede--keep/g
      ) ?? []
    ).toHaveLength(2)
    expect(contextBarCss).toMatch(
      /\.context-bar\s*~\s*\.districts-page-header\s+\.districts-page-header__lede--keep\s*\{[^}]*display:\s*block/
    )
  })

  it('hides the orientation paragraph below 768 once the bar is present', () => {
    expect(contextBarCss).toMatch(
      /\.context-bar\s*~\s*\.districts-page-header\s+\.districts-page-header__orientation/
    )
  })
})

describe('landing chip rows — edge-aware fade cues (#1846)', () => {
  it('fades the trailing edge only while chips remain to the right', () => {
    expect(appShellCss).toMatch(
      /\.districts-toolbar__scroller\[data-more-after\]\s*\{[^}]*mask-image:\s*linear-gradient/
    )
  })

  it('fades the leading edge only once chips are scrolled off to the left', () => {
    expect(appShellCss).toMatch(
      /\.districts-toolbar__scroller\[data-more-before\]\s*\{[^}]*mask-image:\s*linear-gradient/
    )
  })

  it('wires both live chip rows to the edge tracker', () => {
    const bar = read('../components/recognition/RecognitionFilterBar.tsx')
    expect(bar).toMatch(/useScrollEdges/)
    expect(page).toMatch(/useScrollEdges/)
  })
})
