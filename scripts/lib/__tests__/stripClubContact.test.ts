/**
 * One-off contact strip (#2026, cleanup plan 2026-10-14 §3 steps 2-3).
 *
 * The objects it rewrites are CDN-served snapshot/analytics JSON. The 10-14
 * probe of staging (district_61.json and its four analytics siblings,
 * district_201.json on 06-30, analytics/manifest.json) found every one stored
 * as exactly one gzip layer (`Content-Encoding: gzip`), serialized
 * `JSON.stringify(value, null, 2)` with no trailing newline. The fixtures
 * below are that shape, with synthetic contact values.
 *
 * The contract: remove the `email` and `phone` keys and nothing else. Every
 * other byte of the JSON text, the gzip layer count and the object metadata
 * stay as they were; each write carries the generation it read; and the
 * audit rows never carry a value.
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  BUCKETS,
  countContactKeys,
  detectJsonFormat,
  parseDates,
  preservedWriteMetadata,
  runStrip,
  stripContactKeys,
  stripStoredObject,
  toJsonl,
  type StoredObjectMeta,
  type StripIo,
  type WriteMetadata,
} from '../stripClubContact.js'

// ---------------------------------------------------------------- fixtures

const EMAIL = 'synthetic.secret@example.invalid'
const PHONE = '+1 555 0100 777'

/** A FAC-enriched club, keys in the order the pipeline writes them. */
function club(id: string, contact = true): Record<string, unknown> {
  return {
    clubId: id,
    clubName: `Club ${id} — Montréal 🎤`,
    divisionId: 'A',
    areaId: '1',
    membershipCount: 21,
    dcpGoalsAchieved: [true, false],
    charterDate: '2001-02-03',
    coordinates: { lat: 45.5, lng: -73.56 },
    address: {
      street: '1 Rue Exemple',
      city: 'Montréal',
      region: 'QC',
      postalCode: 'H0H 0H0',
      country: 'CA',
    },
    ...(contact ? { email: EMAIL, phone: PHONE } : {}),
    website: 'https://club.example.invalid',
    facebookLink: 'https://facebook.example.invalid/club',
    meetingDay: 'Tuesday',
    meetingTime: '19:00',
    allowsVirtualAttendance: true,
    isProspective: false,
  }
}

function clubPerformanceRow(id: string): Record<string, unknown> {
  return {
    District: '61',
    'Club Number': id,
    'Club Name': `Club ${id}`,
    'Goals Met': '4',
    coordinates: { lat: 45.5, lng: -73.56 },
    email: EMAIL,
    phone: PHONE,
    website: 'https://club.example.invalid',
  }
}

function districtFile(): Record<string, unknown> {
  return {
    districtId: '61',
    districtName: 'District 61',
    collectedAt: '2026-10-14T09:00:00.000Z',
    status: 'success',
    data: {
      districtId: '61',
      snapshotDate: '2026-10-13',
      clubs: [club('100'), club('200'), club('300', false)],
      clubPerformance: [clubPerformanceRow('100'), clubPerformanceRow('200')],
      // A blank contact key is still a contact key: it is removed too.
      prospectiveClubs: [{ ...club('900'), email: '', phone: '' }],
      totals: { totalClubs: 3, totalMembership: 63 },
    },
  }
}

function analyticsFile(): Record<string, unknown> {
  return {
    metadata: {
      schemaVersion: '1.0.0',
      computedAt: '2026-10-14T09:01:00.000Z',
      snapshotDate: '2026-10-13',
      districtId: '61',
      checksum: 'a'.repeat(64),
    },
    data: {
      districtId: '61',
      allClubs: [club('100'), club('200')],
      vulnerableClubs: [{ club: club('100'), riskFactors: ['membership'] }],
    },
  }
}

/** Stored the way the pipeline stores it: 2-space JSON, one gzip layer. */
const stored = (value: unknown, layers = 1, indent = 2): Buffer => {
  let bytes = Buffer.from(JSON.stringify(value, null, indent), 'utf-8')
  for (let i = 0; i < layers; i++) bytes = gzipSync(bytes)
  return bytes
}

/** Peel every gzip layer, counting them. */
const peel = (bytes: Buffer): { text: string; layers: number } => {
  let data = bytes
  let layers = 0
  while (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    data = gunzipSync(data)
    layers++
  }
  return { text: data.toString('utf-8'), layers }
}

/**
 * Independent byte-level oracle. In 2-space JSON every primitive member sits
 * on its own line, so removing the contact members is removing those lines.
 * The fixtures never put a contact key last in its object, so no trailing
 * comma needs fixing.
 */
const withoutContactLines = (text: string): string =>
  text
    .split('\n')
    .filter(line => !/^\s*"(email|phone)": /.test(line))
    .join('\n')

const md5 = (bytes: Buffer): string =>
  createHash('md5').update(bytes).digest('base64')

// ------------------------------------------------------ detectJsonFormat

describe('detectJsonFormat', () => {
  const v = { a: 1, b: [1, { c: 'x' }] }

  it('recognises the pipeline format: 2-space indent, no trailing newline', () => {
    expect(detectJsonFormat(JSON.stringify(v, null, 2))).toEqual({
      indent: 2,
      trailingNewline: false,
    })
  })

  it('recognises compact JSON and a trailing newline', () => {
    expect(detectJsonFormat(JSON.stringify(v))).toEqual({
      indent: 0,
      trailingNewline: false,
    })
    expect(detectJsonFormat(JSON.stringify(v, null, 4) + '\n')).toEqual({
      indent: 4,
      trailingNewline: true,
    })
  })

  it('returns null when no canonical format reproduces the text exactly', () => {
    expect(detectJsonFormat('{"a": 1.0}')).toBeNull()
    expect(detectJsonFormat('{"a":1,"a":2}')).toBeNull()
    expect(detectJsonFormat('{ "a": 1 }')).toBeNull()
    expect(detectJsonFormat('{"a":"\\u00e9"}')).toBeNull()
  })
})

// ------------------------------------------------------ stripContactKeys

describe('stripContactKeys', () => {
  it('removes email and phone at every depth, blank or not', () => {
    const { value, removed } = stripContactKeys(districtFile())
    // clubs 2×2, clubPerformance 2×2, prospectiveClubs 1×2 (blank values)
    expect(removed).toBe(10)
    expect(countContactKeys(value)).toBe(0)
  })

  it('keeps every other key, including website, facebookLink and coordinates', () => {
    const before = districtFile()
    const { value } = stripContactKeys(before)
    const data = (value as { data: { clubs: Record<string, unknown>[] } }).data
    expect(Object.keys(data.clubs[0])).toEqual(
      Object.keys(club('100')).filter(k => k !== 'email' && k !== 'phone')
    )
    expect(data.clubs[0].website).toBe('https://club.example.invalid')
    expect(data.clubs[0].facebookLink).toBe(
      'https://facebook.example.invalid/club'
    )
    expect(data.clubs[0].coordinates).toEqual({ lat: 45.5, lng: -73.56 })
    // Re-adding the removed keys gives back the original, value for value.
    expect(data.clubs[2]).toEqual(club('300', false))
  })

  it('does not mutate its input', () => {
    const before = districtFile()
    const copy = JSON.parse(JSON.stringify(before))
    stripContactKeys(before)
    expect(before).toEqual(copy)
  })
})

// ------------------------------------------------------ stripStoredObject

describe('stripStoredObject', () => {
  it.each([
    ['district_<n>.json', districtFile],
    ['analytics/district_<n>_analytics.json', analyticsFile],
  ])(
    '%s: output is the original text minus the contact lines, byte for byte',
    (_kind, make) => {
      const original = stored(make())
      const result = stripStoredObject(original)
      expect(result.changed).toBe(true)
      if (!result.changed) return
      const out = peel(result.bytes)
      expect(out.text).toBe(withoutContactLines(peel(original).text))
      expect(out.layers).toBe(1)
      expect(result.gzipLayers).toBe(1)
      expect(countContactKeys(JSON.parse(out.text))).toBe(0)
    }
  )

  it('leaves the embedded metadata block untouched', () => {
    const result = stripStoredObject(stored(analyticsFile()))
    if (!result.changed) throw new Error('expected a change')
    const out = JSON.parse(peel(result.bytes).text) as {
      metadata: unknown
    }
    expect(out.metadata).toEqual(analyticsFile().metadata)
  })

  it('keeps the gzip layer count whatever it is', () => {
    for (const layers of [0, 1, 2]) {
      const result = stripStoredObject(stored(districtFile(), layers))
      if (!result.changed) throw new Error('expected a change')
      expect(peel(result.bytes).layers).toBe(layers)
      expect(result.gzipLayers).toBe(layers)
    }
  })

  it('keeps a non-default format (4-space indent)', () => {
    const original = stored(districtFile(), 1, 4)
    const result = stripStoredObject(original)
    if (!result.changed) throw new Error('expected a change')
    const { value } = stripContactKeys(districtFile())
    expect(peel(result.bytes).text).toBe(JSON.stringify(value, null, 4))
  })

  it('reports no change, and produces no bytes, for an object without contact keys', () => {
    const clean = stored(stripContactKeys(districtFile()).value)
    const result = stripStoredObject(clean)
    expect(result).toEqual({ changed: false, gzipLayers: 1 })
  })

  it('is idempotent: stripping its own output changes nothing', () => {
    const first = stripStoredObject(stored(districtFile()))
    if (!first.changed) throw new Error('expected a change')
    expect(stripStoredObject(first.bytes)).toEqual({
      changed: false,
      gzipLayers: 1,
    })
  })

  it('refuses an object whose formatting it cannot reproduce exactly', () => {
    const odd = gzipSync(
      Buffer.from(`{ "email": "${EMAIL}", "n": 1.0 }`, 'utf-8')
    )
    expect(() => stripStoredObject(odd)).toThrow(/format/)
  })

  it('refuses non-JSON without echoing the content', () => {
    const bad = gzipSync(Buffer.from(`{"email": "${EMAIL}"`, 'utf-8'))
    let message = ''
    try {
      stripStoredObject(bad)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/not JSON/)
    expect(message).not.toContain(EMAIL)
  })
})

// --------------------------------------------------- preservedWriteMetadata

describe('preservedWriteMetadata', () => {
  it('carries over every writable header and custom metadata, nothing else', () => {
    const meta: StoredObjectMeta = {
      name: 'snapshots/2026-10-13/district_61.json',
      generation: '1791968779530663',
      md5Hash: 'abc==',
      size: '52857',
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
      contentDisposition: 'inline',
      contentLanguage: 'en',
      metadata: { 'goog-reserved-file-mtime': '1' },
    }
    expect(preservedWriteMetadata(meta)).toEqual({
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
      contentDisposition: 'inline',
      contentLanguage: 'en',
      metadata: { 'goog-reserved-file-mtime': '1' },
    })
  })

  it('omits headers the original does not have', () => {
    expect(
      preservedWriteMetadata({
        name: 'x.json',
        generation: '1',
        contentType: 'application/json',
        contentEncoding: 'gzip',
      })
    ).toEqual({ contentType: 'application/json', contentEncoding: 'gzip' })
  })
})

// ------------------------------------------------------------- parseDates

describe('parseDates', () => {
  it('accepts a comma/space separated list of ISO dates, deduplicated', () => {
    expect(parseDates('2026-06-30, 2026-10-09 2026-10-09')).toEqual([
      '2026-06-30',
      '2026-10-09',
    ])
  })

  it('rejects anything that is not a plain date (no path segments)', () => {
    expect(() => parseDates('2026-10-09/../config')).toThrow()
    expect(() => parseDates('')).toThrow()
    expect(() => parseDates('2026-13-01')).toThrow()
  })

  it('names the two buckets explicitly', () => {
    expect(BUCKETS).toEqual({
      staging: 'toast-stats-data-staging',
      prod: 'toast-stats-data-ca',
    })
  })
})

// ---------------------------------------------------------------- runStrip

const HEADERS = {
  contentType: 'application/json',
  contentEncoding: 'gzip',
  cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
}

interface FakeObject {
  bytes: Buffer
  meta: StoredObjectMeta
}

/** An in-memory bucket with real generation-match semantics. */
class FakeBucket implements StripIo {
  objects = new Map<string, FakeObject>()
  writes: Array<{ name: string; ifGenerationMatch: string }> = []
  lists: string[] = []
  private nextGeneration = 1000
  /** Bumps the generation of `name` just before its write (a racing writer). */
  raceOn: string | null = null
  /** Makes the server answer a write with these headers instead. */
  tamperHeaders: Partial<WriteMetadata> | null = null

  put(name: string, bytes: Buffer, headers: Partial<WriteMetadata> = HEADERS) {
    this.objects.set(name, {
      bytes,
      meta: {
        name,
        generation: String(this.nextGeneration++),
        md5Hash: md5(bytes),
        size: String(bytes.length),
        ...headers,
      },
    })
  }

  async list(prefix: string): Promise<StoredObjectMeta[]> {
    this.lists.push(prefix)
    return [...this.objects.values()]
      .filter(o => o.meta.name.startsWith(prefix))
      .map(o => ({ ...o.meta }))
  }

  async read(name: string, generation: string): Promise<Buffer> {
    const o = this.objects.get(name)
    if (!o || o.meta.generation !== generation) {
      throw Object.assign(new Error('No such object'), { code: 404 })
    }
    return o.bytes
  }

  async write(
    name: string,
    bytes: Buffer,
    metadata: WriteMetadata,
    ifGenerationMatch: string
  ): Promise<StoredObjectMeta> {
    this.writes.push({ name, ifGenerationMatch })
    if (this.raceOn === name) this.put(name, this.objects.get(name)!.bytes)
    const current = this.objects.get(name)
    if (!current || current.meta.generation !== ifGenerationMatch) {
      throw Object.assign(new Error('Precondition Failed'), { code: 412 })
    }
    this.put(name, bytes, { ...metadata, ...(this.tamperHeaders ?? {}) })
    return { ...this.objects.get(name)!.meta }
  }
}

const D = '2026-10-13'
const P = `snapshots/${D}`

function seeded(): FakeBucket {
  const b = new FakeBucket()
  b.put(`${P}/district_61.json`, stored(districtFile()))
  b.put(`${P}/analytics/district_61_analytics.json`, stored(analyticsFile()))
  b.put(
    `${P}/analytics/district_61_reports.json`,
    stored({ metadata: { checksum: 'b' }, data: { rows: [1, 2] } })
  )
  b.put(`${P}/analytics/manifest.json`, stored({ files: [], totalFiles: 0 }))
  b.put(`${P}/notes.txt`, Buffer.from('not json'))
  b.put(`snapshots/2026-10-12/district_61.json`, stored(districtFile()))
  return b
}

describe('runStrip', () => {
  it('dry run: plans the rewrites and writes nothing', async () => {
    const b = seeded()
    const before = new Map(
      [...b.objects].map(([k, v]) => [k, v.meta.generation])
    )
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: true,
    })
    expect(b.writes).toEqual([])
    expect(
      new Map([...b.objects].map(([k, v]) => [k, v.meta.generation]))
    ).toEqual(before)
    expect(rows.filter(r => r.action === 'planned').map(r => r.path)).toEqual([
      `${P}/analytics/district_61_analytics.json`,
      `${P}/district_61.json`,
    ])
    expect(summary).toMatchObject({
      dryRun: true,
      objects: 4,
      planned: 2,
      stripped: 0,
      unchanged: 2,
      errors: 0,
    })
  })

  it('scopes to snapshots/<date>/ and to .json objects only', async () => {
    const b = seeded()
    const { rows } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: true,
    })
    expect(b.lists).toEqual([`${P}/`])
    expect(rows.map(r => r.path)).not.toContain(`${P}/notes.txt`)
    expect(rows.every(r => r.path.startsWith(`${P}/`))).toBe(true)
  })

  it('execute: writes each dirty object once, with the generation it read and the original headers', async () => {
    const b = seeded()
    const gen = b.objects.get(`${P}/district_61.json`)!.meta.generation
    const original = b.objects.get(`${P}/district_61.json`)!.bytes
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    })
    expect(b.writes).toHaveLength(2)
    expect(b.writes).toContainEqual({
      name: `${P}/district_61.json`,
      ifGenerationMatch: gen,
    })
    const after = b.objects.get(`${P}/district_61.json`)!
    expect(after.meta).toMatchObject(HEADERS)
    expect(peel(after.bytes).text).toBe(
      withoutContactLines(peel(original).text)
    )
    const row = rows.find(r => r.path === `${P}/district_61.json`)!
    expect(row).toEqual({
      bucket: 'toast-stats-data-staging',
      path: `${P}/district_61.json`,
      action: 'stripped',
      keysRemoved: 10,
      gzipLayers: 1,
      oldGeneration: gen,
      newGeneration: after.meta.generation,
      oldMd5: md5(original),
      newMd5: md5(after.bytes),
      postCheck: null,
    })
    expect(summary).toMatchObject({ stripped: 2, unchanged: 2, errors: 0 })
  })

  it('leaves clean objects byte-identical with their generation unchanged', async () => {
    const b = seeded()
    const name = `${P}/analytics/district_61_reports.json`
    const { generation } = b.objects.get(name)!.meta
    const bytes = b.objects.get(name)!.bytes
    await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    })
    expect(b.objects.get(name)!.meta.generation).toBe(generation)
    expect(b.objects.get(name)!.bytes.equals(bytes)).toBe(true)
  })

  it('is idempotent: a second execute run writes nothing', async () => {
    const b = seeded()
    const opts = {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    }
    await runStrip(b, opts)
    b.writes = []
    const { rows, summary } = await runStrip(b, opts)
    expect(b.writes).toEqual([])
    expect(rows.every(r => r.action === 'unchanged')).toBe(true)
    expect(summary).toMatchObject({ stripped: 0, unchanged: 4, errors: 0 })
  })

  it('a generation race fails that object (412), leaves it alone and carries on', async () => {
    const b = seeded()
    b.raceOn = `${P}/district_61.json`
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    })
    const row = rows.find(r => r.path === `${P}/district_61.json`)!
    expect(row.action).toBe('error')
    expect(row.error).toMatch(/412/)
    expect(row.newGeneration).toBeNull()
    expect(
      countContactKeys(
        JSON.parse(peel(b.objects.get(`${P}/district_61.json`)!.bytes).text)
      )
    ).toBeGreaterThan(0)
    expect(summary).toMatchObject({ stripped: 1, errors: 1 })
  })

  it('fails an object whose written headers do not match the original', async () => {
    const b = seeded()
    b.tamperHeaders = { cacheControl: 'no-store' }
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    })
    expect(rows.filter(r => r.action === 'error')).toHaveLength(2)
    expect(rows.find(r => r.action === 'error')!.error).toMatch(/cacheControl/)
    expect(summary.errors).toBe(2)
  })

  it('never records a contact value, in rows, errors or the JSONL', async () => {
    const b = seeded()
    b.put(
      `${P}/district_99.json`,
      gzipSync(Buffer.from(`{"email": "${EMAIL}", "phone": "${PHONE}"`))
    )
    b.raceOn = `${P}/district_61.json`
    const dry = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: true,
    })
    const wet = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D],
      dryRun: false,
    })
    for (const run of [dry, wet]) {
      const text = toJsonl(run.rows) + JSON.stringify(run.summary)
      expect(text).not.toContain(EMAIL)
      expect(text).not.toContain(PHONE)
      expect(text).not.toContain('synthetic')
    }
    expect(wet.rows.find(r => r.path === `${P}/district_99.json`)!.action).toBe(
      'error'
    )
  })

  it('toJsonl writes one parseable row per line', async () => {
    const b = seeded()
    const { rows } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: [D, '2026-10-12'],
      dryRun: true,
    })
    const lines = toJsonl(rows).trimEnd().split('\n')
    expect(lines).toHaveLength(rows.length)
    expect(lines.map(l => JSON.parse(l))).toEqual(rows)
  })
})
