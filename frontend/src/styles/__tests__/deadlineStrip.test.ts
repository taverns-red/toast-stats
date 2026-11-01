import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #2429 — CSS contract for the "See all deadlines" toggle. The touch-target
   smoke (e2e/touch-targets.smoke.ts) measures the toggle's own box, so a
   44px floor must hold on the element itself: no `min-height: 0`, and no
   invisible pseudo-element hit area standing in for it. jsdom cannot see
   geometry; these regexes pin the rules the smoke depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/deadline-strip.css'),
  'utf-8'
)

const rules = (selector: string): string[] => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${esc}\\s*\\{[^}]*\\}`, 'g'))].map(
    m => m[0]
  )
}

describe('deadline-strip.css toggle (#2429)', () => {
  it('gives the toggle its own 44px-tall box', () => {
    const toggle = rules('.deadline-strip__toggle ').join('\n')
    expect(toggle).toMatch(/min-height:\s*44px/)
    expect(toggle).not.toMatch(/min-height:\s*0/)
  })

  it('reserves the same 44px row in the loading strip', () => {
    expect(rules('.deadline-strip__toggle-slot ').join('\n')).toMatch(
      /min-height:\s*44px/
    )
  })

  /* Run 41354022851: at 1280 the strip is one baseline-aligned row. An empty
     slot's baseline is its bottom edge, so the loading lead sat 17px lower
     than the loaded one (CLS 0.085 on the division page). The slot must
     centre a line of text exactly as the toggle does. */
  it('aligns the loading slot on a text baseline, like the toggle', () => {
    for (const sel of [
      '.deadline-strip__toggle ',
      '.deadline-strip__toggle-slot ',
    ]) {
      const rule = rules(sel).join('\n')
      expect(rule, sel).toMatch(/display:\s*inline-flex/)
      expect(rule, sel).toMatch(/align-items:\s*center/)
    }
  })

  it('does not fake the touch target with an overhanging pseudo-element', () => {
    expect(css).not.toMatch(/\.deadline-strip__toggle::(after|before)/)
  })
})
