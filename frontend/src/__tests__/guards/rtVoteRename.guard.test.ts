/* Red Vote is now RT Vote (#2968, ADR 0022 in taverns-red/ops).

   No visible "Red Vote" may remain in rendered strings, meta text, the video
   scenario sources or the product spec. Comments are stripped first, and so
   are analytics event values (`promotion_name`), which are data, not copy.
   Identifiers (RedVote*, RED_VOTE_*), red-vote paths and URLs never match
   "Red Vote" with a space, so they pass. Modelled on
   tests/rt-vote-rename.test.mjs in taverns-red/taverns-red. */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.git'])
const SOURCE_EXT = /\.(tsx?|html|txt|xml|json)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SOURCE_EXT.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function visibleText(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .split('\n')
    .filter(line => !line.includes('promotion_name'))
    .join('\n')
}

function redVoteHits(source: string): string[] {
  return [...visibleText(source).matchAll(/.{0,30}Red\s+Vote.{0,30}/gi)].map(
    m => m[0]
  )
}

describe('redVoteHits — the scanner', () => {
  it('flags visible copy', () => {
    expect(redVoteHits("cta: 'See Red Vote',")).toHaveLength(1)
  })
  it('ignores comments, analytics values, identifiers and URLs', () => {
    const ok = [
      '// Red Vote promotion',
      '/* Red Vote block */',
      '{/* the Red Vote line */}',
      "promotion_name: 'Red Vote',",
      'import { RedVoteBlock } from "./RedVoteBlock"',
      "href: 'https://taverns.red/red-vote'",
      'const { RED_VOTE_COPY } = x',
    ].join('\n')
    expect(redVoteHits(ok)).toEqual([])
  })
})

describe('no visible "Red Vote" (#2968)', () => {
  const files = [
    ...walk(join(repo, 'frontend/src')),
    ...['robots.txt', 'site.webmanifest', 'sitemap.xml'].map(n =>
      join(repo, 'frontend/public', n)
    ),
    ...walk(join(repo, 'videos/src')),
    join(repo, 'frontend/index.html'),
    join(repo, 'docs/product-spec.md'),
  ]

  it('scans the whole surface', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds no visible "Red Vote" in any file', () => {
    const hits = files.flatMap(f =>
      redVoteHits(readFileSync(f, 'utf8')).map(
        h => `${relative(repo, f)}: ${h}`
      )
    )
    expect(hits).toEqual([])
  })
})
