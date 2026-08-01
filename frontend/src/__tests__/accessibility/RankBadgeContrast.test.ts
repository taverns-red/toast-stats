/**
 * Medal-circle contrast for the rankings rank badge (#1363, AC "≥4.5:1 on the
 * three medal circles in both themes").
 *
 * The badge text is 14px bold — NOT WCAG "large text" (≥18.66px bold), so the
 * 4.5:1 normal-text threshold applies, not 3:1.
 *
 * Both themes are covered, and the dark path needs its own reasoning because
 * `dark-mode.css` treats the three fills differently:
 *   - `.bg-gray-400` (silver) IS remapped to a dark surface, so the global
 *     `.text-gray-900 → var(--text-heading)` remap correctly flips its ink
 *     light;
 *   - `.bg-yellow-500` / `.bg-amber-600` (gold / bronze) are NOT remapped, so
 *     that same global rule would put LIGHT text on a LIGHT fill — exactly the
 *     `#c9b748`-on-white shape tracked in #1360. A compound override pins the
 *     ink dark for those two, mirroring the existing
 *     `.bg-tm-happy-yellow.text-gray-900` precedent.
 *
 * Pure computation over the real CSS + the real Tailwind literals, so it is
 * falsifiable: change a fill or drop the override and this goes red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const darkModeCss = readFileSync(
  resolve(here, '../../styles/dark-mode.css'),
  'utf8'
)
const pageSrc = readFileSync(
  resolve(here, '../../pages/DistrictsPage.tsx'),
  'utf8'
)

/** Tailwind palette entries the medal pairs are allowed to draw from. */
const TAILWIND: Record<string, string> = {
  'bg-yellow-500': '#eab308',
  'bg-gray-400': '#9ca3af',
  'bg-amber-600': '#d97706',
  'text-white': '#ffffff',
  'text-gray-900': '#111827',
  'text-gray-700': '#374151',
}

/** Podium fills, read back out of the page's own MEDAL_FILLS map. */
const MEDAL_FILLS = { gold: '#eab308', silver: '#9ca3af', bronze: '#d97706' }

/** `--text-heading` in the dark theme (dark-mode.css). */
const INK_DARK = '#f0ecf5'
/** `[data-theme='dark'] .bg-gray-400` */
const SILVER_DARK_FILL = '#3a3648'

const AA_NORMAL = 4.5

/** The page's `MEDAL_FILLS` map, as `rank → ['bg-…', 'text-…']`. */
function medalPairsFromSource(): Array<[string, string, string]> {
  const block = /const MEDAL_FILLS[^=]*=\s*\{([\s\S]*?)\n\s*\}/.exec(pageSrc)
  if (!block) throw new Error('MEDAL_FILLS map not found in DistrictsPage.tsx')
  const pairs: Array<[string, string, string]> = []
  for (const m of block[1].matchAll(/(\d)\s*:\s*'([^']+)'/g)) {
    const classes = m[2].split(/\s+/)
    const bg = classes.find(c => c.startsWith('bg-'))
    const fg = classes.find(c => c.startsWith('text-'))
    if (!bg || !fg) throw new Error(`rank ${m[1]}: expected a bg + text pair`)
    pairs.push([m[1], bg, fg])
  }
  if (pairs.length !== 3) throw new Error('expected exactly 3 medal ranks')
  return pairs
}

const hex = (cls: string): string => {
  const v = TAILWIND[cls]
  if (!v) throw new Error(`unmapped Tailwind class: ${cls}`)
  return v
}

describe('rank badge medal circles — contrast (#1363)', () => {
  it('clears AA in the light theme on all three medals', () => {
    for (const [rank, bg, fg] of medalPairsFromSource()) {
      const ratio = calculateContrastRatio(hex(fg), hex(bg))
      expect(
        ratio,
        `rank ${rank}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  })

  it('pins gold and bronze to dark ink in the dark theme', () => {
    // The override must exist, or the global .text-gray-900 remap wins and
    // paints #f0ecf5 on #eab308 — 1.9:1. It is keyed on the badge's semantic
    // data-medal hook, NOT on the Tailwind pair: the #564 unmitigated-utility
    // guard reads a `[data-theme='dark'] .bg-yellow-500…` rule as a blanket
    // override of that utility and marks its remaining debt discharged.
    const override =
      /\[data-theme='dark'\][^{]*\.rank-badge\[data-medal='gold'\][\s\S]{0,200}?\{([\s\S]*?)\}/.exec(
        darkModeCss
      )
    expect(override, 'gold medal dark-mode ink override missing').not.toBeNull()
    const colorDecl = /color:\s*(#[0-9a-f]{3,8})/i.exec(override![1])
    expect(colorDecl, 'override must set an explicit hex ink').not.toBeNull()

    const ink = colorDecl![1]
    for (const fill of [MEDAL_FILLS.gold, MEDAL_FILLS.bronze]) {
      const ratio = calculateContrastRatio(ink, fill)
      expect(
        ratio,
        `${fill} vs ${ink} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
    expect(darkModeCss).toMatch(/\.rank-badge\[data-medal='bronze'\]/)
    // Silver must NOT be pinned — its fill is remapped dark.
    expect(darkModeCss).not.toMatch(/\.rank-badge\[data-medal='silver'\]/)
  })

  it('leaves silver to the global dark remap, which clears AA', () => {
    const ratio = calculateContrastRatio(INK_DARK, SILVER_DARK_FILL)
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})
