import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

/* #2765 — Phase 2 was abandoned on 2026-11-12 and the legacy brand fonts
   (Montserrat via --serif, Source Sans 3 via --sans) are permanent. Rendered
   UI must not use the Phase-2 brand fonts: each Inter / Space Grotesk face
   is a separate woff2 download (~48 KB + ~22 KB on the club page) and the
   type would no longer match the rest of the site.

   Allow list (files that legitimately name the brand fonts):
   - the token definition and the @font-face / fallback-metric files, which
     only declare the faces;
   - red-vote-block.css, the Red Vote promo block, which deliberately wears
     the Red Vote product's own brand and loads those fonts only when the
     block nears the viewport (#2249). */

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, '../..')

const ALLOWED = new Set([
  'styles/tokens/rt-brand-v1.css',
  'styles/tokens/web-fonts.css',
  'styles/tokens/font-fallbacks.css',
  'styles/components/red-vote-block.css',
])

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (name === '__tests__' || name === 'node_modules') continue
    if (statSync(full).isDirectory()) out.push(...cssFiles(full))
    else if (name.endsWith('.css')) out.push(full)
  }
  return out
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (name === '__tests__' || name === 'node_modules') continue
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name))
      out.push(full)
  }
  return out
}

/** Comments are prose, not rendered CSS. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/* A banned family in a TS/TSX font value: a font stack ("Inter, system-ui")
   or a canvas shorthand ("12px Inter"). Matching stacks and sizes, not the
   bare word, keeps prose such as "Inter-district" out. */
const BANNED_STACK =
  /\b(?:Inter|Space Grotesk)\b['"]?\s*,[^\n]*\b(?:system-ui|sans-serif|serif)\b/
const BANNED_SHORTHAND = /\d(?:px|pt|em|rem)\s+['"]?(?:Inter|Space Grotesk)\b/
const isCommentLine = (line: string) => /^\s*(?:\/\/|\/\*|\*|\{\/\*)/.test(line)
/* The video poster is an SVG data URI shown as an <img>. An image cannot
   load the page's web fonts, so naming Inter there downloads nothing. */
const ALLOWED_SOURCES = new Set(['pages/VideosPage.tsx'])

const files = [
  ...cssFiles(join(src, 'styles')),
  ...cssFiles(join(src, 'components')),
  ...cssFiles(join(src, 'pages')),
  join(src, 'index.css'),
]
  .map(f => ({ rel: relative(src, f).split('\\').join('/'), full: f }))
  .filter(f => !ALLOWED.has(f.rel))

describe('no Phase-2 brand fonts in rendered UI (#2765)', () => {
  it('scans the stylesheets', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files.map(f => [f.rel, f.full]))(
    '%s uses no --rt-font-display / --rt-font-body, Inter or Space Grotesk',
    (_rel, full) => {
      const css = stripComments(readFileSync(full as string, 'utf-8'))
      expect(css).not.toMatch(/--rt-font-(display|body)/)
      expect(css).not.toMatch(/['"]?\bInter\b['"]?\s*[,;)]/)
      expect(css).not.toMatch(/Space Grotesk/)
    }
  )

  it('scans the TS and TSX sources', () => {
    expect(sourceFiles(src).length).toBeGreaterThan(100)
  })

  it('names no brand font in a TS or TSX font value', () => {
    const rel = (full: string) => relative(src, full).split('\\').join('/')
    const scanned = sourceFiles(src).filter(f => !ALLOWED_SOURCES.has(rel(f)))
    const hits = scanned.flatMap(full =>
      readFileSync(full, 'utf-8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(
          ({ line }) =>
            !isCommentLine(line) &&
            (BANNED_STACK.test(line) ||
              BANNED_SHORTHAND.test(line) ||
              /--rt-font-(?:display|body)/.test(line))
        )
        .map(({ n }) => `${rel(full)}:${n}`)
    )
    expect(hits).toEqual([])
  })
})
