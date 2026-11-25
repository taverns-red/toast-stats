import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

/* A failed load shows the shared ErrorDisplay (with Try again), not a
   page's own sentence. This scans every non-test .tsx under pages/ and
   components/ for load-failure wording in JSX text and in string props
   (message=, aria-label=, and so on). ErrorDisplay's own props are skipped:
   that is where the wording belongs.

   ALLOWED lists the few places where a sentence is right and a panel is
   not. Each entry needs a reason; add one only when the slot cannot hold
   a panel. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, '..')

const ALLOWED: Record<string, string> = {
  'pages/AreaRedirectPage.tsx':
    'The redirect owns a compact browser title and heading when lookup fails; the body uses ErrorDisplay.',
  'components/DateSelector.tsx':
    'A compact message inside the date selector control; a panel does not fit the control.',
  'components/EndOfYearRankingsPanel.tsx':
    'A one-line note in a stat-card section. The panel gets rankings=null with no error or retry, so absent and failed look alike.',
  'components/ErrorPage.tsx':
    'A stale-bundle explanation, not a failed data read; reloading is the recovery.',
  'components/ProgramYearSelector.tsx':
    'A message inside a compact dropdown control. A panel does not fit the control.',
  'utils/loadFailureText.ts':
    'The shared wording belongs here, and all partial-failure consumers call it.',
}

const LOAD_FAILURE =
  /(couldn[’']t|could not|unable to|failed to|can[’']t|cannot) (be )?(load|fetch)/i

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(full))
    } else if (/\.[jt]sx?$/.test(full) && !/\.test\.[jt]sx?$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

function stripCommentsAndErrorDisplays(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<ErrorDisplay[\s\S]*?\/>/g, '')
}

/** Text between a closing `>` and the next `<`, with `{…}` kept inline. */
function jsxTexts(source: string): string[] {
  const out: string[] = []
  // `=>` and `->` are not tag ends; text holding `;` or `(` is code.
  const re = /(?<![=-])>\s*((?:[^<>{};(]|\{[^{}]*\})*?)\s*</g
  for (const m of source.matchAll(re)) out.push(m[1] ?? '')
  return out
}

/** Values of string props: name="…", name='…', name={`…`}, name={'…'}. */
function stringProps(source: string): string[] {
  const out: string[] = []
  const re =
    /[\w-]+=(?:"([^"]*)"|'([^']*)'|\{\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*\})/g
  for (const m of source.matchAll(re)) out.push(m.slice(1).find(Boolean) ?? '')
  return out
}

/** Plain strings, including constants whose wording JSX-text scanning misses. */
function stringLiterals(source: string): string[] {
  const out: string[] = []
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gms
  for (const m of source.matchAll(re)) out.push(m[2] ?? '')
  return out
}

function offendersIn(file: string): string[] {
  const source = stripCommentsAndErrorDisplays(readFileSync(file, 'utf8'))
  return [
    ...jsxTexts(source),
    ...stringProps(source),
    ...stringLiterals(source),
  ]
    .filter(t => LOAD_FAILURE.test(t))
    .filter((value, index, all) => all.indexOf(value) === index)
}

const FILES = [
  ...sourceFiles(join(src, 'pages')),
  ...sourceFiles(join(src, 'components')),
  ...sourceFiles(join(src, 'utils')),
].map(f => relative(src, f))

describe('shared error panel guard', () => {
  it('scans the pages that matter', () => {
    expect(FILES).toContain('pages/ClubHistoryPage.tsx')
    expect(FILES).toContain('pages/ClubsWorldPage.tsx')
    expect(FILES).toContain('components/WorldwideScoreboard.tsx')
  })

  it.each(['pages/ClubsWorldPage.tsx', 'pages/ClubsRacePage.tsx'])(
    '%s imports ErrorDisplay',
    file => {
      const source = readFileSync(resolve(src, file), 'utf8')
      expect(source).toMatch(/import\s*\{[^}]*\bErrorDisplay\b[^}]*\}\s*from/)
    }
  )

  it('has no ad-hoc load-failure wording outside the allow-list', () => {
    const found: Record<string, string[]> = {}
    for (const file of FILES) {
      if (file in ALLOWED) continue
      const offenders = offendersIn(resolve(src, file))
      if (offenders.length > 0) found[file] = offenders
    }
    expect(found).toEqual({})
  })

  it('gives every allow-list entry a reason and a file that still exists', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, file).toBeGreaterThan(10)
      expect(FILES, file).toContain(file)
      expect(offendersIn(resolve(src, file)).length, file).toBeGreaterThan(0)
    }
  })
})
