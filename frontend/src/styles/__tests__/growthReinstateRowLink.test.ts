import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #3115 — each Can reinstate row is a stretched link: the name link's
   ::after covers its row. The row must be positioned with a plain selector.
   If only a :has() rule positioned it, a browser without :has() would
   stretch every ::after over the same ancestor, and the last row's link
   would catch clicks across the whole table. So the stretch and the hover
   tint live inside @supports selector(:has(*)), and old browsers fall back
   to name-only links. jsdom can't compute this cascade, so this pins the
   rules in the file. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/growth.css'),
  'utf-8'
)

const SUPPORTS = /@supports selector\(:has\(\*\)\) \{([\s\S]*?)\n\}/g

describe('growth.css Can reinstate row link (#3115)', () => {
  it('positions each row with a plain selector, not :has()', () => {
    const rule = css.match(/#growth-reinstate tbody tr \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/position:\s*relative/)
  })

  it('stretches the link and tints the row only where :has() works', () => {
    const blocks = [...css.matchAll(SUPPORTS)]
    const inside = blocks.map(m => m[1]!).join('\n')
    expect(inside).toMatch(
      /\.growth-reinstate__row-link::after \{[^}]*inset:\s*0/
    )
    expect(inside).toMatch(/:has\(\.growth-reinstate__row-link\):hover/)

    const outside = blocks.reduce((s, m) => s.replace(m[0], ''), css)
    expect(outside).not.toMatch(
      /\.growth-reinstate__row-link::after \{[^}]*inset/
    )
    expect(outside).not.toMatch(/:has\(\.growth-reinstate__row-link\)/)
  })
})
