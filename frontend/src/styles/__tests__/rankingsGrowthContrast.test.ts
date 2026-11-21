import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatPercentage } from '../../utils/rankingsFormat'
import {
  contrast,
  declsFor,
  over,
  parseColor,
  prop,
  readSrcCss,
  srcDir,
  surfaces,
  tokens,
  type Theme,
} from './cssColor'

/* The growth % under each rankings metric was Tailwind text-green-600 /
   text-red-600 (about 3.2:1 on white, under the 4.5:1 floor at 14px). The cell
   now takes a class whose colour is a legacy token that remaps with the
   theme. jsdom does no cascade, so the contrast is computed from the shipped
   CSS and tokens. The +/U+2212 sign stays in the text, so direction never
   rests on colour alone. */

const AA = 4.5
const THEMES: Theme[] = ['light', 'dark']
const appShell = readSrcCss('styles/components/app-shell.css')

const cases = [
  { name: 'growth', pct: 12.5, sign: '+' },
  { name: 'loss', pct: -11.1, sign: '−' },
  { name: 'flat', pct: 0, sign: '0' },
] as const

describe('rankings growth % clears AA in both themes (#2694)', () => {
  it.each(cases)('$name: sign glyph stays in the text', ({ pct, sign }) => {
    expect(formatPercentage(pct).text.startsWith(sign)).toBe(true)
  })

  it.each(cases)('$name: no raw Tailwind palette colour', ({ pct }) => {
    expect(formatPercentage(pct).color).not.toMatch(/(?:green|red|gray)-\d/)
  })

  for (const theme of THEMES) {
    it.each(cases)(
      `$name clears 4.5:1 on every surface (${theme})`,
      ({ pct }) => {
        const cls = formatPercentage(pct).color.split(/\s+/).pop()!
        const colour = prop(declsFor(appShell, `.${cls}`), 'color')
        expect(colour, `a .${cls} colour rule in app-shell.css`).toBeDefined()
        const fg = parseColor(colour!, tokens(theme))
        for (const bg of surfaces(theme)) {
          expect(contrast(over(fg, bg), bg)).toBeGreaterThanOrEqual(AA)
        }
      }
    )
  }
})

/** The @media preludes enclosing the character at `index`, outermost first. */
function enclosingMedia(css: string, index: number): string[] {
  const stack: string[] = []
  let start = 0
  for (let i = 0; i < index; i++) {
    if (css[i] === '{') {
      stack.push(css.slice(start, i).trim())
      start = i + 1
    } else if (css[i] === '}') {
      stack.pop()
      start = i + 1
    } else if (css[i] === ';') start = i + 1
  }
  return stack.filter(p => p.startsWith('@media'))
}

describe('phone rankings card clips to its radius (#2694)', () => {
  it('the base wrap clips', () => {
    const base = declsFor(appShell, '.districts-rankings-table-wrap')
    expect(prop(base, 'overflow')).toBe('hidden')
  })

  it('overflow: visible on the card wrap applies from 768px up only', () => {
    const re = /\.districts-rankings-table-wrap--dt\s*\{([^}]*)\}/g
    const visible = [...appShell.matchAll(re)].filter(m =>
      /overflow:\s*visible/.test(m[1])
    )
    expect(visible.length).toBeGreaterThan(0)
    for (const m of visible) {
      const media = enclosingMedia(appShell, m.index)
      expect(media.join(' ')).toMatch(/min-width:\s*768px/)
    }
  })
})

describe('no yellow utility in the landing components (#2694)', () => {
  const files = [
    'pages/DistrictsPage.tsx',
    'components/rankingsCells.tsx',
    'components/rankingsColumns.tsx',
    'components/DistrictRankingsTable.tsx',
    'components/PriorityColumnsTable.tsx',
  ]
  it.each(files)('%s has no yellow-* Tailwind utility', file => {
    const text = readFileSync(resolve(srcDir, file), 'utf-8')
    expect(text).not.toMatch(/\b(?:text|bg|border|ring|fill|stroke)-yellow-\d/)
  })
})
