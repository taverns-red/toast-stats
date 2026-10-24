/**
 * Phone payments row in the World pulse (#2256). jsdom has no layout or
 * media queries (Lesson 66), so this pins the CSS contract; the geometry is
 * proven on the preview by e2e/landing-375-title-payments.smoke.ts.
 *
 *  - The row is phone-only: from 768 the Total Payments KPI card shows the
 *    same figure, so the pulse hides its copy there.
 *  - The total and delta never wrap (one line), and the row carries a fixed
 *    min-height matching its two line boxes, so the loading shell's reserve
 *    (the same component with dashes) and the loaded row are one height.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(
  join(__dirname, '../styles/components/landing-pulse.css'),
  'utf-8'
)

const rule = (sel: string, src = css) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return src.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const from768 = (
  css.match(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\n {2}\}/g) ?? []
).join('\n')

describe('World pulse phone payments row (#2256)', () => {
  it('is hidden from 768 up, where the KPI card shows payments', () => {
    expect(rule('.world-pulse__payments', from768)).toMatch(/display:\s*none/)
  })

  it('keeps the total and delta on one line', () => {
    expect(rule('.world-pulse__payments-line')).toMatch(/white-space:\s*nowrap/)
  })

  it('reserves a fixed height: tile padding + label + value line boxes', () => {
    // 8px + 18.2px label (14px floor × 1.3) + 4px gap + 24px value + 8px.
    expect(rule('.world-pulse__payments')).toMatch(/min-height:\s*64px/)
  })
})

describe('World pulse reserve matches the loaded head (#2256)', () => {
  it('gives "All regions" a 44px box as span (reserve) and link (loaded)', () => {
    // The loaded link gets base.css's 44px link floor; the reserve renders
    // a <span>, which does not. One rule for the class makes both 44px.
    const own = rule('.world-pulse__all')
    expect(own).toMatch(/min-height:\s*44px/)
    expect(own).toMatch(/display:\s*inline-flex/)
  })

  it('keeps nested caption spans on the caption line box (18.2px, not 21px)', () => {
    expect(rule('.world-pulse__caption span')).toMatch(/line-height:\s*inherit/)
  })
})
