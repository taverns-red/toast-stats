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

  describe('World pulse rows', () => {
    const pulse = load('landing-pulse.css')
    const QUERY = '@media (max-width: 767.98px), (pointer: coarse)'
    const touch = mediaBlock(pulse, QUERY)

    it('are 44px link boxes on a phone or coarse pointer only', () => {
      const r = decls(touch, '.world-pulse__table tbody th a')
      expect(r['min-height']).toBe('44px')
      expect(r['line-height']).toBe('44px')
      expect(decls(touch, '.world-pulse__table tbody tr')['height']).toBe(
        '45px'
      )
      expect(decls(touch, '.world-pulse__regions')['min-height']).toBe(
        'calc(32px + 5 * 45px + 44px)'
      )
    })

    it('keep the compact 32px rows for a desktop mouse', () => {
      const outside = withoutMedia(pulse, QUERY)
      expect(decls(outside, '.world-pulse__regions')['min-height']).toBe(
        'calc(6 * 32px + 44px)'
      )
      expect(outside).not.toMatch(/tbody tr\s*\{[^}]*height:\s*45px/)
      expect(outside).not.toMatch(/tbody th a\s*\{[^}]*min-height/)
    })

    it('truncate a long region label with an ellipsis', () => {
      const r = decls(touch, '.world-pulse__table tbody th a')
      expect(r['display']).toBe('block')
      expect(r['overflow']).toBe('hidden')
      expect(r['white-space']).toBe('nowrap')
      expect(r['text-overflow']).toBe('ellipsis')
    })
  })

  it('race-table body cells drop vertical padding under a coarse pointer', () => {
    const race = load('clubs-race.css')
    const r = decls(coarseBlock(race), '.race-table tbody th')
    expect(r['padding-top']).toBe('0')
    expect(r['padding-bottom']).toBe('0')
  })
})

/** [start, end) spans of every block whose at-rule header equals `query`. */
function spans(css: string, query: string): [number, number][] {
  const out: [number, number][] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(query, from)
    if (start < 0) break
    const open = css.indexOf('{', start)
    let depth = 0
    let end = -1
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++
      if (css[i] === '}' && --depth === 0) {
        end = i + 1
        break
      }
    }
    if (end < 0) throw new Error('unbalanced')
    out.push([open + 1, end - 1])
    from = end
  }
  if (out.length === 0) throw new Error(`no ${query}`)
  return out
}

/** Inner text of every block with this at-rule header, joined. */
function mediaBlock(css: string, query: string): string {
  return spans(css, query)
    .map(([a, b]) => css.slice(a, b))
    .join('\n')
}

/** The stylesheet with every block of this at-rule removed. */
function withoutMedia(css: string, query: string): string {
  let out = css
  for (const [a, b] of [...spans(css, query)].reverse()) {
    out = out.slice(0, a) + out.slice(b)
  }
  return out
}
