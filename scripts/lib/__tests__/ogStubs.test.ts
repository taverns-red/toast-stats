/**
 * Per-district HTML stubs for social crawlers (#2304) — the pure half.
 *
 * Crawlers read raw HTML and run no JS, and Hosting serves a real file
 * before the SPA rewrite. So the build writes dist/district/<id>.html: a
 * copy of the built index.html whose share tags name that district and its
 * card on the CDN. Everything else must stay byte-identical, or the stub
 * would boot a different app than `/` does.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildDistrictStubHtml,
  districtIdsFromRankings,
  districtStubPath,
  SHARE_TAG_KEYS,
} from '../ogStubs.js'

const INDEX = fs.readFileSync(
  path.join(process.cwd(), 'frontend/index.html'),
  'utf8'
)
const opts = {
  districtId: '61',
  cdnBaseUrl: 'https://cdn.taverns.red',
  siteOrigin: 'https://ts.taverns.red',
}

/** Drop every share tag so the rest of the document can be compared. */
function withoutShareTags(html: string): string {
  return html.replace(
    /<meta\s+(?:property|name)="(?:og|twitter):[^"]+"\s+content="[^"]*"\s*\/>/g,
    ''
  )
}

function tag(html: string, key: string): string | undefined {
  const attr = key.startsWith('og:') ? 'property' : 'name'
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'm')
  return re.exec(html.replace(/\s*\n\s*/g, ' '))?.[1]
}

describe('buildDistrictStubHtml', () => {
  const stub = buildDistrictStubHtml(INDEX, opts)

  it('names the district and points at its card on the CDN', () => {
    expect(tag(stub, 'og:title')).toBe('District 61 — Toast Stats')
    expect(tag(stub, 'twitter:title')).toBe('District 61 — Toast Stats')
    expect(tag(stub, 'og:url')).toBe('https://ts.taverns.red/district/61')
    expect(tag(stub, 'og:image')).toBe(
      'https://cdn.taverns.red/og/v1/district/61.png'
    )
    expect(tag(stub, 'twitter:image')).toBe(
      'https://cdn.taverns.red/og/v1/district/61.png'
    )
    expect(tag(stub, 'og:description')).toMatch(/District 61/)
    expect(tag(stub, 'twitter:description')).toBe(tag(stub, 'og:description'))
  })

  it('keeps the large-image card and the 1200x630 size hints', () => {
    expect(tag(stub, 'twitter:card')).toBe('summary_large_image')
    expect(tag(stub, 'og:image:width')).toBe('1200')
    expect(tag(stub, 'og:image:height')).toBe('630')
  })

  it('is otherwise byte-identical to index.html (same app shell, same scripts)', () => {
    expect(withoutShareTags(stub)).toBe(withoutShareTags(INDEX))
    expect(stub).not.toBe(INDEX)
  })

  it('every share tag it rewrites exists exactly once in index.html (drift guard)', () => {
    for (const key of SHARE_TAG_KEYS) {
      const attr = key.startsWith('og:') ? 'property' : 'name'
      const hits = INDEX.match(new RegExp(`${attr}="${key}"`, 'g')) ?? []
      expect(hits, key).toHaveLength(1)
    }
  })

  it('throws when index.html lost a share tag, rather than ship a half-tagged stub', () => {
    const broken = INDEX.replace(/<meta property="og:image" [^>]*\/>/, '')
    expect(() => buildDistrictStubHtml(broken, opts)).toThrow(/og:image/)
  })

  it('refuses a district id that is not a plain id', () => {
    expect(() =>
      buildDistrictStubHtml(INDEX, { ...opts, districtId: '"><script>' })
    ).toThrow(/district id/)
  })

  it('takes the CDN base from the build (staging for previews), trimming a trailing slash', () => {
    const s = buildDistrictStubHtml(INDEX, {
      ...opts,
      cdnBaseUrl: 'https://cdn-staging.taverns.red/',
    })
    expect(tag(s, 'og:image')).toBe(
      'https://cdn-staging.taverns.red/og/v1/district/61.png'
    )
  })
})

describe('districtIdsFromRankings / districtStubPath', () => {
  it('reads the district ids of v1/rankings.json, sorted and de-duplicated', () => {
    const r = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'scripts/lib/__tests__/fixtures/og-cards/rankings.json'
        ),
        'utf8'
      )
    )
    expect(districtIdsFromRankings(r)).toEqual([
      '10',
      '11',
      '17',
      '27',
      '59',
      '61',
    ])
  })

  it('throws on a file with no rankings array', () => {
    expect(() => districtIdsFromRankings({})).toThrow(/rankings/)
  })

  it('stubs live at district/<id>.html (served as /district/<id> with cleanUrls)', () => {
    expect(districtStubPath('61')).toBe('district/61.html')
  })
})
