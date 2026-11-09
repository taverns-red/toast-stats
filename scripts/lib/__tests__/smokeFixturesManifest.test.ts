/**
 * Contract: the fixtures manifest covers every CDN family the frontend reads
 * (#2545).
 *
 * The shards answer cdn-staging from the fixtures and fail on a path with no
 * fixture. This is the static half of keeping them honest, with no network:
 * a new `cdnBaseUrl()/...` read in frontend/src/services must either match a
 * manifest entry or be named below with the reason no smoke needs it. The
 * dynamic half is the fail-on-miss in e2e/helpers/cdnFixtures.ts and
 * `npm run smoke-fixtures:record`.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseManifest } from '../smokeFixtures'

const ROOT = process.cwd()
const manifest = parseManifest(
  JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/smoke-fixtures.manifest.json'),
      'utf-8'
    )
  )
)

/** Families no smoke reads: a record run of every smoke never asked for them. */
const NOT_READ_BY_ANY_SMOKE: Record<string, string> = {
  'config/club-index.json': 'header search only; no smoke types in it',
  'config/closed-club-names.json': 'closed-club lookups; no smoke reaches one',
  'config/divisions-areas-index.json': 'not requested by any smoke',
}

/** `a/${x}/b.json` and `a/{x}/b.json` both become `a/*\/b.json`. */
const normalise = (p: string): string =>
  p.replace(/\$\{[^}]*\}/g, '*').replace(/\{[^}]*\}/g, '*')

/** A source pattern as a regex: each `*` is one or more path characters. */
const asRegex = (pattern: string): RegExp =>
  new RegExp(
    '^' +
      pattern
        .split('*')
        .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+') +
      '$'
  )

const servicesDir = path.join(ROOT, 'frontend/src/services')
const reads = fs
  .readdirSync(servicesDir)
  .filter(f => f.endsWith('.ts'))
  .flatMap(f =>
    [
      ...fs
        .readFileSync(path.join(servicesDir, f), 'utf-8')
        .matchAll(/(?:cdnBaseUrl\(\)|CDN_BASE_URL)\}\/([^`'"\s]+)/g),
    ].map(m => ({ file: f, pattern: normalise(m[1] as string) }))
  )

describe('the fixtures manifest covers what the frontend reads (#2545)', () => {
  it('finds the CDN reads', () => {
    expect(reads.length).toBeGreaterThan(20)
  })

  const entries = manifest.paths.map(e => normalise(e.path).replace(/\*/g, 'x'))

  it.each(reads.map(r => [r.file, r.pattern]))(
    '%s: %s has a manifest entry or a reason',
    (_file, pattern) => {
      const rx = asRegex(pattern as string)
      const covered = entries.some(e => rx.test(e))
      const excused = Object.keys(NOT_READ_BY_ANY_SMOKE).some(p => rx.test(p))
      expect(covered || excused).toBe(true)
    }
  )

  it('names a reason for every exclusion that is still not in the manifest', () => {
    for (const [file, why] of Object.entries(NOT_READ_BY_ANY_SMOKE)) {
      expect(why).not.toBe('')
      expect(manifest.paths.map(e => e.path)).not.toContain(file)
    }
  })
})

describe('families read through a path helper are named in the manifest (#2545)', () => {
  // `${educationRollupObjectPath(py)}` normalises to a bare wildcard, which
  // matches anything; name each family so it cannot be dropped unseen.
  it.each([
    'time-series/regions/',
    'derived/education-rollup/',
    'derived/education-timeline/',
    'config/charter-cohort-survival/',
    'snapshots/{date}/clubs-by-region/',
    'config/club-district-history/',
  ])('has an entry under %s', family => {
    expect(manifest.paths.some(e => e.path.startsWith(family))).toBe(true)
  })
})

describe('the basemap archive is served from the committed extract (#2545)', () => {
  const config = fs.readFileSync(
    path.join(ROOT, 'frontend/src/config/basemap.ts'),
    'utf-8'
  )
  const objectPath = /BASEMAP_OBJECT_PATH =\s*'([^']+)'/.exec(config)?.[1]

  it('has an entry for the archive path the build reads', () => {
    expect(objectPath).toBeDefined()
    const entry = manifest.paths.find(e => e.path === objectPath)
    expect(entry?.copyFrom).toBe('frontend/e2e/fixtures/basemap-z0.pmtiles')
    expect(fs.existsSync(path.join(ROOT, entry?.copyFrom ?? 'missing'))).toBe(
      true
    )
  })
})

describe('the live checks the fixtures never replace (#2545)', () => {
  it('lists no path under another origin', () => {
    expect(manifest.origin).toBe('https://cdn-staging.taverns.red')
  })
})

describe('the education timeline objects (#2592)', () => {
  const timelines = manifest.paths.filter(e =>
    e.path.startsWith('derived/education-timeline/')
  )

  it('names the world, region and district files', () => {
    const paths = timelines.map(e => e.path)
    expect(paths.some(p => p.endsWith('/world.json'))).toBe(true)
    expect(paths.some(p => /\/region-[^/]+\.json$/.test(p))).toBe(true)
    expect(paths.some(p => /\/district-[^/]+\.json$/.test(p))).toBe(true)
  })

  it('records every one as optional: staging has none until the backfill runs', () => {
    expect(timelines.length).toBeGreaterThan(0)
    for (const e of timelines) expect(e.optional).toBe(true)
  })
})
