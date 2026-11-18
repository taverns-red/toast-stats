import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #2959: on PR #2951's run, four bundle-7 smokes failed because the page was
 * still showing its loading state when the test looked at it. The artifact's
 * error-context pages show it:
 *   - clubs-mobile-rows: `status "Loading table": Loading table data...`
 *     (the table is a lazy chunk; webkit on a busy runner took over 5 s);
 *   - basemap-375: the map region is still named "Club map" with
 *     `status "Loading map"`; the full name appears once the lazy map mounts,
 *     and the test gave that 5 s while giving the canvas 15 s;
 *   - contrast-aa /history: `.history-page-year-chip__live` was in the page
 *     while the other chips were still `shell-ghost`, so the contrast walk
 *     measured placeholders (ratio 1:1).
 * Each smoke must wait for the page's own "loaded" signal, not for a default
 * 5 s expect to win a race. A source check, like the CDN-fixture lint beside
 * it: the failure needs a loaded CI runner and cannot be reproduced locally. */

const E2E_DIR = resolve(__dirname, '../../../e2e')
/** Source with its comments removed, so a comment can't satisfy a check. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

const read = (f: string) =>
  stripComments(readFileSync(resolve(E2E_DIR, f), 'utf8'))

describe('stripComments', () => {
  it('removes block and line comments but keeps code and URLs', () => {
    const src = [
      "/* expect(page.locator('.shell-ghost')).toHaveCount(0) */",
      "// expect(page.locator('.shell-ghost')).toHaveCount(0)",
      "const url = 'https://example.com'",
      'await go() // shell-ghost',
    ].join('\n')
    const out = stripComments(src)
    expect(out).not.toMatch(/shell-ghost/)
    expect(out).toMatch(/https:\/\/example\.com/)
    expect(out).toMatch(/await go\(\)/)
  })
})

describe('smokes wait for loaded data (#2959)', () => {
  const clubsLoad = (): string => {
    const src = read('clubs-mobile-rows.smoke.ts')
    return src.match(/async function load\([\s\S]*?\n}\n/)?.[0] ?? ''
  }

  it('clubs-mobile-rows load() waits for a loaded list or table to be visible', () => {
    const src = read('clubs-mobile-rows.smoke.ts')
    // The skeleton being absent also holds before it has mounted, so the
    // wait needs a positive signal: the grouped list, flat list or table.
    expect(src).toMatch(/const LOADED\s*=[^\n]*#clubs-table/)
    expect(clubsLoad()).toMatch(
      /expect\(\s*page\.locator\(LOADED\)[\s\S]*?\)\s*\.toBeVisible\(\{\s*timeout: /
    )
  })

  it('clubs-mobile-rows load() also waits for the table skeleton to go', () => {
    expect(clubsLoad()).toMatch(
      /getByRole\('status', \{ name: 'Loading table' \}\)\)\.toHaveCount\(\s*0/
    )
  })

  it('contrast-aa does not measure while a shell-ghost placeholder is on the page', () => {
    const src = read('contrast-aa.smoke.ts')
    expect(src).toMatch(
      /expect\(page\.locator\('\.shell-ghost'\)\)\.toHaveCount\(\s*0/
    )
  })

  it('basemap-375 gives the loaded map region the same budget as its canvas', () => {
    const src = read('basemap-375.smoke.ts')
    // The region takes its full name only once the lazy map has mounted.
    expect(src).toMatch(
      /const region = page\.getByRole\('region', \{\s*name: 'Club map, coloured by club health',?\s*\}\)/
    )
    expect(src).not.toMatch(/await expect\(region\)\.toBeVisible\(\)/)
    expect(src).toMatch(
      /await expect\(region\)\.toBeVisible\(\{\s*timeout: 15_000/
    )
  })
})
