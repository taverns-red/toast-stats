/**
 * #2592 — the Education timeline's colours live in education-timeline.css,
 * bound by hook (Recharts writes SVG attributes, where var() does not
 * resolve). Every hook a band can carry must have a rule, light and dark,
 * and the sheet must stay on the legacy palette (#2080).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveTimeline } from '../../utils/educationTimelineBands'
import { PATHWAYS_PATHS } from '../../utils/districtEducation'

const css = readFileSync(
  resolve(__dirname, '../components/education-timeline.css'),
  'utf8'
)
const index = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

const ALL_PATHS = Object.fromEntries(PATHWAYS_PATHS.map(p => [p.code, 1]))
// 11 paths, so the top 6 + Other: pick each path as the only one, too.
const hooks = new Set<string>()
for (const p of PATHWAYS_PATHS) {
  hooks.add(
    deriveTimeline({
      points: [
        {
          date: '2026-10-04',
          levels: [1, 0, 0, 0, 0],
          dtm: 0,
          legacy: 0,
          other: 0,
          byPath: { [p.code]: 1 },
        },
      ],
      mode: 'path',
      prior: null,
    }).bands[0]!.colour
  )
}
for (const mode of ['level', 'path'] as const) {
  for (const b of deriveTimeline({
    points: [
      {
        date: '2026-10-04',
        levels: [1, 1, 1, 1, 1],
        dtm: 1,
        legacy: 1,
        other: 1,
        byPath: ALL_PATHS,
      },
    ],
    mode,
    prior: null,
  }).bands) {
    hooks.add(b.colour)
  }
}

describe('education-timeline.css', () => {
  it('is imported by the app stylesheet', () => {
    expect(index).toContain('./styles/components/education-timeline.css')
  })

  it.each([...hooks].sort())('binds the colour hook %s', hook => {
    expect(css).toContain(`--edu-tl-${hook}:`)
    expect(css).toContain(`.edu-tl-c--${hook}`)
  })

  it('remaps the colours at [data-theme=dark] (R10)', () => {
    expect(css).toMatch(/\[data-theme='dark'\]\s+\.edu-tl\b/)
  })

  it('stays on the legacy palette: no product accent (#2080)', () => {
    expect(css).not.toMatch(/--rt-(stats|paper|bg|vote)/i)
    expect(css).not.toMatch(/#d4873f|#b5651d/i)
  })

  it('gives the 11 paths 11 different light colours', () => {
    const lights = PATHWAYS_PATHS.map(p => {
      const m = new RegExp(
        `\\.edu-tl\\s*\\{[^}]*--edu-tl-p-${p.code.toLowerCase()}:\\s*([^;]+);`,
        's'
      ).exec(css)
      return m?.[1]?.trim()
    })
    expect(lights.every(Boolean)).toBe(true)
    expect(new Set(lights).size).toBe(PATHWAYS_PATHS.length)
  })

  it('reserves the chart height with a floor, for the skeleton and the empty state', () => {
    expect(css).toMatch(/\.edu-tl-section--reserved\s*\{[^}]*min-height:/s)
  })
})

/* ── Contrast: every band fill must read against its surface (WCAG 1.4.11
   non-text contrast, 3:1) in both themes. ─────────────────────────────── */

const tokens = readFileSync(
  resolve(__dirname, '../tokens/redesign.css'),
  'utf8'
)
const tokenValues = (name: string): string[] =>
  [...tokens.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map(
    m => m[1]!
  )
const [SURFACE_LIGHT, SURFACE_DARK] = tokenValues('surface') as [string, string]
const [BG_LIGHT, BG_DARK] = tokenValues('bg') as [string, string]

const channel = (c: number): number => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel(n >> 16) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** `--edu-tl-<hook>: #hex` declarations of one theme's block. */
function themeColours(block: RegExp): Record<string, string> {
  const body = block.exec(css)?.[1] ?? ''
  return Object.fromEntries(
    [...body.matchAll(/--edu-tl-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [
      m[1]!,
      m[2]!,
    ])
  )
}
const LIGHT = themeColours(/\n\.edu-tl\s*\{([^}]*)\}/)
const DARK = themeColours(/\[data-theme='dark'\]\s+\.edu-tl\s*\{([^}]*)\}/)

describe('education-timeline.css contrast (3:1 against the surface)', () => {
  it('reads the surface tokens it is measured against', () => {
    expect(SURFACE_LIGHT).toBeDefined()
    expect(SURFACE_DARK).toBeDefined()
    expect(BG_LIGHT).toBeDefined()
    expect(BG_DARK).toBeDefined()
  })

  it.each([...hooks].sort())('band %s: light fill', hook => {
    const fill = LIGHT[hook]
    expect(fill, `light --edu-tl-${hook}`).toBeDefined()
    expect(contrast(fill!, SURFACE_LIGHT)).toBeGreaterThanOrEqual(3)
    expect(contrast(fill!, BG_LIGHT)).toBeGreaterThanOrEqual(3)
  })

  it.each([...hooks].sort())('band %s: dark fill', hook => {
    const fill = DARK[hook]
    expect(fill, `dark --edu-tl-${hook}`).toBeDefined()
    expect(contrast(fill!, SURFACE_DARK)).toBeGreaterThanOrEqual(3)
    expect(contrast(fill!, BG_DARK)).toBeGreaterThanOrEqual(3)
  })

  it('keeps the five level fills visibly different in both themes', () => {
    for (const set of [LIGHT, DARK]) {
      const ramp = ['l1', 'l2', 'l3', 'l4', 'l5'].map(k => set[k]!)
      expect(new Set(ramp).size).toBe(5)
      // Neighbouring levels differ by luminance, not just by hex.
      for (let i = 1; i < ramp.length; i++) {
        expect(
          Math.abs(luminance(ramp[i]!) - luminance(ramp[i - 1]!))
        ).toBeGreaterThan(0.02)
      }
    }
  })

  it('separates neighbouring bands with a 2px gap of the surface', () => {
    expect(css).toMatch(
      /\.edu-tl__band \.recharts-area-curve\s*\{[^}]*stroke:\s*var\(--surface\);[^}]*stroke-width:\s*2\b/s
    )
  })
})

describe('education-timeline.css palette exception', () => {
  it('records the #2080 exception for the path colours, with who and when', () => {
    expect(css).toContain(
      '#2080 exception for the education timeline path colours, Ron 2026-11-09'
    )
  })
})
