/**
 * One dark palette (#2641, UX Sprint 4, Ron's D8 decision 2026-11-12).
 *
 * `dark-mode.css` defined a purple set (--surface-card #1a1722, --surface-
 * secondary #14111a, text #f0ecf5) beside the slate redesign set (--surface
 * #111922, --ink #eef2f7), so `/divisions` rendered #14111a x35, #1a1722 x27
 * and #111922 x5 and the hub KPI cards were plum inside a navy strip. This
 * guard reads the real CSS (jsdom has no layout engine, lesson 075) and
 * asserts:
 *   1. the legacy semantic tokens alias the redesign tokens in dark, so no
 *      purple literal survives in dark-mode.css (R10, no new colours);
 *   2. the payment donut caption/track ride theme tokens, not raw rgba(0,0,0);
 *   3. the phone status pills have a dark remap that reuses the dark tints
 *      already shipped for `.dcp-cell--*` (darker steps of the same hues,
 *      light text) and every text/tint pair is >= 4.5:1;
 *   4. the club panel icon is a dark-remapping token (>= 3:1 graphical).
 *
 * Lives in `__tests__/accessibility/` -> integration project (lesson 090).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (p: string) => strip(readFileSync(resolve(srcDir, p), 'utf8'))

const redesignCss = read('styles/tokens/redesign.css')
const darkModeCss = read('styles/dark-mode.css')
const appShellCss = read('styles/components/app-shell.css')
const clubGridCss = read('styles/components/club-grid.css')
const donutSrc = readFileSync(
  resolve(srcDir, 'components/PaymentCompositionDonut.tsx'),
  'utf8'
)

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function blockDecls(css: string, selector: string): Map<string, string> {
  const re = new RegExp('(?:^|\\n)\\s*' + esc(selector) + '\\s*\\{')
  const m = re.exec(css)
  const map = new Map<string, string>()
  if (!m) return map
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    map.set(d[1].trim(), d[2].trim())
  return map
}

const DARK = "[data-theme='dark']"
const darkTokens = new Map([
  ...blockDecls(redesignCss, DARK),
  ...blockDecls(darkModeCss, DARK),
])

function resolveDark(value: string, depth = 0): string {
  if (depth > 8) throw new Error(`var() too deep: ${value}`)
  const m = value.trim().match(/^var\((--[\w-]+)\)$/)
  if (!m) return value.trim()
  const next = darkTokens.get(m[1])
  if (!next) throw new Error(`token ${m[1]} undefined in dark`)
  return resolveDark(next, depth + 1)
}

/** prop of the last `[data-theme='dark'] <selector>` rule (resting only). */
function darkProp(css: string, selector: string, prop: string): string {
  const re = new RegExp(
    esc(DARK) + '\\s*' + esc(selector) + '(?![\\w-:])[^{}]*\\{',
    'g'
  )
  let win: string | null = null
  for (const m of css.matchAll(re)) {
    const open = css.indexOf('{', m.index)
    const close = css.indexOf('}', open)
    const pm = css
      .slice(open + 1, close)
      .match(new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;!]+)'))
    if (pm) win = pm[1].trim()
  }
  if (!win) throw new Error(`no dark ${prop} for ${selector}`)
  return win
}

type Rgb = [number, number, number]
const hex = (h: string): Rgb => {
  const s = h.replace('#', '')
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as Rgb
}
const toHex = (c: Rgb) =>
  '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Composite `rgba(r,g,b,a)` or hex over an opaque hex backdrop. */
function over(color: string, backdrop: string): string {
  const m = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  )
  if (!m) return color
  const a = m[4] === undefined ? 1 : parseFloat(m[4])
  const fg: Rgb = [+m[1], +m[2], +m[3]]
  const bg = hex(backdrop)
  return toHex(fg.map((v, i) => v * a + bg[i] * (1 - a)) as Rgb)
}

describe('one dark palette (#2641)', () => {
  it('has no purple literals in dark-mode.css', () => {
    for (const purple of ['#1a1722', '#14111a', '#221e2d', '#f0ecf5']) {
      expect(darkModeCss.toLowerCase()).not.toContain(purple)
    }
  })

  it.each([
    ['--surface-card', '--surface'],
    ['--surface-secondary', '--surface-2'],
    ['--surface-card-hover', '--surface-3'],
    ['--text-heading', '--ink'],
    ['--text-muted', '--ink-3'],
  ])('dark %s resolves to the redesign %s', (legacy, redesign) => {
    const own = blockDecls(darkModeCss, DARK).get(legacy)
    expect(own).toBe(`var(${redesign})`)
    expect(resolveDark(own as string)).toBe(resolveDark(`var(${redesign})`))
  })

  it('donut caption and track use theme tokens, not raw black rgba', () => {
    expect(donutSrc).not.toMatch(/rgba\(0,\s*0,\s*0/)
    expect(donutSrc).toContain('var(--ink-3)')
    expect(donutSrc).toContain('var(--line)')
  })

  it('donut caption (--ink-3) is >= 4.5:1 on the dark card', () => {
    const fg = resolveDark('var(--ink-3)')
    const bg = resolveDark('var(--surface)')
    expect(calculateContrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  describe.each(['thriving', 'vulnerable', 'intervention'])(
    'clubs-status-pill--%s in dark',
    tone => {
      const sel = `.clubs-status-pill--${tone}`
      it('has a dark text/tint pair at >= 4.5:1 and is distinct from the card', () => {
        const surface = resolveDark('var(--surface)')
        const bg = over(darkProp(appShellCss, sel, 'background-color'), surface)
        const fg = darkProp(appShellCss, sel, 'color')
        expect(calculateContrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
        // the pill must read as a dark tint, not a light pastel
        expect(calculateContrastRatio(bg, surface)).toBeLessThan(1.5)
      })
    }
  )

  it('club panel icon is a dark-remapping token, >= 3:1 on the card', () => {
    const m =
      /\.club-panel__head \.club-panel__ico\s*\{[^}]*color:\s*([^;]+);/.exec(
        appShellCss
      )
    expect(m).not.toBeNull()
    const value = (m as RegExpExecArray)[1].trim()
    expect(value).toBe('var(--link)')
    expect(
      calculateContrastRatio(resolveDark(value), resolveDark('var(--surface)'))
    ).toBeGreaterThanOrEqual(3)
  })

  describe.each(['thriving', 'vulnerable', 'intervention'])(
    'club-grid-tile--%s in dark',
    tone => {
      const tile = `.club-grid-tile--${tone}`
      const pill = `.clubs-status-pill--${tone}`
      it('has a dark text/tint pair at >= 4.5:1 matching the status pill', () => {
        const surface = resolveDark('var(--surface)')
        const bg = darkProp(clubGridCss, tile, 'background-color')
        const fg = darkProp(clubGridCss, tile, 'color')
        expect(
          calculateContrastRatio(fg, over(bg, surface))
        ).toBeGreaterThanOrEqual(4.5)
        expect(bg).toBe(darkProp(appShellCss, pill, 'background-color'))
        expect(fg).toBe(darkProp(appShellCss, pill, 'color'))
      })
    }
  )

  it.each([
    ['.bg-gray-200', 'dark .bg-gray-200'],
    ['.hover\\:bg-gray-100:hover', 'dark hover:bg-gray-100'],
  ])('--text-muted on %s stays >= 4.5:1 (%s)', sel => {
    const re = new RegExp(
      esc(DARK) +
        '\\s*' +
        esc(sel) +
        '\\s*\\{[^}]*background-color:\\s*([^;!]+)'
    )
    const m = re.exec(darkModeCss)
    expect(m).not.toBeNull()
    const bg = resolveDark((m as RegExpExecArray)[1])
    const fg = resolveDark(
      blockDecls(darkModeCss, DARK).get('--text-muted') as string
    )
    expect(calculateContrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
