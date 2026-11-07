/**
 * The RT pennant icon set (#2507), vendored from
 * https://taverns.red/brand/icons/ into frontend/public.
 *
 * index.html must link the SVG favicon (primary), the ICO fallback and the
 * home-screen icon, and every icon the web manifest lists must exist on disk.
 * The manifest keeps the app's own name; only its icons come from the brand.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const FRONTEND = resolve(__dirname, '../../..')
const PUBLIC = resolve(FRONTEND, 'public')
const html = readFileSync(resolve(FRONTEND, 'index.html'), 'utf-8')

const linkHref = (rel: string, type?: string) =>
  new RegExp(
    `<link\\b(?=[^>]*\\brel="${rel}")${type ? `(?=[^>]*\\btype="${type}")` : ''}[^>]*\\bhref="([^"]+)"`
  ).exec(html)?.[1]

interface WebManifest {
  name: string
  short_name: string
  icons: { src: string; sizes: string; type: string }[]
}

describe('RT pennant icon set (#2507)', () => {
  it('index.html links favicon.svg as the primary icon', () => {
    expect(linkHref('icon', 'image/svg\\+xml')).toBe('/favicon.svg')
  })

  it('index.html keeps favicon.ico as the fallback icon', () => {
    expect(linkHref('icon', 'image/x-icon')).toBe('/favicon.ico')
  })

  it('index.html links apple-touch-icon.png', () => {
    expect(linkHref('apple-touch-icon')).toBe('/apple-touch-icon.png')
  })

  it('every linked icon exists in public/', () => {
    for (const href of [
      '/favicon.svg',
      '/favicon.ico',
      '/apple-touch-icon.png',
    ]) {
      expect(existsSync(resolve(PUBLIC, `.${href}`)), href).toBe(true)
    }
  })

  describe('web manifest', () => {
    const href = linkHref('manifest')

    it('is linked from index.html and exists', () => {
      expect(href).toBe('/site.webmanifest')
      expect(existsSync(resolve(PUBLIC, 'site.webmanifest'))).toBe(true)
    })

    it("keeps the app's own name, not the brand's", () => {
      const m = JSON.parse(
        readFileSync(resolve(PUBLIC, 'site.webmanifest'), 'utf-8')
      ) as WebManifest
      expect(m.name).toBe('Toast Stats')
      expect(m.short_name).toBe('Toast Stats')
    })

    it('lists 192 and 512 px icons that exist on disk', () => {
      const m = JSON.parse(
        readFileSync(resolve(PUBLIC, 'site.webmanifest'), 'utf-8')
      ) as WebManifest
      expect(m.icons.map(i => i.sizes).sort()).toEqual(['192x192', '512x512'])
      for (const icon of m.icons) {
        expect(icon.src.startsWith('/'), icon.src).toBe(true)
        expect(existsSync(resolve(PUBLIC, `.${icon.src}`)), icon.src).toBe(true)
      }
    })
  })
})
