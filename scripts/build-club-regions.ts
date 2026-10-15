/**
 * Club regions for the street-level basemap — Runner (#2084, ADR-016).
 *
 * Thin glue around the pure builder in ./lib/clubRegions.js:
 *   1. resolve the snapshot date (`--date`, else `v1/latest.json`),
 *   2. list the districts from `snapshots/<date>/all-districts-rankings.json`,
 *   3. read each `snapshots/<date>/analytics/district_<id>_analytics.json`
 *      from the CDN, one object at a time, in memory (nothing is saved),
 *   4. write the `pmtiles extract --region` GeoJSON to `--out`,
 *   5. print the coverage stats as JSON on stdout (R4: logs go to stderr).
 *
 * Fails when any district's file cannot be read: a partial region set would
 * silently leave whole districts at z10 (the #1469 under-coverage lesson).
 *
 * Usage:
 *   npx tsx scripts/build-club-regions.ts --out /tmp/club-regions.geojson \
 *     [--buffer-km 8] [--date 2026-10-14] [--cdn-base https://cdn.taverns.red]
 */

import { writeFileSync } from 'node:fs'
import { fetchCdnObject } from './lib/cdnFetch.js'
import { buildClubRegions, regionsToGeoJson } from './lib/clubRegions.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function getJson(base: string, path: string): Promise<unknown> {
  const r = await fetchCdnObject(base, path)
  if (!r.ok || !r.body) {
    throw new Error(`${path}: ${r.status ?? r.error ?? 'no body'}`)
  }
  return JSON.parse(new TextDecoder().decode(r.body)) as unknown
}

async function main(): Promise<void> {
  const out = arg('out')
  if (!out) throw new Error('--out <file.geojson> is required')
  const base = (arg('cdn-base') ?? 'https://cdn.taverns.red').replace(
    /\/+$/,
    ''
  )
  const bufferKm = Number(arg('buffer-km') ?? '8')
  let date = arg('date')
  if (!date) {
    const latest = (await getJson(base, 'v1/latest.json')) as {
      latestSnapshotDate?: string
    }
    date = latest.latestSnapshotDate
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`no valid snapshot date (got '${date}')`)
  }
  const rankings = (await getJson(
    base,
    `snapshots/${date}/all-districts-rankings.json`
  )) as { rankings?: { districtId?: string }[] }
  const ids = (rankings.rankings ?? [])
    .map(r => r.districtId)
    .filter((id): id is string => typeof id === 'string' && /^\w+$/.test(id))
  if (ids.length === 0) throw new Error(`no districts listed for ${date}`)
  log(`club-regions: ${ids.length} districts at ${date}, buffer ${bufferKm} km`)

  // Sequential on purpose: ~100 single-object reads, light on the CDN.
  const files: unknown[] = []
  for (const id of ids) {
    files.push(
      await getJson(
        base,
        `snapshots/${date}/analytics/district_${id}_analytics.json`
      )
    )
  }

  const { regions, stats } = buildClubRegions(files, { bufferKm })
  if (stats.clubsInsideBuffer !== stats.clubsWithCoordinates) {
    throw new Error(
      `only ${stats.clubsInsideBuffer} of ${stats.clubsWithCoordinates} clubs fall inside a region`
    )
  }
  writeFileSync(out, `${JSON.stringify(regionsToGeoJson(regions))}\n`)
  log(`club-regions: wrote ${regions.length} regions to ${out}`)
  process.stdout.write(`${JSON.stringify({ date, out, ...stats })}\n`)
}

main().catch((err: unknown) => {
  log(`club-regions: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
