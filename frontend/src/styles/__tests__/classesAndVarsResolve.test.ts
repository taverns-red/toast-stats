import { describe, it, expect } from 'vitest'
import { productionCss, sourceTexts } from './cssColor'
import { extractTmTokens, tmTokenResolves } from './tmClassGuard'

/* #2642 — classes and variables that resolve to nothing.
   The app's stylesheet is index.css and the files it @imports (brand.css is
   NOT one of them). A `tm-*` class used in TSX, or a `var(--x)` with no
   fallback, that nothing in that graph defines silently renders as the
   browser default: font-tm-body (204 uses) and font-tm-headline (83) generated
   no CSS under Tailwind 4, `tm-h2` set no size, and `--display` was undefined.
   This test reads the same CSS the browser gets, so it cannot be fooled the
   way the unit-test setup was (it used to import brand.css, which production
   never loads, so tests rendered classes production lacked). */

const css = productionCss()
const tsxSources = sourceTexts()

describe('the guard itself is strict (#2642)', () => {
  const themed = '@theme { --color-tm-loyal-blue: #004165; }'

  it('reads multi-line template literals', () => {
    const src = 'const c = `\n  font-tm-headline\n  tm-touch-target\n`'
    expect([...extractTmTokens([src])]).toEqual(
      expect.arrayContaining(['font-tm-headline', 'tm-touch-target'])
    )
  })

  it('keeps /N colour-modifier tokens and checks their base colour', () => {
    const tokens = extractTmTokens([
      '"hover:bg-tm-loyal-blue/90 bg-tm-nope/20"',
    ])
    expect([...tokens]).toEqual(
      expect.arrayContaining(['bg-tm-loyal-blue/90', 'bg-tm-nope/20'])
    )
    expect(tmTokenResolves(themed, 'bg-tm-loyal-blue/90')).toBe(true)
    expect(tmTokenResolves(themed, 'bg-tm-nope/20')).toBe(false)
  })

  it('does not count compound or descendant selectors as a definition', () => {
    // `.tm-header-title.tm-h2` is how tm-h2 hid for months.
    expect(tmTokenResolves('.tm-header-title.tm-h2 { x: 1 }', 'tm-h2')).toBe(
      false
    )
    expect(tmTokenResolves('.tm-card .tm-h2 { x: 1 }', 'tm-h2')).toBe(false)
    expect(tmTokenResolves('.tm-h2.tm-big { x: 1 }', 'tm-h2')).toBe(false)
  })

  it('counts a standalone rule, a selector list entry, and a pseudo-class', () => {
    expect(tmTokenResolves('.tm-h2 { x: 1 }', 'tm-h2')).toBe(true)
    expect(tmTokenResolves('.a,\n.tm-h2 { x: 1 }', 'tm-h2')).toBe(true)
    expect(tmTokenResolves('.tm-h2:hover { x: 1 }', 'tm-h2')).toBe(true)
    expect(tmTokenResolves('@media (a) { .tm-h2 { x: 1 } }', 'tm-h2')).toBe(
      true
    )
  })
})

describe('every tm-* class used in source resolves in production CSS (#2642)', () => {
  const tokens = [...extractTmTokens(tsxSources)].sort()

  it('finds the tm-* classes the source uses', () => {
    expect(tokens.length).toBeGreaterThan(20)
    expect(tokens).toContain('font-tm-body')
  })

  it('has no tm-* class that nothing in index.css defines', () => {
    const unresolved = tokens.filter(t => !tmTokenResolves(css, t))
    expect(unresolved).toEqual([])
  })
})

describe('every var(--x) without a fallback is defined (#2642)', () => {
  /** Custom properties set from script (style={{ '--x': v }}, setProperty). */
  const scriptDefined = new Set<string>()
  for (const text of tsxSources) {
    for (const m of text.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]/g))
      scriptDefined.add(m[1])
  }

  const defined = new Set<string>()
  for (const m of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1])

  // var(--x) with NO fallback: the name is followed directly by `)`.
  const used = new Set<string>()
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g))
    used.add(m[1])

  it('finds the variables the stylesheets use', () => {
    expect(used.size).toBeGreaterThan(50)
  })

  it('defines each one in the stylesheet graph or from script', () => {
    const undefinedVars = [...used]
      // Tailwind internals are defined by the utilities that read them.
      .filter(v => !v.startsWith('--tw-'))
      .filter(v => !defined.has(v) && !scriptDefined.has(v))
      .sort()
    expect(undefinedVars).toEqual([])
  })
})

describe('no Tailwind 3 opacity utilities or literal CSS in class strings (#2642)', () => {
  // Tailwind 4 removed bg-opacity-N / text-opacity-N / border-opacity-N; use
  // the colour modifier (bg-black/10). Without it the colour renders at full
  // strength. A `font-family: ...` declaration inside a className string is
  // plain text to the browser, not a style.
  const offenders = (re: RegExp) =>
    tsxSources.flatMap(text => text.match(re) ?? [])

  it('uses no *-opacity-N utility', () => {
    expect(
      offenders(
        /(?<![\w-])(?:bg|text|border|ring|divide|placeholder)-opacity-\d+/g
      )
    ).toEqual([])
  })

  it('has no CSS declaration written into a class string', () => {
    expect(offenders(/^\s*font-family:\s*var\(--[\w-]+\)\s*$/gm)).toEqual([])
  })
})
