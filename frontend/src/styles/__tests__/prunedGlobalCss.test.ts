import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// #2738: the legacy `tm-*` layout/typography/nav/header utility rules were
// referenced by no component, test, e2e spec or index.html (and are not
// built at runtime). They shipped in the eager index-*.css on every page.
// docs/css-prune-2738.md lists every deleted selector and why it was dead.

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8')

const FILES = [
  '../components/typography.css',
  '../components/navigation.css',
  '../components/headers.css',
  '../components/forms.css',
  '../responsive.css',
]

const REMOVED_CLASSES = [
  // `.tm-typography, .tm-headline, .tm-headline-h1, ...` (typography.css) is a
  // mixed group kept whole because `.tm-headline` is live (Alert.tsx), so the
  // group-only classes are intentionally not listed here.
  'tm-text-xs',
  'tm-text-6xl',
  'tm-font-regular',
  'tm-font-black',
  'tm-leading-tight',
  'tm-leading-loose',
  'tm-navigation',
  'tm-nav',
  'tm-nav-item',
  'tm-nav-items',
  'tm-nav-menu',
  'tm-nav-brand',
  'tm-header',
  'tm-header-primary',
  'tm-header-secondary',
  'tm-header-title',
  'tm-header-actions',
  'tm-form-checkbox-wrapper--disabled',
  'tm-form-radio-wrapper--disabled',
  'tm-interactive',
  'tm-responsive-container',
  'tm-fluid-text',
  'tm-brand-header',
  'tm-brand-nav',
  'tm-h1-fluid',
  'tm-body-fluid',
  'tm-gradient-optimized',
  'tm-show-mobile',
  'tm-hide-desktop',
  'tm-responsive-grid',
  'tm-hide-print',
  'tm-header-content',
  'tm-btn-responsive',
  'tm-btn-primary-responsive',
  'tm-btn-secondary-responsive',
  'tm-card-responsive',
  'tm-nav-responsive',
]

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('pruned global CSS (#2738)', () => {
  it.each(REMOVED_CLASSES)('no rule selects .%s any more', cls => {
    const hit = FILES.filter(f =>
      new RegExp(`\\.${cls}(?![\\w-])`).test(stripComments(read(f)))
    )
    expect(hit).toEqual([])
  })

  it('the five pruned stylesheets total under 25 KB (was 40.9 KB)', () => {
    const bytes = FILES.reduce((n, f) => n + Buffer.byteLength(read(f)), 0)
    expect(bytes).toBeLessThan(25_000)
  })
})
