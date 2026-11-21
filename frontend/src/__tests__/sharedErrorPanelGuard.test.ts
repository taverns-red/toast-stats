import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* A failed load shows the shared ErrorDisplay (with Try again), not a
   page's own sentence. Each file below renders a whole-page or whole-panel
   load failure. It must import ErrorDisplay and must not carry load-failure
   wording as JSX text. Add a page here when it gains an error state. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, '..')

const FILES = [
  'pages/ClubsWorldPage.tsx',
  'pages/ClubsRacePage.tsx',
  'pages/DistrictCouncilPage.tsx',
  'pages/DistrictChangesPage.tsx',
  'pages/RankingsChangesPage.tsx',
  'pages/RegionMapPage.tsx',
  'pages/WorldMapPage.tsx',
  'pages/WorldCountriesPage.tsx',
  'components/ProgramYearSummaryCards.tsx',
  'components/WorldwideScoreboard.tsx',
]

const LOAD_FAILURE =
  /(couldn[’']t|could not|unable to|failed to|can[’']t) (be )?(load|fetch)/i

/** Text between a closing `>` and the next `<`, with `{…}` kept inline. */
function jsxTexts(source: string): string[] {
  const out: string[] = []
  // `=>` and `->` are not tag ends; text holding `;` or `(` is code.
  const re = /(?<![=-])>\s*((?:[^<>{};(]|\{[^{}]*\})*?)\s*</g
  for (const m of source.matchAll(re)) out.push(m[1] ?? '')
  return out
}

describe('shared error panel guard', () => {
  it.each(FILES)('%s imports ErrorDisplay', file => {
    const source = readFileSync(resolve(src, file), 'utf8')
    expect(source).toMatch(/import\s*\{[^}]*\bErrorDisplay\b[^}]*\}\s*from/)
  })

  it.each(FILES)('%s has no ad-hoc load-failure text', file => {
    const source = readFileSync(resolve(src, file), 'utf8')
    const offenders = jsxTexts(source).filter(t => LOAD_FAILURE.test(t))
    expect(offenders).toEqual([])
  })
})
