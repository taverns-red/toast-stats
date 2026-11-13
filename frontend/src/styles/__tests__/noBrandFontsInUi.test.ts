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

/** Comments are prose, not rendered CSS. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const files = [
  ...cssFiles(join(src, 'styles')),
  ...cssFiles(join(src, 'components')),
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
})
