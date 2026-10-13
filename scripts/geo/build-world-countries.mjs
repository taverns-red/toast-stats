#!/usr/bin/env node
/**
 * build-world-countries.mjs — generate the pre-projected world map asset for
 * the country choropleth (#1797).
 *
 * The map is drawn as plain SVG, so the browser ships no projection library:
 * this script projects Natural Earth admin-0 countries once, with the
 * Equal Earth projection (an equal-area projection, so a country's ink is in
 * proportion to its area and Canada or Russia are not inflated the way Web
 * Mercator inflates them), and writes SVG path data.
 *
 * Sources (licences checked 2026-10-12):
 * - Natural Earth 4.1.0 admin-0 countries, 1:110m for polygons and 1:50m for
 *   the small territories 1:110m omits. Natural Earth is public domain
 *   (naturalearthdata.com/about/terms-of-use).
 * - Redistributed as TopoJSON by `world-atlas` 2.0.2 (ISC).
 *
 * Output: frontend/src/assets/geo/world-countries.json
 *   { width, height, sphere, countries: [{id, name, d, b}],
 *     markers: [{id, name, x, y}] }
 *   - `id` is the ISO 3166-1 numeric code (3 digits, zero-padded).
 *   - `b` is the projected bounding box [x0, y0, x1, y1], used to zoom to a
 *     selected country.
 *   - `markers` are territories too small for a 1:110m polygon (Singapore,
 *     Bahrain, the Caribbean islands …), drawn as dots at their centroid.
 *
 * Usage:  node scripts/geo/build-world-countries.mjs
 * Re-run only when the source data or the projection changes; the output is
 * committed and checked by frontend/src/components/worldmap/__tests__.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature } from 'topojson-client'
import { geoEqualEarth, geoPath, geoCentroid, geoBounds } from 'd3-geo'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../../frontend/src/assets/geo/world-countries.json')

const WIDTH = 1000
const PAD = 8
/** Antarctica has no clubs and would add a third of the map's height. */
const DROP = new Set(['010'])

/**
 * Territories Natural Earth folds into a parent at 1:110m and 1:50m. They are
 * placed by hand so the parent does not paint them with its own value.
 * French Guiana's polygon is split out of France below; the others are dots.
 */
const MANUAL_MARKERS = [
  { id: '474', name: 'Martinique', lng: -61.02, lat: 14.64 },
  {
    id: '535',
    name: 'Bonaire, Sint Eustatius and Saba',
    lng: -68.27,
    lat: 12.18,
  },
]

const load = name =>
  JSON.parse(readFileSync(require.resolve(`world-atlas/${name}`), 'utf8'))

const t110 = load('countries-110m.json')
const t50 = load('countries-50m.json')
const f110 = feature(t110, t110.objects.countries).features
const f50 = feature(t50, t50.objects.countries).features

// France's 1:110m multipolygon includes French Guiana (ISO 254). Split it out
// so a club count for "French Guiana" never paints France, or vice versa.
const polygons = []
for (const f of f110) {
  if (!f.id || DROP.has(f.id)) continue
  if (f.id === '250' && f.geometry.type === 'MultiPolygon') {
    const isGuiana = poly => poly[0].every(([lng]) => lng < -40)
    polygons.push({
      ...f,
      geometry: {
        type: 'MultiPolygon',
        coordinates: f.geometry.coordinates.filter(p => !isGuiana(p)),
      },
    })
    polygons.push({
      type: 'Feature',
      id: '254',
      properties: { name: 'French Guiana' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: f.geometry.coordinates.filter(isGuiana),
      },
    })
    continue
  }
  polygons.push(f)
}

const projection = geoEqualEarth()
projection.fitWidth(WIDTH - PAD * 2, {
  type: 'FeatureCollection',
  features: polygons,
})
const [[, y0], [, y1]] = geoPath(projection).bounds({
  type: 'FeatureCollection',
  features: polygons,
})
projection.translate([
  projection.translate()[0] + PAD,
  projection.translate()[1] - y0 + PAD,
])
const HEIGHT = Math.ceil(y1 - y0 + PAD * 2)

/** SVG path context that writes relative commands rounded to 0.1 px. */
function relativePathContext() {
  let out = ''
  let cx = 0
  let cy = 0
  let started = false
  const r = v => Math.round(v * 10) / 10
  const num = v => {
    const s = String(r(v))
    return s.startsWith('0.')
      ? s.slice(1)
      : s.startsWith('-0.')
        ? '-' + s.slice(2)
        : s
  }
  const pair = (dx, dy) => {
    const a = num(dx)
    const b = num(dy)
    return a + (b.startsWith('-') ? b : ' ' + b)
  }
  return {
    moveTo(x, y) {
      x = r(x)
      y = r(y)
      out +=
        (started ? 'm' : 'M') + (started ? pair(x - cx, y - cy) : `${x} ${y}`)
      started = true
      cx = x
      cy = y
    },
    lineTo(x, y) {
      x = r(x)
      y = r(y)
      if (x === cx && y === cy) return
      out += 'l' + pair(x - cx, y - cy)
      cx = x
      cy = y
    },
    closePath() {
      out += 'z'
    },
    arc() {},
    result() {
      const s = out
      out = ''
      started = false
      cx = 0
      cy = 0
      return s
    },
  }
}

const ctx = relativePathContext()
const pathFor = geo => {
  geoPath(projection, ctx)(geo)
  return ctx.result()
}
const bbox = geo =>
  geoPath(projection)
    .bounds(geo)
    .flat()
    .map(v => Math.round(v * 10) / 10)

const countries = polygons
  .map(f => ({
    id: f.id,
    name: f.properties.name,
    d: pathFor(f),
    b: bbox(f),
  }))
  .filter(c => c.d.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))

const have = new Set(countries.map(c => c.id))
const round1 = v => Math.round(v * 10) / 10
const markers = []
for (const f of f50) {
  if (!f.id || have.has(f.id) || DROP.has(f.id)) continue
  // A centroid of a far-flung archipelago can land in open sea; use the
  // centre of its bounding box when the shape spans the antimeridian.
  const [[w], [e]] = geoBounds(f)
  const c = e < w ? [(w + e + 360) / 2, geoCentroid(f)[1]] : geoCentroid(f)
  const [x, y] = projection(c)
  markers.push({
    id: f.id,
    name: f.properties.name,
    x: round1(x),
    y: round1(y),
  })
  have.add(f.id)
}
for (const m of MANUAL_MARKERS) {
  if (have.has(m.id)) continue
  const [x, y] = projection([m.lng, m.lat])
  markers.push({ id: m.id, name: m.name, x: round1(x), y: round1(y) })
}
markers.sort((a, b) => a.id.localeCompare(b.id))

const asset = {
  source:
    'Natural Earth 4.1.0 admin-0 countries (public domain) via world-atlas 2.0.2 (ISC); Equal Earth projection; generated by scripts/geo/build-world-countries.mjs',
  width: WIDTH,
  height: HEIGHT,
  sphere: pathFor({ type: 'Sphere' }),
  countries,
  markers,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(asset) + '\n')
console.error(
  `wrote ${OUT}: ${countries.length} polygons, ${markers.length} markers, ${WIDTH}x${HEIGHT}, ${JSON.stringify(asset).length} bytes`
)
