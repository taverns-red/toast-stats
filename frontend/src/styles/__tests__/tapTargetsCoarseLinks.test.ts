// Row and table links are a 44px target under a coarse pointer at any width,
// and padded links centre their text (#2645).
//
// At 768-1023 on a touch device (a tablet, a phone in landscape) the desktop
// table chrome renders, and its name links were 17px tall. jsdom does no
// layout, so the contract is pinned on the stylesheet; e2e/touch-targets.smoke.ts
// measures the rendered boxes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function load(name: string): string {
  return readFileSync(
    resolve(__dirname, '../components', name),
    'utf-8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Body of the first `@media (pointer: coarse)` block (brace-balanced). */
function coarseBlock(css: string): string {
  const start = css.indexOf('@media (pointer: coarse)')
  if (start < 0) throw new Error('no coarse block')
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unbalanced')
}

function decls(css: string, sel: string): Record<string, string> {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[}\\s,])${escaped}\\s*[,{]`).exec(css)
  if (!m) throw new Error(`rule not found: ${sel}`)
  const body = css.slice(css.indexOf('{', m.index), css.indexOf('}', m.index))
  return Object.fromEntries(
    body
      .slice(1)
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}

const TABLE_LINK =
  ':is(.dt, .entity-table, .action-table, .race-table) :is(th, td) > a[href]'

describe('coarse-pointer row and table links (#2645)', () => {
  const tap = load('tap-targets.css')

  it('table cell links are a centred 44px flex box under a coarse pointer', () => {
    const r = decls(coarseBlock(tap), TABLE_LINK)
    expect(r['display']).toBe('inline-flex')
    expect(r['align-items']).toBe('center')
    expect(r['min-height']).toBe('44px')
  })

  it('the Print pack link is a centred 44px box beside its 44px button', () => {
    const r = decls(tap, '.area-council-tools .council-pack-link a')
    expect(r['display']).toBe('inline-flex')
    expect(r['align-items']).toBe('center')
    expect(r['min-height']).toBe('44px')
  })

  it('World pulse region links are a 44px box at every width', () => {
    const pulse = load('landing-pulse.css')
    const r = decls(pulse, '.world-pulse__table tbody th a')
    expect(r['display']).toBe('inline-flex')
    expect(r['align-items']).toBe('center')
    expect(r['min-height']).toBe('44px')
  })
})
