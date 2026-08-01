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

  it('goes inline at 640px, retiring the disclosure', () => {
    const at640 =
      /@media\s*\(min-width:\s*640px\)\s*\{([\s\S]*?)\n\s{2}\}/.exec(css)
    // The 640px block must both reveal the list and hide the toggle — half of
    // that leaves either a permanently collapsed legend or a redundant button
    // sitting above an already-visible list.
    const blocks = css.match(
      /@media\s*\(min-width:\s*640px\)\s*\{[\s\S]*?recognition-legend[\s\S]*?\n\s{2}\}/g
    )
    expect(at640 ?? blocks, 'no 640px block found').not.toBeNull()
    const scoped = (blocks ?? []).join('\n')
    expect(scoped).toMatch(
      /\.recognition-legend__toggle\s*\{[^}]*display:\s*none/
    )
    expect(scoped).toMatch(
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
    expect(css).toMatch(
      /\.recognition-badge\s*\{[\s\S]{0,500}?white-space:\s*nowrap/
    )
  })
})
