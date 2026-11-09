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
