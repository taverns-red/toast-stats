import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1806 — links in the "What Changed" feed (club names, and the transfer
   counterpart "District N") must look like links. The shared
   `.clubs-name-link` style (app-shell.css, @layer brand) hides the underline
   until hover, because it was built for links inside an already-clickable
   row. A feed row is not clickable, so there the link showed as plain text
   (WCAG 1.4.1). The feed adopts the affordance its own realignment-notice
   link already uses: inherited ink, an underline, a thicker underline on
   hover, and an --rt-stats focus ring. Underline, not colour, marks the link,
   so it works in both themes without new tokens. jsdom cannot compute
   cascade-layer styles, so this pins the rule; the preview screenshots show
   the result. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/district-changes.css'),
  'utf-8'
)

/** The declaration block of the first rule whose selector list matches. */
const ruleBody = (selector: RegExp): string => {
  const m = css.match(
    new RegExp(`(?:^|\\n)([^{}]*${selector.source}[^{}]*)\\{([^}]*)\\}`)
  )
  return m?.[2] ?? ''
}

describe('changes feed link affordance (#1806)', () => {
  it('underlines every link in a change row at rest', () => {
    const body = ruleBody(/\.changes-group__item a(?![\w:-])/)
    expect(body).toMatch(/text-decoration(?:-line)?:\s*underline/)
    expect(body).toMatch(/text-underline-offset:/)
    // Inherited ink keeps contrast in both themes (no hard-coded colour).
    expect(body).toMatch(/color:\s*inherit/)
  })

  it('thickens the underline on hover', () => {
    expect(ruleBody(/\.changes-group__item a:hover/)).toMatch(
      /text-decoration-thickness:\s*2px/
    )
  })

  it('gives keyboard users a focus ring in the product accent token', () => {
    expect(ruleBody(/\.changes-group__item a:focus-visible/)).toMatch(
      /outline:\s*2px solid var\(--rt-stats/
    )
  })
})
