/**
 * Static guard for the Recognition legend's responsive contract (#1361).
 *
 * The legend must be INLINE at ≥640px and collapsed behind a disclosure below
 * it, so it never eats the mobile fold (gap (c) on #1359). jsdom has no layout
 * engine and no media queries (Lesson 66), so — like
 * `rankingsColumnPriority.guard.test.ts` — this reads the CSS as text rather
 * than mounting anything. Reading by `fs` also keeps it clear of R22.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(
  join(__dirname, '../styles/components/app-shell.css'),
  'utf-8'
)

describe('recognition legend responsive contract (#1361)', () => {
  it('hides the item list by default and shows it when opened', () => {
    expect(css).toMatch(/\.recognition-legend__items\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(
      /\.recognition-legend__items\[data-open='true'\]\s*\{[^}]*display:\s*flex/
    )
  })

  // #2249 — the legend is reference content between the filters and the
  // data; it stays behind its disclosure at EVERY width now, so no
  // breakpoint may hide the toggle or force the list open.
  it('stays a disclosure at every width (#2249)', () => {
    const inMedia = css.match(
      /@media[^{]*\{[\s\S]*?recognition-legend__(?:toggle|items)[\s\S]*?\n\s{2}\}/g
    )
    const scoped = (inMedia ?? []).join('\n')
    expect(scoped).not.toMatch(
      /\.recognition-legend__toggle\s*\{[^}]*display:\s*none/
    )
    expect(scoped).not.toMatch(
      /\.recognition-legend__items\s*\{[^}]*display:\s*flex/
    )
  })

  it('floors the disclosure at the 44px touch target (WCAG 2.5.5)', () => {
    expect(css).toMatch(
      /\.recognition-legend__toggle\s*\{[\s\S]{0,400}?min-height:\s*44px/
    )
  })

  it('keeps badges from widening the sticky District column', () => {
    // Up to three labelled award badges plus a tier badge plus the Star and
    // the "· R<n>" suffix share that cell at 375px. Each badge stays on one
    // line and the CELL wraps — the reverse would push the metrics off-screen.
    // Scoped by the rule's braces rather than a character window: the block
    // carries a long explanatory comment, and a fixed window silently stops
    // covering the declaration as the comment grows.
    const rule = /\.recognition-badge\s*\{([^}]*)\}/.exec(css)
    expect(rule, '.recognition-badge rule not found').not.toBeNull()
    expect(rule![1]).toMatch(/white-space:\s*nowrap/)
  })
})
