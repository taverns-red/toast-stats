/**
 * Per-district HTML stubs for social crawlers (#2304) — pure functions.
 *
 * Slack, LinkedIn, Facebook, X, iMessage and Discord read a page's raw HTML
 * and run no JS, so the SPA's one set of share tags is all they ever see.
 * Firebase Hosting serves a real file before it applies the `**` rewrite,
 * and with `cleanUrls` it serves `district/61.html` at `/district/61`. So
 * the frontend build writes one stub per district: the built index.html with
 * ONLY its share tags rewritten to name the district and point og:image at
 * its card on the CDN (`og/v1/district/<id>.png`, refreshed daily by the
 * pipeline's og-cards job, scripts/lib/ogCards.ts). Everything else stays
 * byte-identical, so the stub boots the same app with the same hashed
 * assets. Subpages (`/district/<id>/clubs` …) keep the generic tags.
 */

import { assertDistrictId, ogDistrictCardPath } from './ogCards.js'

/** The share tags a stub rewrites; each must appear once in index.html. */
export const SHARE_TAG_KEYS = [
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'twitter:title',
  'twitter:description',
  'twitter:image',
] as const

type ShareKey = (typeof SHARE_TAG_KEYS)[number]

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tagPattern(key: ShareKey): RegExp {
  const attr = key.startsWith('og:') ? 'property' : 'name'
  // `\s` spans newlines: index.html wraps the long description tags.
  return new RegExp(
    `<meta\\s+${attr}="${key.replace(/[.:]/g, m => `\\${m}`)}"\\s+content="[^"]*"\\s*/>`,
    'g'
  )
}

export interface StubOptions {
  districtId: string
  /** The build's CDN (VITE_CDN_BASE_URL): staging for previews. */
  cdnBaseUrl: string
  /** Canonical site origin for og:url. */
  siteOrigin: string
}

export function buildDistrictStubHtml(
  indexHtml: string,
  opts: StubOptions
): string {
  const id = assertDistrictId(opts.districtId)
  const cdn = opts.cdnBaseUrl.replace(/\/+$/, '')
  const title = `District ${id} — Toast Stats`
  const description = `Toastmasters District ${id}: Distinguished District status and the gap to the next tier, with club health, membership and payments. Updated daily.`
  const image = `${cdn}/${ogDistrictCardPath(id)}`
  const values: Record<ShareKey, string> = {
    'og:title': title,
    'og:description': description,
    'og:url': `${opts.siteOrigin.replace(/\/+$/, '')}/district/${id}`,
    'og:image': image,
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
  }
  let html = indexHtml
  for (const key of SHARE_TAG_KEYS) {
    const re = tagPattern(key)
    const hits = html.match(re) ?? []
    if (hits.length !== 1) {
      throw new Error(
        `index.html has ${hits.length} ${key} tags (expected 1); the stub would ship half-tagged`
      )
    }
    const attr = key.startsWith('og:') ? 'property' : 'name'
    html = html.replace(
      re,
      () => `<meta ${attr}="${key}" content="${escAttr(values[key])}" />`
    )
  }
  return html
}

/** The district ids of v1/rankings.json, sorted and de-duplicated. */
export function districtIdsFromRankings(rankings: unknown): string[] {
  const rows =
    typeof rankings === 'object' && rankings !== null
      ? (rankings as { rankings?: unknown }).rankings
      : undefined
  if (!Array.isArray(rows)) throw new Error('rankings: no rankings array')
  const ids = new Set<string>()
  for (const r of rows) {
    ids.add(assertDistrictId((r as { districtId?: unknown })?.districtId))
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export function districtStubPath(id: string): string {
  return `district/${assertDistrictId(id)}.html`
}
