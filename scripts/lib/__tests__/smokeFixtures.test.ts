/**
 * Contract: the run-scoped CDN fixtures for PR Preview (#2545).
 *
 * The `fixtures` job fetches what the shards read from cdn-staging ONCE and
 * hands it to every shard. That fetch is also the schema check for staging
 * data, so drift fails one job, with the path, before any shard starts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  dateRoles,
  expandManifest,
  formatReport,
  parseManifest,
  programYearsFrom,
  refreshFixtures,
  uncoveredPaths,
  validateObject,
  SCHEMA_RULES,
  type FetchFn,
  type Manifest,
  type SchemaRule,
} from '../smokeFixtures'

const ORIGIN = 'https://cdn-staging.taverns.red'
const text = (s: string) => new TextEncoder().encode(s)

describe('parseManifest', () => {
  const good = {
    origin: ORIGIN,
    districts: ['61', '86'],
    paths: [{ path: 'v1/latest.json' }],
  }

  it('accepts a well-formed manifest', () => {
    expect(parseManifest(good).paths).toHaveLength(1)
  })

  it.each([
    ['no origin', { ...good, origin: undefined }],
    ['a non-https origin', { ...good, origin: 'http://x' }],
    ['no paths', { ...good, paths: [] }],
    ['an empty path', { ...good, paths: [{ path: '' }] }],
    ['a leading slash', { ...good, paths: [{ path: '/v1/latest.json' }] }],
    ['a path that climbs', { ...good, paths: [{ path: 'a/../b.json' }] }],
    ['a non-numeric district', { ...good, districts: ['6/1'] }],
  ])('rejects %s', (_name, json) => {
    expect(() => parseManifest(json)).toThrow()
  })
})

describe('dateRoles', () => {
  const dates = [
    '2025-06-30',
    '2026-06-30',
    '2026-10-23',
    '2026-10-24',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07',
  ]

  it('names the latest, the one before it, 14 days back and every June 30', () => {
    expect(dateRoles('2026-11-07', dates)).toEqual({
      date: '2026-11-07',
      prev: '2026-11-06',
      ago14: '2026-10-24',
      yearEnds: ['2025-06-30', '2026-06-30'],
      monthEnds: ['2025-06-30', '2026-06-30'],
    })
  })

  it('names the weekly dates the club page Recent changes card reads (#2655)', () => {
    // Mirrors `pickFeedDates` (frontend/src/utils/clubChangeFeed.ts): the
    // newest date, then the newest at least 7 days before each pick, within
    // 90 days. The club page reads these as soon as the card nears the
    // viewport, so a smoke that scrolls there needs them.
    const r = dateRoles('2026-11-12', [
      '2026-08-01',
      '2026-08-14',
      '2026-09-30',
      '2026-10-29',
      '2026-11-05',
      '2026-11-11',
      '2026-11-12',
    ])
    expect(r.feed).toEqual([
      '2026-08-14',
      '2026-09-30',
      '2026-10-29',
      '2026-11-05',
      '2026-11-12',
    ])
  })

  it('expands {feed} to those dates', () => {
    const out = expandManifest(
      {
        origin: ORIGIN,
        districts: ['61'],
        paths: [{ path: 'snapshots/{feed}/district_{district}.json' }],
      },
      {
        date: '2026-11-07',
        prev: null,
        ago14: null,
        yearEnds: [],
        monthEnds: [],
        feed: ['2026-10-01', '2026-11-07'],
        py: [],
      }
    )
    expect(out.map(e => e.path)).toEqual([
      'snapshots/2026-10-01/district_61.json',
      'snapshots/2026-11-07/district_61.json',
    ])
  })

  it('keeps only month-ends within the last 26 months', () => {
    const r = dateRoles('2026-11-07', [
      '2024-08-31',
      '2024-09-30',
      '2026-09-30',
      '2026-10-15',
      '2026-11-07',
    ])
    expect(r.monthEnds).toEqual(['2024-09-30', '2026-09-30'])
  })

  it('takes the newest date on or before 14 days back', () => {
    const r = dateRoles('2026-11-07', ['2026-10-20', '2026-11-07'])
    expect(r.ago14).toBe('2026-10-20')
  })

  it('is null for a role the dates cannot fill', () => {
    const r = dateRoles('2026-11-07', ['2026-11-07'])
    expect(r.prev).toBeNull()
    expect(r.ago14).toBeNull()
  })

  it('refuses a latest that is not a calendar date', () => {
    expect(() => dateRoles('2026-13-45', dates)).toThrow(/date/)
    expect(() => dateRoles('../x', dates)).toThrow(/date/)
  })
})

describe('programYearsFrom', () => {
  it('is the newest three listed program years, oldest first', () => {
    expect(
      programYearsFrom({
        availableProgramYears: [
          '2026-2027',
          '2023-2024',
          '2024-2025',
          '2025-2026',
        ],
      })
    ).toEqual(['2024-2025', '2025-2026', '2026-2027'])
  })

  it('is empty when none is listed', () => {
    expect(programYearsFrom({ availableProgramYears: [] })).toEqual([])
    expect(programYearsFrom(null)).toEqual([])
  })
})

describe('expandManifest', () => {
  const vars = {
    date: '2026-11-07',
    prev: '2026-11-06',
    ago14: null,
    yearEnds: ['2025-06-30', '2026-06-30'],
    monthEnds: ['2026-09-30'],
    py: ['2025-2026', '2026-2027'],
    allDistrict: ['02', '61'],
    shard: ['00', '01'],
    region: ['05', 'unassigned'],
  }
  const manifest = (paths: Manifest['paths']): Manifest => ({
    origin: ORIGIN,
    districts: ['61', '86'],
    paths,
  })

  it('crosses a district placeholder with every manifest district', () => {
    const out = expandManifest(
      manifest([{ path: 'snapshots/{date}/district_{district}.json' }]),
      vars
    )
    expect(out.map(e => e.path)).toEqual([
      'snapshots/2026-11-07/district_61.json',
      'snapshots/2026-11-07/district_86.json',
    ])
  })

  it('lets an entry name its own districts and expands a role with many dates', () => {
    const out = expandManifest(
      manifest([
        {
          path: 'snapshots/{yearEnd}/district_{district}.json',
          districts: ['61'],
        },
      ]),
      vars
    )
    expect(out.map(e => e.path)).toEqual([
      'snapshots/2025-06-30/district_61.json',
      'snapshots/2026-06-30/district_61.json',
    ])
  })

  it('expands program years and carries optional and copyFrom through', () => {
    const out = expandManifest(
      manifest([
        { path: 'time-series/district_61/{py}.json', optional: true },
        {
          path: 'basemap/a.pmtiles',
          copyFrom: 'frontend/e2e/fixtures/b.pmtiles',
        },
      ]),
      vars
    )
    expect(out).toEqual([
      {
        path: 'time-series/district_61/2025-2026.json',
        optional: true,
      },
      {
        path: 'time-series/district_61/2026-2027.json',
        optional: true,
      },
      {
        path: 'basemap/a.pmtiles',
        optional: false,
        copyFrom: 'frontend/e2e/fixtures/b.pmtiles',
      },
    ])
  })

  it('expands the rest of the placeholders the shards need', () => {
    const out = expandManifest(
      manifest([
        { path: 'time-series/district_{allDistrict}/{pyCurrent}.json' },
        { path: 'config/club-district-history/{shard}.json' },
        { path: 'snapshots/{date}/clubs-by-region/{region}.json' },
        { path: 'snapshots/{monthEnd}/all-districts-rankings.json' },
      ]),
      vars
    )
    expect(out.map(e => e.path)).toEqual([
      'time-series/district_02/2026-2027.json',
      'time-series/district_61/2026-2027.json',
      'config/club-district-history/00.json',
      'config/club-district-history/01.json',
      'snapshots/2026-11-07/clubs-by-region/05.json',
      'snapshots/2026-11-07/clubs-by-region/unassigned.json',
      'snapshots/2026-09-30/all-districts-rankings.json',
    ])
  })

  it('skips an entry whose date role has no date, without failing', () => {
    const out = expandManifest(
      manifest([{ path: 'snapshots/{ago14}/district_{district}.json' }]),
      vars
    )
    expect(out).toEqual([])
  })

  it('throws on a placeholder it does not know, and on dedupes', () => {
    expect(() =>
      expandManifest(manifest([{ path: 'x/{nope}.json' }]), vars)
    ).toThrow(/nope/)
    const twice = expandManifest(
      manifest([{ path: 'v1/latest.json' }, { path: 'v1/latest.json' }]),
      vars
    )
    expect(twice).toHaveLength(1)
  })
})

describe('uncoveredPaths', () => {
  it('lists the recorded paths the manifest does not produce', () => {
    expect(
      uncoveredPaths(
        ['v1/latest.json', 'v1/new.json', 'v1/new.json'],
        [{ path: 'v1/latest.json', optional: false }]
      )
    ).toEqual(['v1/new.json'])
  })
})

describe('validateObject', () => {
  const rules: SchemaRule[] = [
    {
      name: 'Thing',
      match: /^things\/[^/]+\.json$/,
      schema: z.object({ n: z.number() }),
    },
  ]

  it('is ok for a body its schema accepts', () => {
    expect(validateObject('things/a.json', text('{"n":1}'), rules)).toEqual({
      kind: 'ok',
      schema: 'Thing',
    })
  })

  it('names the zod issue when the schema rejects it', () => {
    const v = validateObject('things/a.json', text('{"n":"x"}'), rules)
    expect(v.kind).toBe('invalid')
    expect(v.kind === 'invalid' && v.detail).toMatch(/n:/)
  })

  it('names a nested gzip body (#1702), which no browser can parse', () => {
    const v = validateObject(
      'things/a.json',
      new Uint8Array(gzipSync(text('{"n":1}'))),
      rules
    )
    expect(v.kind).toBe('notjson')
    expect(v.kind === 'notjson' && v.detail).toMatch(/gzip/)
  })

  it('is notjson for a .json path that is not JSON', () => {
    expect(validateObject('things/a.json', text('<html>'), rules).kind).toBe(
      'notjson'
    )
  })

  it('is unvalidated, not failed, for a path with no schema, and for non-JSON files', () => {
    expect(validateObject('other/a.json', text('{}'), rules).kind).toBe(
      'unvalidated'
    )
    expect(validateObject('basemap/a.pmtiles', text('PM'), rules).kind).toBe(
      'unvalidated'
    )
  })
})

describe('refreshFixtures', () => {
  let out = ''
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), '2545-refresh-'))
  })
  afterEach(() => rmSync(out, { recursive: true, force: true }))

  const rules: SchemaRule[] = [
    { name: 'Thing', match: /^things\//, schema: z.object({ n: z.number() }) },
  ]
  const json = (v: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: text(JSON.stringify(v)),
  })
  const meta = {
    availableProgramYears: ['2025-2026', '2026-2027'],
  }
  const world: Record<string, ReturnType<typeof json>> = {
    'v1/latest.json': json({ latestSnapshotDate: '2026-11-07' }),
    'v1/dates.json': json({ dates: ['2026-11-06', '2026-11-07'] }),
    'time-series/district_61/index-metadata.json': json(meta),
    'things/a.json': json({ n: 1 }),
    'v1/gone.json': json({ error: 'nope' }, 404),
  }
  const fetchFrom =
    (objects: typeof world, calls: string[] = []): FetchFn =>
    async url => {
      const path = url.replace(`${ORIGIN}/`, '')
      calls.push(path)
      const hit = objects[path]
      if (!hit)
        return { status: 404, contentType: 'text/plain', body: text('') }
      return hit
    }
  const manifest = (paths: Manifest['paths']): Manifest => ({
    origin: ORIGIN,
    districts: ['61'],
    paths: [
      { path: 'v1/latest.json' },
      { path: 'v1/dates.json' },
      { path: 'time-series/district_61/index-metadata.json' },
      ...paths,
    ],
  })

  it('writes every object, a 404 marked optional too, and an index', async () => {
    const report = await refreshFixtures({
      manifest: manifest([
        { path: 'things/a.json' },
        { path: 'v1/gone.json', optional: true },
      ]),
      outDir: out,
      fetchFn: fetchFrom(world),
      rules,
    })
    expect(report.failures).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.date).toBe('2026-11-07')
    expect(readFileSync(join(out, 'things/a.json'), 'utf8')).toBe('{"n":1}')
    const index = JSON.parse(readFileSync(join(out, '_index.json'), 'utf8'))
    expect(index['things/a.json']).toEqual({
      status: 200,
      contentType: 'application/json',
    })
    expect(index['v1/gone.json'].status).toBe(404)
  })

  it('fetches each object once, though roles and entries both name it', async () => {
    const calls: string[] = []
    await refreshFixtures({
      manifest: manifest([{ path: 'things/a.json' }]),
      outDir: out,
      fetchFn: fetchFrom(world, calls),
      rules,
    })
    expect(calls.filter(c => c === 'v1/latest.json')).toHaveLength(1)
    expect(calls.filter(c => c === 'v1/dates.json')).toHaveLength(1)
  })

  it('fails with the path and the zod issue when staging has drifted', async () => {
    const report = await refreshFixtures({
      manifest: manifest([{ path: 'things/a.json' }]),
      outDir: out,
      fetchFn: fetchFrom({ ...world, 'things/a.json': json({ n: 'x' }) }),
      rules,
    })
    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toMatch(/things\/a\.json.*Thing.*n:/)
  })

  it('fails on a 404 for a path not marked optional', async () => {
    const report = await refreshFixtures({
      manifest: manifest([{ path: 'v1/gone.json' }]),
      outDir: out,
      fetchFn: fetchFrom(world),
      rules,
    })
    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toMatch(/v1\/gone\.json.*404/)
  })

  it('fails, without fetching more, when latest.json is unreadable', async () => {
    const calls: string[] = []
    const report = await refreshFixtures({
      manifest: manifest([{ path: 'things/a.json' }]),
      outDir: out,
      fetchFn: fetchFrom({ ...world, 'v1/latest.json': json({ x: 1 }) }, calls),
      rules,
    })
    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toMatch(/latest\.json/)
    expect(calls).not.toContain('things/a.json')
  })

  it('fails when a fetch throws', async () => {
    const report = await refreshFixtures({
      manifest: manifest([{ path: 'things/a.json' }]),
      outDir: out,
      fetchFn: async url => {
        if (url.endsWith('things/a.json')) throw new Error('ECONNRESET')
        return fetchFrom(world)(url)
      },
      rules,
    })
    expect(report.ok).toBe(false)
    expect(report.failures.join('\n')).toMatch(/things\/a\.json.*ECONNRESET/)
  })

  it('resolves {allDistrict}, {shard} and {region} from the CDN, and only when used', async () => {
    const calls: string[] = []
    const objects = {
      ...world,
      'v1/rankings.json': json({
        rankings: [{ districtId: '02' }, { districtId: '61' }],
      }),
      'config/club-district-history/index.json': json({
        shards: ['00', '01'],
      }),
      'snapshots/2026-11-07/region-rollups.json': json({
        regions: { '05': {}, '06': {} },
      }),
      'time-series/district_02/2026-2027.json': json({ n: 1 }),
      'time-series/district_61/2026-2027.json': json({ n: 1 }),
      'config/club-district-history/00.json': json({ n: 1 }),
      'config/club-district-history/01.json': json({ n: 1 }),
      'snapshots/2026-11-07/clubs-by-region/05.json': json({ n: 1 }),
      'snapshots/2026-11-07/clubs-by-region/06.json': json({ n: 1 }),
      'snapshots/2026-11-07/clubs-by-region/unassigned.json': json({ n: 1 }),
    }
    const without = await refreshFixtures({
      manifest: manifest([{ path: 'things/a.json' }]),
      outDir: out,
      fetchFn: fetchFrom(world, calls),
      rules,
    })
    expect(without.ok).toBe(true)
    expect(calls).not.toContain('v1/rankings.json')

    const report = await refreshFixtures({
      manifest: manifest([
        { path: 'v1/rankings.json' },
        { path: 'config/club-district-history/index.json' },
        { path: 'snapshots/{date}/region-rollups.json' },
        { path: 'time-series/district_{allDistrict}/{pyCurrent}.json' },
        { path: 'config/club-district-history/{shard}.json' },
        { path: 'snapshots/{date}/clubs-by-region/{region}.json' },
      ]),
      outDir: out,
      fetchFn: fetchFrom(objects),
      rules,
    })
    expect(report.failures).toEqual([])
    const index = JSON.parse(readFileSync(join(out, '_index.json'), 'utf8'))
    expect(Object.keys(index)).toEqual(
      expect.arrayContaining([
        'time-series/district_02/2026-2027.json',
        'config/club-district-history/01.json',
        'snapshots/2026-11-07/clubs-by-region/unassigned.json',
      ])
    )
  })

  it('lists a path with no schema as unvalidated, not as a failure', async () => {
    const report = await refreshFixtures({
      manifest: manifest([]),
      outDir: out,
      fetchFn: fetchFrom(world),
      rules,
    })
    expect(report.ok).toBe(true)
    expect(report.unvalidated).toContain('v1/latest.json')
  })

  it('copies a local file for a copyFrom entry without fetching it', async () => {
    const calls: string[] = []
    const report = await refreshFixtures({
      manifest: manifest([
        { path: 'basemap/a.pmtiles', copyFrom: 'x/b.pmtiles' },
      ]),
      outDir: out,
      fetchFn: fetchFrom(world, calls),
      rules,
      readLocal: p => text(`local:${p}`),
    })
    expect(report.ok).toBe(true)
    expect(calls).not.toContain('basemap/a.pmtiles')
    expect(readFileSync(join(out, 'basemap/a.pmtiles'), 'utf8')).toBe(
      'local:x/b.pmtiles'
    )
    const index = JSON.parse(readFileSync(join(out, '_index.json'), 'utf8'))
    expect(index['basemap/a.pmtiles'].contentType).toBe(
      'application/octet-stream'
    )
  })
})

describe('formatReport', () => {
  it('leads with the verdict and lists failures', () => {
    const text = formatReport({
      ok: false,
      date: '2026-11-07',
      written: 3,
      bytes: 1234,
      failures: ['things/a.json: schema Thing: n: Expected number'],
      unvalidated: ['v1/latest.json'],
    })
    expect(text).toMatch(/^FAILED/)
    expect(text).toContain('things/a.json')
    expect(text).toContain('unvalidated')
  })
})

describe('the education timeline schema rule (#2592)', () => {
  const path = 'derived/education-timeline/2026-2027/district-61.json'
  const body = (o: unknown) => text(JSON.stringify(o))
  const file = JSON.parse(
    readFileSync(
      new URL(
        '../../../frontend/src/__tests__/fixtures/education-timeline-district-61.json',
        import.meta.url
      ),
      'utf-8'
    )
  )

  it('validates an entity file with the reader the frontend parses with', () => {
    expect(validateObject(path, body(file), SCHEMA_RULES)).toEqual({
      kind: 'ok',
      schema: 'EducationTimelineEntity',
    })
  })

  it('covers the world and region files too', () => {
    for (const p of [
      'derived/education-timeline/2026-2027/world.json',
      'derived/education-timeline/2026-2027/region-09.json',
    ]) {
      expect(validateObject(p, body({}), SCHEMA_RULES).kind).toBe('invalid')
    }
  })

  it('fails on drift, so a staging change fails before any shard starts', () => {
    const v = validateObject(path, body({ ...file, points: [] }), SCHEMA_RULES)
    expect(v.kind).toBe('invalid')
  })
})
