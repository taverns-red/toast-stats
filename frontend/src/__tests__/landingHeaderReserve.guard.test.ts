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
