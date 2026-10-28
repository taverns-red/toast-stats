import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/* Print CSS contract (#2299, after #427).
 *
 * Nothing pinned print behaviour before this: a selector in the "hide app
 * chrome" list could go stale (`.district-detail-tabs` outlived the tabs it
 * hid when they became routed subpages) and the subnav and phone context bar
 * printed on every page. Real page counts are measured by the preview smoke
 * (e2e/council-pack-print.smoke.ts); these checks pin the rules it depends on.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const printCss = read('../print.css')
const readIfAny = (p: string) => {
  try {
    return read(p)
  } catch {
    return ''
  }
}
const packCss = readIfAny('../components/council-pack.css')
const indexCss = read('../../index.css')

const SRC = resolve(__dirname, '../..')

/** Every non-test .ts/.tsx source under src/, concatenated. */
function sourceText(): string {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'test-utils') continue
        walk(full)
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(readFileSync(full, 'utf-8'))
      }
    }
  }
  walk(SRC)
  return out.join('\n')
}

/** The selector list of the rule that hides app chrome in print. */
function hiddenChromeSelectors(css: string): string[] {
  const m = css.match(
    /\/\* -{5} Hide app chrome -{5} \*\/([\s\S]*?)\{\s*display:\s*none\s*!important;?\s*\}/
  )
  if (!m) throw new Error('print.css: hide-app-chrome rule not found')
  return m[1]!
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

describe('print.css (#427, #2299)', () => {
  const selectors = hiddenChromeSelectors(printCss)

  it('hides only classes that still exist in the app', () => {
    const src = sourceText()
    const classes = selectors
      .filter(s => s.startsWith('.'))
      .map(s => s.slice(1).split(/[\s:[>.]/)[0]!)
    const stale = classes.filter(
      c => !new RegExp(`(["'\`\\s{])${c}(["'\`\\s}])`).test(src)
    )
    expect(stale).toEqual([])
  })

  it('hides the routed-subpage chrome: subnav, context bar, section bar', () => {
    for (const s of ['.district-subnav', '.context-bar', '.section-bar']) {
      expect(selectors).toContain(s)
    }
  })

  it('lets the paper size follow the printer (A4 or Letter)', () => {
    expect(printCss).toMatch(/@page\s*\{[^}]*size:\s*auto/)
    expect(printCss).not.toMatch(/size:\s*letter/)
  })

  it('leaves the source line to the pack footer on pack routes', () => {
    expect(printCss).toMatch(
      /\.app-shell__main:has\(\.council-pack\)::after\s*\{[^}]*content:\s*none/
    )
  })
})

describe('council-pack.css (#2299)', () => {
  it('is imported by index.css before print.css', () => {
    const pack = indexCss.indexOf("'./styles/components/council-pack.css'")
    const print = indexCss.indexOf("'./styles/print.css'")
    expect(pack).toBeGreaterThan(-1)
    expect(pack).toBeLessThan(print)
  })

  it('keeps sections whole and forces the division roster onto page 2', () => {
    const print = packCss.match(/@media print\s*\{[\s\S]*\n\}/)?.[0] ?? ''
    expect(print).toMatch(
      /\.council-pack__section[^{]*\{[^}]*break-inside:\s*avoid/
    )
    expect(print).toMatch(
      /\.council-pack__roster--own-page[^{]*\{[^}]*break-before:\s*page/
    )
    // The roster is exactly the paper's width whatever the fallback font:
    // an auto layout ran 30px over on CI's Linux fonts.
    expect(print).toMatch(
      /\.council-pack__roster-table\s*\{[^}]*table-layout:\s*fixed/
    )
    // Screen-only controls never print.
    expect(print).toMatch(
      /\.council-pack__screen-only[^{]*\{[^}]*display:\s*none/
    )
  })

  it('uses the legacy palette only (no --rt-stats, no raw colours)', () => {
    expect(packCss).not.toMatch(/--rt-stats/)
    // Outside @media print, colours come from tokens, never hex literals.
    const screen = packCss
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media print\s*\{[\s\S]*\n\}/, '')
    expect(screen).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
