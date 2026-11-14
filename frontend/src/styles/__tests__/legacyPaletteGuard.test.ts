/**
 * Legacy palette guard (#2080, #2630): the app keeps its existing palette
 * permanently (Phase 2 was abandoned, no re-skin or rename is coming) — no
 * `--rt-stats` amber accent, no amber hex, and no other `--rt-*` colour token
 * apart from the house red and the listed pre-existing uses.
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
  /--rt-(?:stats|vote|paper|bg)(?![\w])|--rt-(?:stats|paper|bg)-[\w-]+|--rt-red-soft(?![\w])|--rt-(?:ink(?:-2|-3|-on-dk)?|good|warn|bad|info|table|club|eval|rule(?:-strong|-on-dk)?)(?![\w-])|#d4873f\b|#b5651d\b/gi

/** #2630 — colour tokens that were already consumed before the guard covered
    every --rt-* colour: the recognition-badge hues in redesign.css (their
    contrast is pinned by RecognitionBadgeContrast.test.ts) and the app
    shell's online dot. A use is exempt only for the exact tokens listed for
    that file; any other --rt-* colour there still fails. */
const PRE_EXISTING_USES: Record<string, string[]> = {
  'styles/tokens/redesign.css': [
    '--rt-good',
    '--rt-info',
    '--rt-ink-2',
    '--rt-ink-3',
    '--rt-eval',
  ],
  'styles/components/app-shell.css': ['--rt-good'],
}

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
    const exempt = PRE_EXISTING_USES[rel] ?? []
    lines.forEach((line, i) => {
      const found = (line.match(FORBIDDEN) ?? []).filter(
        m => !exempt.includes(m.toLowerCase())
      )
      if (found.length > 0) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
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

  // #2630 — `--rt-warn` is the same amber (#D4873F) as `--rt-stats` and was
  // never policed. Every --rt-* colour token the brand file declares must be
  // caught, except the house red.
  it('polices every --rt-* colour token except the house red (#2630)', () => {
    const brand = stripComments(
      readFileSync(join(srcDir, 'styles/tokens/rt-brand-v1.css'), 'utf8')
    )
    const colourTokens = [
      ...brand.matchAll(
        /^\s*(--rt-[\w-]+)\s*:\s*(?:#[0-9a-f]{3,8}|rgba?\()/gim
      ),
    ].map(m => m[1] as string)
    expect(colourTokens).toContain('--rt-warn')
    const unpoliced = colourTokens.filter(
      t =>
        t !== '--rt-red' && t !== '--rt-red-dk' && !`var(${t})`.match(FORBIDDEN)
    )
    expect(unpoliced).toEqual([])
  })

  it('no component, page or stylesheet uses it', () => {
    const hits = findAccentUses(walk(srcDir))
    expect(hits, hits.join('\n')).toEqual([])
  })
})
