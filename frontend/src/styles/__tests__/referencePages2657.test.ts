// Reference-page link, measure and layout contracts (#2657, Fable UX review
// REF-07, REF-20, REF-24, REF-31, REF-32).
//
// jsdom applies no stylesheet, so an axe `link-in-text-block` run there sees
// unstyled links on both main and a fix and proves nothing. The contract is
// pinned on the stylesheet instead; the PR screenshots show the rendered
// result.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function load(name: string): string {
  return readFileSync(
    resolve(__dirname, '../components', name),
    'utf-8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Declarations of the first rule whose selector list contains `sel`. */
function decls(css: string, sel: string): Record<string, string> {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[}{;\\s,])${escaped}\\s*[,{]`).exec(css)
  if (!m) throw new Error(`rule not found: ${sel}`)
  const open = css.indexOf('{', m.index + m[1]!.length)
  const body = css.slice(open + 1, css.indexOf('}', open))
  return Object.fromEntries(
    body
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}

/** Bodies of every `@media <query>` block (brace-balanced), joined. */
function mediaBlocks(css: string, query: string): string {
  const bodies: string[] = []
  let start = css.indexOf(`@media ${query}`)
  while (start >= 0) {
    const open = css.indexOf('{', start)
    let depth = 0
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++
      if (css[i] === '}' && --depth === 0) {
        bodies.push(css.slice(open + 1, i))
        break
      }
    }
    start = css.indexOf(`@media ${query}`, open)
  }
  return bodies.join('\n}\n')
}

describe('REF-07 links on /clubs and /clubs/race look like links', () => {
  const race = load('clubs-race.css')

  it('prose links in the basis box use the link colour and an underline', () => {
    const r = decls(race, '.race-basis a')
    expect(r['color']).toBe('var(--link)')
    expect(r['text-decoration']).toMatch(/underline/)
  })

  it('race-table links use the link colour', () => {
    const r = decls(race, '.race-table a')
    expect(r['color']).toBe('var(--link)')
  })
})

describe('REF-32 prose keeps a readable measure', () => {
  // 34.8em is 70 of Source Sans 3's "0"; ch would re-wrap at the font swap
  // (fontIndependentWidths.test.ts).
  it('basis-box paragraphs stop at about 70 characters', () => {
    expect(decls(load('clubs-race.css'), '.race-basis p')['max-width']).toBe(
      '34.8em'
    )
  })

  it('page body copy stops at about 70 characters', () => {
    expect(
      decls(load('app-shell.css'), '.placeholder-page__body')['max-width']
    ).toBe('34.8em')
  })
})

describe('REF-20 the MCP one-liner wraps instead of clipping', () => {
  it('the command snippet wraps, breaking anywhere if it must', () => {
    const r = decls(load('app-shell.css'), '.mcp-page__snippet--command')
    expect(r['white-space']).toBe('pre-wrap')
    expect(r['overflow-wrap']).toBe('anywhere')
  })
})

describe('REF-24 History year chips read as links', () => {
  it('chip links show an underline on hover', () => {
    const r = decls(load('app-shell.css'), 'a.history-page-year-chip:hover')
    expect(r['text-decoration']).toMatch(/underline/)
  })
})

describe('REF-31 Awards uses two columns from 640px', () => {
  it('the award grid has two columns at 640px', () => {
    const block = mediaBlocks(load('app-shell.css'), '(min-width: 640px)')
    expect(decls(block, '.awards-page__grid')['grid-template-columns']).toBe(
      'repeat(2, 1fr)'
    )
  })
})
