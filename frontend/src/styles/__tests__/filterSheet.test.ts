import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1836 — CSS contract for the Filter & sort sheet. Target sizes and the
   iOS no-zoom font size are CSS-only behaviours jsdom cannot measure; the
   preview screenshots check them in real pixels. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const css = read('../components/filter-sheet.css')
const indexCss = read('../../index.css')
const rule = (sel: string) =>
  css.match(
    new RegExp(`\\n {2}${sel.replace(/[.[\]'=]/g, '\\$&')}\\s*\\{[^}]*\\}`)
  )?.[0] ?? ''

describe('filter-sheet.css (#1836)', () => {
  it('is imported by index.css', () => {
    expect(indexCss).toMatch(
      /@import '\.\/styles\/components\/filter-sheet\.css'/
    )
  })

  it('keeps the select at 16px so iOS does not zoom on focus', () => {
    expect(rule('.filter-sheet__select')).toMatch(/font-size:\s*16px/)
    expect(rule('.filter-sheet__select')).toMatch(/min-height:\s*44px/)
  })

  it('makes chips at least 44px with 8px gaps', () => {
    expect(rule('.filter-sheet__chip')).toMatch(/min-height:\s*44px/)
    expect(rule('.filter-sheet__chips')).toMatch(/gap:\s*8px/)
  })

  it('pins the apply/clear footer to the bottom of the scrolling body', () => {
    expect(rule('.filter-sheet__footer')).toMatch(/position:\s*sticky/)
  })

  it('uses semantic tokens only — no raw colours (dark mode via R10)', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(code).not.toMatch(/rgba?\(/)
  })
})
