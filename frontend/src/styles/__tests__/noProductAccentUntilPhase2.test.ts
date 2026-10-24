/**
 * Guard (#2080): until the Phase 2 re-skin (ops#37), new UI matches the
 * existing app palette — no `--rt-stats` amber accent, no amber hex.
 *
 * Ron's decision (2026-10-15): pages built on the Red Taverns accent read as
 * yellow/brown next to the legacy TM / loyal-blue chrome. Use the legacy
 * tokens instead (`--tm-loyal-blue` and its `-NN` opacity variants, `--link`,
 * `--focus-ring`, the redesign.css neutrals), which already remap under
 * `[data-theme='dark']`.
 *
 * Scope: every .css / .ts / .tsx source under frontend/src, comments stripped
 * so history notes don't trip it. The only allowed home of `--rt-stats` is the
 * copy-on-release brand tokens file, which is never hand-edited. Tests are
 * excluded — they may name the token to assert its absence.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')

const ALLOWLIST = new Set([
  'styles/tokens/rt-brand-v1.css',
  // #2249 — the ONE scoped exception (Ron, 2026-10-23): the landing's Red
  // Vote block is a self-contained surface in Red Vote's own colours, logo
  // and type. Its stylesheet alone — the component carries no brand value
  // (the inlined pennant's fills are classes in this sheet). Everything
  // around it stays on the legacy palette.
  'styles/components/red-vote-block.css',
])

/** The accent token (any suffix, e.g. -focus), its two amber hexes, and —
    since #2249 — the Red Vote SURFACE tokens (--rt-vote, --rt-red-soft,
    --rt-paper*, --rt-bg*), which only the allowlisted sheet may use. The
    house red (--rt-red, --rt-red-dk) is not policed: it is already in the
    legacy chrome (the club mini-map pin, the Retention and Distinguished
    badge accents in redesign.css) and predates this. Hexes beyond the
    ambers are not policed either (locatorPins.ts draws the pin in hex). */
const FORBIDDEN =
  /--rt-(?:stats|vote|paper|bg)(?![\w])|--rt-(?:stats|paper|bg)-[\w-]+|--rt-red-soft(?![\w])|#d4873f\b|#b5651d\b/gi

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1')

function findAccentUses(files: string[]): string[] {
  const hits: string[] = []
  for (const file of files) {
    const rel = relative(srcDir, file)
    if (ALLOWLIST.has(rel)) continue
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (line.match(FORBIDDEN)) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
    })
  }
  return hits
}

describe('no --rt-stats accent outside the brand tokens file (#2080)', () => {
  it('the regex catches the token, its -focus variant and the hexes', () => {
    for (const s of [
      'color: var(--rt-stats);',
      'box-shadow: 0 0 0 2px var(--rt-stats-focus);',
      'background: #D4873F;',
      'color: #b5651d;',
    ]) {
      expect(s.match(FORBIDDEN), s).not.toBeNull()
    }
    // Class names that merely contain the letters are not the token.
    expect('className="chart-stats__val"'.match(FORBIDDEN)).toBeNull()
  })

  // #2249 — the Red Vote block is the ONE place on the site in Red Vote's
  // own surface palette (--rt-vote, --rt-red-soft, --rt-paper*, --rt-bg*),
  // and the guard's stated intent is "new UI matches the existing app
  // palette", so those tokens are forbidden everywhere else too.
  it('also catches the Red Vote surface tokens (#2249)', () => {
    for (const s of [
      'color: var(--rt-vote);',
      'background: var(--rt-red-soft);',
      'background: var(--rt-paper);',
      'border-color: var(--rt-paper-3);',
      'background: var(--rt-bg-2);',
    ]) {
      expect(s.match(FORBIDDEN), s).not.toBeNull()
    }
    // The house red already lives in the legacy chrome (mini-map pin,
    // badge accents), and the brand's type/spacing tokens are fine anywhere.
    expect('fill: var(--rt-red);'.match(FORBIDDEN)).toBeNull()
    expect('color: var(--rt-red-dk);'.match(FORBIDDEN)).toBeNull()
    expect('font-family: var(--rt-font-display);'.match(FORBIDDEN)).toBeNull()
    expect('gap: var(--rt-space-4);'.match(FORBIDDEN)).toBeNull()
  })

  it('no component, page or stylesheet uses it', () => {
    const hits = findAccentUses(walk(srcDir))
    expect(hits, hits.join('\n')).toEqual([])
  })
})
