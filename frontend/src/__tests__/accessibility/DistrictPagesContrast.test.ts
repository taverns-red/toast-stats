/**
 * District-page contrast pairings (#1660).
 *
 * An axe `wcag2aa` sweep of /district/:id and its subpages, in both themes,
 * found text that misses WCAG AA 4.5:1 because a foreground and its surface
 * were never remapped together (Lesson 94):
 *
 *  - dark  header eyebrow: --maroon-500 (#7b1828) on --bg, 1.83:1
 *  - dark  Divisions "Distinguished Program criteria" tier names, 1.78–3.82:1
 *  - light rank-change chip "+N": --green-600 on --loyal-50, 4.27:1
 *  - dark  rank-change chip "-N": --red-600 on the 8% red tint, 4.45:1
 *  - dark  "limited data" banner: light ink on the gold callout, 1.44–1.72:1
 *  - dark  Smedley/Select club badge: true-maroon on happy-yellow-30, 4.07:1
 *  - dark  Trends "Overall Improvement": text-green-900 kept #14532d, 1.65:1
 *  - light Trends "-N" deltas: text-red-600 on bg-red-50, 4.41:1
 *  - both  Division progress panel: `bg-tm-loyal-blue/10` compiles to an
 *          oklab() color-mix that axe cannot resolve (ratio NaN), so the
 *          panel gets an explicit rgba fill in each theme.
 *
 * Every fix is a CSS rule at `[data-theme]` scope (R10). jsdom does no layout
 * or cascade, so — as in TierChartDarkModeContrast.test.ts — the contract is
 * pinned on the stylesheets: each rule must exist and the colour it sets must
 * clear AA on the surface it lands on.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const readCss = (p: string) =>
  stripComments(readFileSync(resolve(stylesDir, p), 'utf8'))

const tokensCss = readCss('tokens/redesign.css')
const shellCss = readCss('components/app-shell.css')
const darkCss = readCss('dark-mode.css')

function parseBlock(css: string, selector: string): Map<string, string> {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`block ${selector} not found`)
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  const map = new Map<string, string>()
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1].trim(), d[2].trim())
  }
  return map
}

/** Declarations of every rule whose selector list contains `sel` exactly. */
function declsFor(css: string, sel: string): string {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '))
    if (selectors.includes(sel)) out.push(m[2])
  }
  if (!out.length) throw new Error(`no rule for ${sel}`)
  return out.join(';')
}

const light = parseBlock(tokensCss, ':root')
const dark = parseBlock(tokensCss, "[data-theme='dark']")
type Theme = Map<string, string>

/** Resolve a CSS value (hex or var(--x)) against a theme's tokens. */
function resolveColor(value: string, theme: Theme): string {
  const v = value.replace(/!important/, '').trim()
  const ref = /^var\((--[\w-]+)\)$/.exec(v)
  if (ref) {
    const t = theme.get(ref[1]!)
    if (!t) throw new Error(`token ${ref[1]} not defined`)
    return resolveColor(t, theme)
  }
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`unresolvable colour ${v}`)
  return v.toLowerCase()
}

function prop(decls: string, name: string): string {
  const m = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`).exec(decls)
  if (!m) throw new Error(`no ${name} in ${decls}`)
  return m[1]!.trim()
}

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
const toHex = (rgb: number[]) =>
  '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')

/** Composite a `background-color` value (hex, var(), or rgba()) over `base`. */
function fillOver(value: string, base: string, theme: Theme): string {
  const v = value.replace(/!important/, '').trim()
  const rgba =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(v)
  if (!rgba) return resolveColor(v, theme)
  const a = Number(rgba[4])
  const b = hexToRgb(base)
  return toHex([1, 2, 3].map((i, k) => Number(rgba[i]) * a + b[k]! * (1 - a)))
}

const AA = 4.5
const ratio = (fg: string, bg: string) => calculateContrastRatio(fg, bg)
const expectAA = (fg: string, bg: string, what: string) => {
  const r = ratio(fg, bg)
  expect(
    r,
    `${what}: ${fg} on ${bg} = ${r.toFixed(2)}:1`
  ).toBeGreaterThanOrEqual(AA)
}

describe('district page contrast (#1660)', () => {
  it('dark header eyebrow clears AA on the dark page and surface', () => {
    const fg = resolveColor(
      prop(
        declsFor(
          shellCss,
          "[data-theme='dark'] .district-detail-page-header__eyebrow"
        ),
        'color'
      ),
      dark
    )
    for (const bg of ['--bg', '--surface'])
      expectAA(fg, dark.get(bg)!, `eyebrow on ${bg}`)
  })

  it.each(['presidents', 'select', 'distinguished', 'loss'])(
    'dark criteria tier name --%s clears AA on the dark page and surface',
    tier => {
      const fg = resolveColor(
        prop(
          declsFor(
            shellCss,
            `[data-theme='dark'] .ddp-criteria__level-name--${tier}`
          ),
          'color'
        ),
        dark
      )
      for (const bg of ['--bg', '--surface'])
        expectAA(fg, dark.get(bg)!, `${tier} on ${bg}`)
    }
  )

  describe('rank change chip', () => {
    // The chip sits in table rows (surface / gray-50 zebra) and mobile panels.
    const lightRows = ['#ffffff', '#f9fafb', light.get('--surface-3')!]
    const darkRows = ['--bg', '--surface', '--surface-2', '--surface-3'].map(
      t => dark.get(t)!
    )

    it.each(['improved', 'declined', 'unchanged'])(
      '%s chip text clears AA in both themes',
      kind => {
        const base = declsFor(shellCss, `.rank-change-chip--${kind}`)
        let darkDecls = base
        try {
          darkDecls =
            base +
            ';' +
            declsFor(shellCss, `[data-theme='dark'] .rank-change-chip--${kind}`)
        } catch {
          // no dark override: the base tokens remap on their own
        }
        const lastProp = (d: string, n: string) => {
          const all = [
            ...d.matchAll(new RegExp(`(?:^|[;{\\s])${n}\\s*:\\s*([^;]+)`, 'g')),
          ]
          return all[all.length - 1]![1]!.trim()
        }
        for (const [theme, rows, decls] of [
          [light, lightRows, base],
          [dark, darkRows, darkDecls],
        ] as const) {
          const fg = resolveColor(lastProp(decls, 'color'), theme)
          for (const row of rows) {
            const bg = fillOver(lastProp(decls, 'background-color'), row, theme)
            expectAA(fg, bg, `${kind} chip over ${row}`)
          }
        }
      }
    )
  })

  it('dark limited-data banner keeps dark ink on its gold fill', () => {
    const gold = fillOver(
      prop(
        declsFor(darkCss, "[data-theme='dark'] .bg-tm-happy-yellow"),
        'background-color'
      ),
      dark.get('--bg')!,
      dark
    )
    for (const sel of ['.text-tm-black', '.text-gray-600']) {
      const fg = resolveColor(
        prop(
          declsFor(darkCss, `[data-theme='dark'] .bg-tm-happy-yellow ${sel}`),
          'color'
        ),
        dark
      )
      expectAA(fg, gold, `banner ${sel}`)
    }
  })

  it('dark true-maroon badge text clears AA on the happy-yellow-30 tint', () => {
    const bg = fillOver(
      prop(
        declsFor(darkCss, "[data-theme='dark'] .bg-tm-happy-yellow-30"),
        'background-color'
      ),
      dark.get('--surface')!,
      dark
    )
    const fg = resolveColor(
      prop(
        declsFor(
          darkCss,
          "[data-theme='dark'] .bg-tm-happy-yellow-30.text-tm-true-maroon"
        ),
        'color'
      ),
      dark
    )
    expectAA(fg, bg, 'maroon on happy-yellow-30')
  })

  it.each(['.text-green-900', '.text-red-900'])(
    'dark %s is lifted to clear AA on its tinted surface',
    sel => {
      const fg = resolveColor(
        prop(declsFor(darkCss, `[data-theme='dark'] ${sel}`), 'color'),
        dark
      )
      const tint = sel.includes('green') ? '.bg-green-50' : '.bg-red-50'
      const bg = fillOver(
        prop(
          declsFor(darkCss, `[data-theme='dark'] ${tint}`),
          'background-color'
        ),
        dark.get('--surface')!,
        dark
      )
      expectAA(fg, bg, `${sel} on dark ${tint}`)
    }
  )

  it('light red delta text clears AA on the bg-red-50 panel', () => {
    const fg = resolveColor(
      prop(
        declsFor(darkCss, "[data-theme='light'] .bg-red-50 .text-red-600"),
        'color'
      ),
      light
    )
    expectAA(fg, '#fef2f2', 'red-600 on red-50')
  })

  it.each([
    ['light', light, '#ffffff', '#004165'],
    ['dark', dark, '#111922', '#5dade2'],
  ] as const)(
    'Division progress panel (bg-tm-loyal-blue/10) has a resolvable fill in %s',
    (name, theme, base, heading) => {
      const value = prop(
        declsFor(darkCss, `[data-theme='${name}'] .bg-tm-loyal-blue\\/10`),
        'background-color'
      )
      expect(value).toMatch(/^rgba\(/)
      expectAA(heading, fillOver(value, base, theme), `${name} panel heading`)
    }
  )
})
