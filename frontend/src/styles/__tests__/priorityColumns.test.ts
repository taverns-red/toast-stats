import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1834 — CSS contract for PriorityColumnsTable. Fit (no horizontal
   scroll), one-line headers, 44px chips and the full-screen sheet are
   layout behaviours jsdom cannot see; the preview smoke
   (e2e/priority-columns.smoke.ts) measures them by bounding box. These
   regexes pin the rules it depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const css = read('../components/priority-columns.css')
const indexCss = read('../../index.css')

const rule = (selector: string): string => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${esc}\\s*\\{[^}]*\\}`))?.[0] ?? ''
}
const px = (block: string, prop: string): number =>
  Number(block.match(new RegExp(`${prop}:\\s*(\\d+)px`))?.[1] ?? NaN)

describe('priority-columns.css (#1834)', () => {
  it('is imported by index.css after the context bar (bottom sheet base)', () => {
    const at = indexCss.indexOf(
      "@import './styles/components/priority-columns.css'"
    )
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(
      indexCss.indexOf("@import './styles/components/context-bar.css'")
    )
  })

  it('the table fits its container: fixed layout at 100% width', () => {
    const t = rule('.priority-columns__table')
    expect(t).toMatch(/table-layout:\s*fixed/)
    expect(t).toMatch(/width:\s*100%/)
  })

  it('header cells stay on one line', () => {
    expect(rule('.priority-columns__table th')).toMatch(/white-space:\s*nowrap/)
  })

  it('identity cells ellipsize instead of widening the table', () => {
    const id = rule('.priority-columns__identity')
    expect(id).toMatch(/overflow:\s*hidden/)
    expect(id).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('data cells are ≥14px', () => {
    expect(
      px(rule('.priority-columns__table td'), 'font-size')
    ).toBeGreaterThanOrEqual(14)
  })

  it('chips are 44px tap targets, ≥14px text, ≥8px apart, and wrap (no blind scroll-row)', () => {
    const chip = rule('.priority-columns__chip')
    expect(px(chip, 'min-height')).toBeGreaterThanOrEqual(44)
    expect(px(chip, 'font-size')).toBeGreaterThanOrEqual(14)
    const row = rule('.priority-columns__chips')
    expect(row).toMatch(/flex-wrap:\s*wrap/)
    expect(px(row, 'gap')).toBeGreaterThanOrEqual(8)
  })

  it('the Full table button is a 44px target', () => {
    expect(
      px(rule('.priority-columns__full'), 'min-height')
    ).toBeGreaterThanOrEqual(44)
  })

  it('the full sheet fills the viewport and its region scrolls both axes', () => {
    const full = rule('.bottom-sheet.bottom-sheet--full')
    expect(full).toMatch(/height:\s*100dvh/)
    expect(full).toMatch(/max-height:\s*100dvh/)
    expect(full).toMatch(/border-radius:\s*0/)
    expect(rule('.priority-columns__sheet-region')).toMatch(/overflow:\s*auto/)
  })
})
