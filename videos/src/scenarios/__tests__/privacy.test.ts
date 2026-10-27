import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRIVACY_MASK_SELECTORS, privacyMaskCss } from '../privacy'

// Resolve from this file, not process.cwd() (Lesson 082).
const clubs = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'frontend',
  'src',
  'components',
  'clubs'
)
const source = (file: string): string => readFileSync(join(clubs, file), 'utf8')

describe('privacy mask for captures (#2353)', () => {
  it('hides the street address in the club hero (pin-icon item)', () => {
    const pin = PRIVACY_MASK_SELECTORS.find(s => s.includes('M8 14s'))
    expect(pin).toBeDefined()
    expect(pin).toMatch(/^\.club-meets__item:has\(/)
    // The selector keys on the pin icon's path; fail if the app changes it.
    expect(source('ClubWhereItMeets.tsx')).toContain('d="M8 14s')
    expect(source('ClubWhereItMeets.tsx')).toContain('club-meets__item')
  })

  it('hides the club links (website and the toastmasters.org contact)', () => {
    expect(PRIVACY_MASK_SELECTORS).toContain('.club-meets__links')
    expect(source('ClubWhereItMeets.tsx')).toContain(
      'className="club-meets__links"'
    )
  })

  it('hides the address line under the club mini-map', () => {
    expect(PRIVACY_MASK_SELECTORS).toContain('.club-minimap__place')
    expect(source('ClubMiniMap.tsx')).toContain(
      'className="club-minimap__place"'
    )
  })

  it('masks without shifting layout, so beat scroll targets stay put', () => {
    const css = privacyMaskCss()
    for (const selector of PRIVACY_MASK_SELECTORS) {
      expect(css).toContain(selector)
    }
    expect(css).toMatch(/visibility:\s*hidden\s*!important/)
    expect(css).not.toMatch(/display:\s*none/)
  })
})
