/**
 * Tier chart colours in dark mode (#1636).
 *
 * The /clubs race chart and the District "Distinguished Clubs · Composition"
 * bar paint the four Distinguished tiers in the club grid's legacy hexes
 * (#1607). Those are tuned for white: in dark mode President's (#004165) and
 * Smedley (#7b1828) sit at ~1.6:1 on the dark surfaces — below the WCAG
 * 1.4.11 3:1 non-text floor — and the composition bar's generic
 * `.bg-tm-*` dark remaps (#8b2d3c, #1a6b8a) still miss it.
 *
 * The fix is a token remap at `[data-theme='dark']` scope (R10): the
 * `--tier-chart-*` tokens are defined in BOTH theme blocks of redesign.css,
 * the race chart binds its bands + legend swatches to them in CSS (Recharts'
 * SVG `fill`/`stroke` ATTRIBUTES can't resolve var(), but a CSS property
 * outranks a presentation attribute), and the composition bar's segments pick
 * them up through a dark-only `.tier-fill--*` override. jsdom does no layout
 * or cascade, so the contract is pinned on the stylesheets themselves.
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
const raceCss = readCss('components/clubs-race.css')
const darkCss = readCss('dark-mode.css')
const gridCss = readCss('components/club-grid.css')

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

/** Declarations of the rule whose selector list contains `sel` exactly. */
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

const TIERS = ['distinguished', 'select', 'presidents', 'smedley'] as const
/** The race chart's band order (RACE_TIER_ROUTES) — Smedley is last, so a
 *  legend item's index is stable whether or not the Smedley band shows. */
const LEGEND_INDEX: Record<(typeof TIERS)[number], number> = {
  distinguished: 0,
  select: 1,
  presidents: 2,
  smedley: 3,
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}
const toHex = (rgb: number[]) =>
  '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
/** `fg` at `alpha` composited over an opaque `bg`. */
const over = (fg: string, alpha: number, bg: string) => {
  const f = hexToRgb(fg)
  const b = hexToRgb(bg)
  return toHex(f.map((c, i) => c * alpha + b[i]! * (1 - alpha)))
}

/** The race chart's `fillOpacity` on every band (RaceChart.tsx). */
const BAND_FILL_OPACITY = 0.85

describe('tier chart colours (#1636)', () => {
  it('defines every --tier-chart-* token in both theme blocks', () => {
    for (const theme of [light, dark]) {
      for (const t of TIERS) {
        expect(theme.has(`--tier-chart-${t}`), t).toBe(true)
      }
      expect(theme.has('--tier-chart-ink')).toBe(true)
    }
  })

  it('light values are the club grid tier hexes, so a tier reads the same colour everywhere (#1607)', () => {
    const gridHex = (t: string) =>
      /background-color:\s*(#[0-9a-f]{6})/i
        .exec(declsFor(gridCss, `.club-grid-tile--tier-${t}`))![1]!
        .toLowerCase()
    for (const t of TIERS) {
      expect(light.get(`--tier-chart-${t}`)!.toLowerCase(), t).toBe(gridHex(t))
    }
  })

  it.each(['--bg', '--surface'])(
    'every dark tier fill clears the 3:1 non-text floor on dark %s, solid and at the band opacity',
    bgToken => {
      const bg = dark.get(bgToken)!
      for (const t of TIERS) {
        const hex = dark.get(`--tier-chart-${t}`)!
        for (const fill of [hex, over(hex, BAND_FILL_OPACITY, bg)]) {
          const ratio = calculateContrastRatio(fill, bg)
          expect(
            ratio,
            `${t} ${fill} on ${bg} = ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(3)
        }
      }
    }
  )

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    'segment count text (--tier-chart-ink) clears AA on every %s tier fill',
    (_name, theme) => {
      const ink = theme.get('--tier-chart-ink')!
      for (const t of TIERS) {
        const fill = theme.get(`--tier-chart-${t}`)!
        const ratio = calculateContrastRatio(ink, fill)
        expect(
          ratio,
          `${ink} on ${t} ${fill} = ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )

  it('keeps the four dark tier fills distinct', () => {
    const values = TIERS.map(t => dark.get(`--tier-chart-${t}`)!.toLowerCase())
    expect(new Set(values).size).toBe(TIERS.length)
  })

  it.each(TIERS)(
    'the race chart paints the %s band and legend swatch from its token',
    t => {
      const token = `var(--tier-chart-${t})`
      expect(
        declsFor(raceCss, `.race-chart__band--${t} .recharts-area-area`)
      ).toMatch(new RegExp(`fill:\\s*var\\(--tier-chart-${t}\\)`))
      expect(
        declsFor(raceCss, `.race-chart__band--${t} .recharts-area-curve`)
      ).toMatch(new RegExp(`stroke:\\s*var\\(--tier-chart-${t}\\)`))
      expect(
        declsFor(
          raceCss,
          `.race-chart .legend-item-${LEGEND_INDEX[t]} .recharts-symbols`
        )
      ).toContain(`fill: ${token}`)
    }
  )

  it.each(TIERS)(
    'the composition bar remaps the %s segment to its token in dark mode',
    t => {
      const decls = declsFor(darkCss, `[data-theme='dark'] .tier-fill--${t}`)
      expect(decls).toMatch(
        new RegExp(`background-color:\\s*var\\(--tier-chart-${t}\\)`)
      )
      expect(decls).toMatch(/(^|;)\s*color:\s*var\(--tier-chart-ink\)/)
    }
  )
})
