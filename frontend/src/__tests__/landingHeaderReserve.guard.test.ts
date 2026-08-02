/**
 * Landing header reserve — the two #1359 gaps that survived PR #1357.
 *
 * #1357 took landing CLS from 0.265 to 0.046 at 1350px, but a cold-cache
 * Fast-3G measurement at **900px** still showed 0.244 — one shift, whose
 * named sources were unambiguous:
 *
 *   t=4623ms value=0.24436
 *      <DIV.districts-hero-stack>                 y 282->412, h 618->488
 *      <P.districts-page-header__orientation>     h  59->137
 *      <P.districts-page-header__lede>            h  41->61
 *
 * **Gap (a)** — the actions skeleton reserves HEIGHT but not WIDTH. It is
 * `display: none` at ≥768px on #922's premise that the loaded actions "lay
 * out inline beside the intro (no vertical shift to reserve)". They do lay
 * out inline — and in doing so they consume horizontal space, so when they
 * arrive the intro column narrows and every line rewraps. The intro grew
 * 172px → 398px: eyebrow 17→33, title 32→64, lede 41→81, orientation 59→195.
 * None of those carry data-dependent text; they simply got a narrower column.
 * At 1350px the intro is wide enough to absorb it. At 900px it is not.
 *
 * **Gap (b)** — the orientation sentence grows with the data: "Each row below
 * is **a Toastmasters district** worldwide" becomes "**one of the 128
 * Toastmasters districts**". No reserve fixes a text substitution, so the
 * loading shell now renders the SAME sentence with a width-reserved slot
 * where the number will land.
 *
 * jsdom has no layout engine (Lesson 66), so the geometry itself is proven by
 * measurement; this pins the CSS contract that produces it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(
  join(__dirname, '../styles/components/app-shell.css'),
  'utf-8'
)

/** Every `@media (min-width: 768px)` block, joined. */
const at768 = (
  css.match(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\n {2}\}/g) ?? []
).join('\n')

describe('landing header reserve — #1359 gap (a): actions WIDTH', () => {
  it('finds the 768px blocks it is asserting over', () => {
    expect(at768.length).toBeGreaterThan(0)
  })

  it('keeps the actions skeleton in flow at ≥768px', () => {
    // `display: none` here is the gap: it hands the intro the full row width
    // until the real toolbar lands and takes its share back.
    expect(at768).not.toMatch(
      /\.districts-page-header__actions--skeleton\s*\{[^}]*display:\s*none/
    )
  })

  it('reserves the skeleton the same horizontal box the loaded toolbar takes', () => {
    // The skeleton carries the REAL `.districts-page-header__actions` class,
    // so it inherits that container's inline-flex + wrap + gap; the only thing
    // it needs of its own is a floor under the width its pinned-width children
    // add up to, so a slow font swap can't shrink it below the loaded box.
    expect(css).toMatch(
      /\.districts-page-header__actions--skeleton\s*\{[^}]*min-width/
    )
  })
})

/**
 * #1359 gap (c) — below 768px BOTH chip rows lay out on ONE line and scroll
 * horizontally, instead of wrapping to as many lines as there are chips.
 *
 * This is a CLS fix before it is a density fix. #1359's shell comment named the
 * reason the region reserve could never be exact: "the shell cannot know the
 * region count before the data arrives", so it reserved one line and the loaded
 * row wrapped to four. Measured against the built page (rankings request
 * stalled so the shell cannot race the snapshot), that under-reserve is:
 *
 *   375px  region row  44 -> 174   (+130)
 *   600px  region row  44 ->  96    (+52)
 *   900px  region row  44 ->  70    (+26)
 *  1350px  region row  44 ->  44      (0)
 *
 * A single-line scroller has a height of one chip whatever the chip count, so
 * the shell's reserve becomes exact by construction rather than by guessing a
 * count. That is the same reason the Recognition row could already reserve
 * exactly: its chip set is static.
 *
 * jsdom has no layout engine and no media queries (Lesson 66), so the geometry
 * is proven by measurement; this pins the CSS contract that produces it.
 */
describe('landing toolbar — #1359 gap (c): single-line scrolling chip rows', () => {
  /** The `max-width: 767px` blocks, joined. */
  const below768 = (
    css.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n {2}\}/g) ?? []
  ).join('\n')

  it('finds the <768px blocks it is asserting over', () => {
    expect(below768.length).toBeGreaterThan(0)
  })

  it('puts the chips in a scroller that does not wrap below 768px', () => {
    expect(below768).toMatch(
      /\.districts-toolbar__scroller\s*\{[^}]*flex-wrap:\s*nowrap/
    )
    expect(below768).toMatch(
      /\.districts-toolbar__scroller\s*\{[^}]*overflow-x:\s*auto/
    )
  })

  it('keeps the chips from shrinking, so one line means one line', () => {
    // Without this the flex items compress to fit and the row silently stops
    // scrolling — the chips just get narrower than the 44px floor.
    expect(below768).toMatch(/\.districts-toolbar__scroller\s*>\s*\*/)
    expect(below768).toMatch(/flex:\s*0\s+0\s+auto/)
  })

  it('draws the focus ring INSIDE the chip so the scroller cannot clip it', () => {
    // `overflow-x: auto` forces the computed `overflow-y` to `auto` too — CSS
    // has no one-axis-visible option — so an outset ring is clipped top and
    // bottom. An inset ring is unclippable and keeps the row at one chip tall.
    expect(below768).toMatch(/outline-offset:\s*-2px/)
  })

  it('does not swallow the page’s vertical scroll', () => {
    expect(below768).toMatch(/overscroll-behavior-x:\s*contain/)
  })

  it('signals that there is more to the right', () => {
    // A row that silently cuts off reads as broken. A mask fade costs no
    // element, so it cannot itself shift anything.
    expect(below768).toMatch(/mask-image:\s*linear-gradient/)
  })

  it('leaves the desktop layout alone', () => {
    // The wrap behaviour at >=768px is the shipped design; only the mobile
    // rung changes. The base rule must therefore still allow wrapping.
    const base = /\.districts-toolbar__scroller\s*\{([^}]*)\}/.exec(css)
    expect(
      base,
      'base .districts-toolbar__scroller rule not found'
    ).not.toBeNull()
    expect(base![1]).toMatch(/flex-wrap:\s*wrap/)
  })
})

describe('landing toolbar reserve — #1362 Recognition chip row', () => {
  const page = readFileSync(
    join(__dirname, '../pages/DistrictsPage.tsx'),
    'utf-8'
  )

  it('wraps BOTH chip rows in the scroller, not just the new one', () => {
    // Fixing only the Recognition row leaves the region row wrapping, which is
    // the larger share of the mobile toolbar's height (+130px at 375px).
    const bar = readFileSync(
      join(__dirname, '../components/recognition/RecognitionFilterBar.tsx'),
      'utf-8'
    )
    expect(bar).toMatch(/districts-toolbar__scroller/)
    // The loaded region row and the shell's region reserve both need it.
    expect(page.match(/districts-toolbar__scroller/g) ?? []).toHaveLength(2)
  })

  /**
   * The chip row is part of the LOADED tree, so an unreserved slot hands back
   * the CLS #1357 and #1367 recovered. Unlike the region row — whose chip
   * count only becomes knowable when the data lands — this row is the static
   * registry, so the reserve can be EXACT: the loading shell renders the real
   * component in `disabled` mode. That the shell renders it at all is proven
   * behaviourally in `DistrictsPage.recognitionFilter.test.tsx`; what belongs
   * here is the CSS contract that makes the two boxes the same size.
   */
  it('renders the same component in the shell and the loaded toolbar', () => {
    expect(page.match(/<RecognitionFilterBar\b/g) ?? []).toHaveLength(2)
    // The shell's copy is the reserve — disabled, so it is not a tab stop.
    expect(page).toMatch(/<RecognitionFilterBar[\s\S]{0,240}?\bdisabled\s*\/>/)
  })

  it('floors the chip at the 44px touch target the loaded row inherits', () => {
    // Reserve STRUCTURALLY (Lesson: a skeleton that omits a button
    // under-reserves by the touch-target floor, not the visual size). Both
    // copies are the same element, so the floor applies to both — restated on
    // the chip so a future `min-width: auto` on the group cannot undercut it.
    const rule = /\.districts-toolbar__recognition-chip\s*\{([^}]*)\}/.exec(css)
    expect(
      rule,
      '.districts-toolbar__recognition-chip rule not found'
    ).not.toBeNull()
    expect(rule![1]).toMatch(/min-width:\s*44px/)
  })

  it('keeps the reserve visually inert without collapsing its box', () => {
    // `opacity`, never `display: none` / `visibility: hidden` / a zero height:
    // a reserve that does not occupy its box is not a reserve.
    const rule =
      /\.districts-toolbar__recognition-chip:disabled\s*\{([^}]*)\}/.exec(css)
    expect(rule, ':disabled rule not found').not.toBeNull()
    expect(rule![1]).not.toMatch(
      /display:\s*none|visibility:\s*hidden|height:\s*0/
    )
    expect(rule![1]).toMatch(/opacity/)
  })
})

describe('landing header reserve — #1359 gap (b): orientation count', () => {
  it('reserves an inline width for the district count', () => {
    const rule = /\.districts-orientation__count\s*\{([^}]*)\}/.exec(css)
    expect(rule, '.districts-orientation__count rule not found').not.toBeNull()
    // inline-block so a min-width applies at all (min-width is inert on a
    // pure inline box), and a `ch` floor so it tracks the font rather than
    // pinning a px value that goes stale with the type scale.
    expect(rule![1]).toMatch(/display:\s*inline-block/)
    expect(rule![1]).toMatch(/min-width:\s*\d+ch/)
  })
})
