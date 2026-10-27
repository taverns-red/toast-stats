import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PRIVACY_MASK_SELECTORS,
  PRIVACY_STYLE_ID,
  privacyMaskCss,
  privacyMaskScript,
} from '../privacy'

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

  it("hides the phone layout's external website row", () => {
    expect(PRIVACY_MASK_SELECTORS).toContain(
      '.club-more a.mobile-row[target="_blank"]'
    )
    const page = readFileSync(
      join(clubs, '..', '..', 'pages', 'ClubDetailPage.tsx'),
      'utf8'
    )
    expect(page).toContain('className="club-more"')
    expect(page).toMatch(/title: 'Club website',[\s\S]{0,120}external: true/)
    expect(
      readFileSync(join(clubs, '..', 'MobileRowList.tsx'), 'utf8')
    ).toContain('_blank')
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

describe('privacy mask init script (#2353)', () => {
  /** Just enough of a DOM to run the script's source. */
  function fakeDocument(withHead: boolean) {
    const appended: { id: string; textContent: string }[] = []
    const listeners: (() => void)[] = []
    const head = { appendChild: (el: never) => appended.push(el) }
    const doc = {
      head: withHead ? head : null,
      documentElement: head,
      getElementById: (id: string) => appended.find(e => e.id === id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    }
    return { doc, appended, listeners }
  }
  const run = (doc: unknown) =>
    new Function('document', privacyMaskScript())(doc) as void

  it('is self-contained source that adds the mask stylesheet once', () => {
    const { doc, appended } = fakeDocument(true)
    run(doc)
    run(doc)
    expect(appended).toHaveLength(1)
    expect(appended[0]!.id).toBe(PRIVACY_STYLE_ID)
    expect(appended[0]!.textContent).toBe(privacyMaskCss())
    // No bundler helper (e.g. tsx's __name) may appear in the source.
    expect(privacyMaskScript()).not.toMatch(/__name|__\w+\(/)
  })

  it('waits for the head when the document has none yet', () => {
    const { doc, appended, listeners } = fakeDocument(false)
    run(doc)
    expect(appended).toHaveLength(0)
    listeners.forEach(fn => fn())
    expect(appended).toHaveLength(1)
  })
})
