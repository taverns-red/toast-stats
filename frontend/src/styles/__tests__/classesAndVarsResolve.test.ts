import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/* #2642 — classes and variables that resolve to nothing.
   The app's stylesheet is index.css and the files it @imports (brand.css is
   NOT one of them). A `tm-*` class used in TSX, or a `var(--x)` with no
   fallback, that nothing in that graph defines silently renders as the
   browser default: font-tm-body (204 uses) and font-tm-headline (83) generated
   no CSS under Tailwind 4, `tm-h2` set no size, and `--display` was undefined.
   This test reads the same CSS the browser gets, so it cannot be fooled the
   way the unit-test setup was (it used to import brand.css, which production
   never loads, so tests rendered classes production lacked). */

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, '../..')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** index.css plus every local file reachable through relative @imports. */
function productionCss(): string {
  const seen = new Set<string>()
  const out: string[] = []
  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return
    seen.add(file)
    const css = stripComments(readFileSync(file, 'utf-8'))
    out.push(css)
    for (const m of css.matchAll(/@import\s+['"](\.[^'"]+)['"]/g)) {
      visit(resolve(dirname(file), m[1]))
    }
  }
  visit(join(src, 'index.css'))
  return out.join('\n')
}

function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (name === '__tests__' || name === 'node_modules') continue
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, exts))
    else if (
      exts.some(e => name.endsWith(e)) &&
      !/\.(test|spec)\.[tj]sx?$/.test(name) &&
      !name.endsWith('.stories.tsx')
    )
      out.push(full)
  }
  return out
}

const css = productionCss()
const tsxSources = sourceFiles(src, ['.ts', '.tsx']).map(f =>
  readFileSync(f, 'utf-8')
)

/** Every `tm-*` token used in a string literal of non-test source. */
function usedTmTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const text of tsxSources) {
    for (const lit of text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g)) {
      for (const word of lit[2].split(/\s+/)) {
        if (word.startsWith('--')) continue // a custom property, not a class
        if (!/(^|[:!-])tm-[a-z0-9]/.test(word)) continue
        // strip variants (hover:, md:, dark:) and the important marker
        const base = word.replace(/^.*:/, '').replace(/^!/, '')
        if (/^[a-z0-9-]*tm-[a-z0-9-]*[a-z0-9]$/.test(base)) tokens.add(base)
      }
    }
  }
  return tokens
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

function tmTokenResolves(token: string): boolean {
  // A hand-written class rule: `.token` followed by a non-identifier char.
  if (new RegExp(`\\.${escapeRe(token)}(?![\\w-])`).test(css)) return true
  // A Tailwind 4 utility generated from a theme key: `<ns>-tm-<name>` reads
  // `--<themeNs>-tm-<name>`; font-* reads --font-*, the rest read --color-*.
  const m = token.match(/^([a-z]+)-(tm-[a-z0-9-]+)$/)
  if (m) {
    const [, ns, rest] = m
    const keys =
      ns === 'font'
        ? [`--font-${rest}`]
        : [`--color-${rest}`, `--${ns}-${rest}`, `--spacing-${rest}`]
    // opacity-suffixed colour utilities (`text-tm-loyal-blue-80`) are hand
    // written into @layer utilities and matched by the class rule above.
    return keys.some(k => new RegExp(`${escapeRe(k)}\\s*:`).test(css))
  }
  return false
}

describe('every tm-* class used in source resolves in production CSS (#2642)', () => {
  const tokens = [...usedTmTokens()].sort()

  it('finds the tm-* classes the source uses', () => {
    expect(tokens.length).toBeGreaterThan(20)
    expect(tokens).toContain('font-tm-body')
  })

  it('has no tm-* class that nothing in index.css defines', () => {
    const unresolved = tokens.filter(t => !tmTokenResolves(t))
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
