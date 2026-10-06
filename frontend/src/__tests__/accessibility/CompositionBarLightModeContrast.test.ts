/**
 * District composition bar contrast in LIGHT mode (#1652).
 *
 * #1636 bound the bar's `.tier-fill--*` hooks to the `--tier-chart-*` tokens
 * in dark mode only, so light mode kept the generic Tailwind fills with white
 * 11px counts on top. Two of them fail WCAG 2 AA 1.4.3 (4.5:1):
 *
 * - Distinguished: white on `.bg-green-600` #16a34a = 3.30:1
 * - Not yet: white on `.bg-gray-200` #e5e7eb = 1.23:1
 *
 * The fix is CSS-level (R10). `[data-theme='light'] .tier-fill--*` takes the
 * same `--tier-chart-*` tokens (their light values are the club grid hexes,
 * white count ink), and the neutral "Not yet" segment gets dark ink through a
 * `[data-theme='light'] .composition-fill--not-yet` hook. jsdom does no
 * cascade, so the contract is pinned on the stylesheets.
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
  return out.join(';')
}

const light = parseBlock(tokensCss, ':root')

const resolveVar = (value: string): string => {
  const m = /^var\((--[\w-]+)\)/.exec(value.trim())
  if (!m) return value.trim()
  const next = light.get(m[1]!)
  if (!next) throw new Error(`unresolved ${m[1]}`)
  return resolveVar(next)
}

const colorDecl = (decls: string, prop: string) => {
  const m = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;!]+)`).exec(decls)
  return m ? m[1]!.trim() : undefined
}

const TIERS = ['distinguished', 'select', 'presidents', 'smedley'] as const
/** Tailwind `bg-gray-200`, the "Not yet" fill in light mode. */
const GRAY_200 = '#e5e7eb'

describe('composition bar light-mode contrast (#1652)', () => {
  it.each(TIERS)(
    'binds the %s segment to its --tier-chart-* token in light mode',
    t => {
      const decls = declsFor(darkCss, `[data-theme='light'] .tier-fill--${t}`)
      expect(colorDecl(decls, 'background-color')).toBe(
        `var(--tier-chart-${t})`
      )
      expect(colorDecl(decls, 'color')).toBe('var(--tier-chart-ink)')
    }
  )

  it.each(TIERS)(
    'the light %s count clears AA 4.5:1 and the fill clears 3:1 on --surface',
    t => {
      const decls = declsFor(darkCss, `[data-theme='light'] .tier-fill--${t}`)
      const fill = resolveVar(colorDecl(decls, 'background-color') ?? '')
      const ink = resolveVar(colorDecl(decls, 'color') ?? '')
      const surface = resolveVar(light.get('--surface')!)
      const text = calculateContrastRatio(ink, fill)
      expect(
        text,
        `${ink} on ${fill} = ${text.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5)
      const nonText = calculateContrastRatio(fill, surface)
      expect(
        nonText,
        `${fill} on ${surface} = ${nonText.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(3)
    }
  )

  it('the "Not yet" count is dark ink at AA on its light gray fill', () => {
    const decls = declsFor(
      darkCss,
      "[data-theme='light'] .composition-fill--not-yet"
    )
    const ink = resolveVar(colorDecl(decls, 'color') ?? '#ffffff')
    const ratio = calculateContrastRatio(ink, GRAY_200)
    expect(
      ratio,
      `${ink} on ${GRAY_200} = ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })
})
