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

/** Every rule whose selector list names `selector` (media blocks included). */
const rules = (selector: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m =>
      m[1]!
        .split(',')
        .map(part => part.replace(/\/\*[\s\S]*?\*\//g, '').trim())
        .includes(selector.trim())
    )
    .map(m => `${m[1]!.trim()} {${m[2]}}`)

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
    const align = (sel: string) =>
      rules(sel)
        .map(r => /align-items:\s*([\w-]+)/.exec(r)?.[1])
        .filter(Boolean)
        .join(',')
    for (const sel of [
      '.deadline-strip__toggle ',
      '.deadline-strip__toggle-slot ',
    ]) {
      expect(rules(sel).join('\n'), sel).toMatch(/display:\s*inline-flex/)
    }
    expect(align('.deadline-strip__toggle-slot ')).toBe(
      align('.deadline-strip__toggle ')
    )
  })

  it('does not fake the touch target with an overhanging pseudo-element', () => {
    expect(css).not.toMatch(/\.deadline-strip__toggle::(after|before)/)
  })
})

/* Preview run 41355957532: a 44px toggle row cost the 375 Overview 23px and
   took it to 4011 > PAGE_MAX_H. On phones the toggle sits in a right-hand
   column beside the lead and the first deadline instead, spanning rows that
   already exist, so the strip is no taller. */
describe('deadline-strip.css phone layout (#2429)', () => {
  const phone = css.slice(0, css.indexOf('@media'))
  const phoneRule = (selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return phone.match(new RegExp(`${esc}\\s*\\{[^}]*\\}`))?.[0] ?? ''
  }

  it('lays the strip out as a two-column grid', () => {
    expect(phoneRule('.deadline-strip ')).toMatch(/display:\s*grid/)
    expect(phoneRule('.deadline-strip__head ')).toMatch(/display:\s*contents/)
  })

  it('spans the toggle over the lead row and the list beside it', () => {
    for (const sel of [
      '.deadline-strip__toggle ',
      '.deadline-strip__toggle-slot ',
    ]) {
      const rule = phoneRule(sel)
      expect(rule, sel).toMatch(/grid-column:\s*2/)
      expect(rule, sel).toMatch(/grid-row:\s*1\s*\/\s*span 2/)
    }
  })
})
