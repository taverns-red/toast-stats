/**
 * The contact strip also scrubs meeting links out of published place text
 * (#2069, extending #2026).
 *
 * Prod files written before #2074 carry FAC `address.street` verbatim, and
 * some clubs typed their meeting link there. Club 977 (D201, prod
 * snapshots/2026-10-14, read 2026-10-15): "Zoom Link: <bit.ly link>,
 * <street>". The shapes below are recorded ones with the link, ids and
 * house numbers replaced by placeholders. No real link is fixtured.
 *
 * The contract: rewrite only a place-text value that contains a link,
 * through the same scrubbers the collector uses since #2074; every other
 * byte stays as it was.
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  countPlaceLinks,
  runStrip,
  scrubPlaceLinks,
  stripStoredObject,
  toJsonl,
  type StoredObjectMeta,
  type StripIo,
  type WriteMetadata,
} from '../stripClubContact.js'

const LINKED_STREET = 'Zoom Link: bit.ly/REDACTED977, 9999 Overland Ave'
const ONLY_LINK = 'https://us99web.zoom.us/j/99999999999'

/** A FAC-enriched club as written after #2030 (no email/phone). */
function club(id: string, street: string, day = 'Tuesday') {
  return {
    clubId: id,
    clubName: `Club ${id}`,
    address: {
      street,
      city: 'Culver City',
      region: 'CA',
      postalCode: '99999',
      country: 'United States',
    },
    website: 'https://bit.ly/REDACTEDSITE',
    meetingDay: day,
    meetingTime: '7:00 to 8:30 PM',
    allowsVirtualAttendance: true,
  }
}

const cleanClub = () => club('100', '9 Main St, Room 2')
const linkedClub = () => club('977', LINKED_STREET, 'Tuesday bit.ly/REDACTED00')
const onlyLinkClub = () => club('141', ONLY_LINK)
/**
 * A credential with no link. Until #2157 this tool left it alone; a meeting
 * id is a way into the meeting just as a link is, so it is scrubbed now.
 */
const CREDENTIAL_STREET = 'ZOOM ID 999 9999 9999'
const credentialClub = () => club('7708247', CREDENTIAL_STREET)
/** #2157: D02 club 7893475 typed its passcode into its city (redacted). */
const CREDENTIAL_CITY = 'Springfield Passcode: 000000'
const credentialCityClub = () => ({
  ...club('7893475', '9 Main St'),
  address: { ...club('7893475', '9 Main St').address, city: CREDENTIAL_CITY },
})

function districtFile() {
  return {
    districtId: '201',
    status: 'success',
    data: {
      districtId: '201',
      snapshotDate: '2026-10-14',
      clubs: [cleanClub(), linkedClub(), onlyLinkClub(), credentialClub()],
      clubPerformance: [
        { 'Club Number': '977', address: linkedClub().address },
      ],
    },
  }
}

function analyticsFile() {
  return {
    metadata: { snapshotDate: '2026-10-14', checksum: 'a'.repeat(64) },
    data: {
      allClubs: [cleanClub(), linkedClub()],
      vulnerableClubs: [{ club: linkedClub(), riskFactors: ['membership'] }],
    },
  }
}

/** club-trends-index keys clubs by id. */
function clubTrendsIndex() {
  return {
    metadata: { snapshotDate: '2026-10-14' },
    data: { clubs: { '977': linkedClub(), '100': cleanClub() } },
  }
}

const stored = (value: unknown): Buffer =>
  gzipSync(Buffer.from(JSON.stringify(value, null, 2), 'utf-8'))

const text = (bytes: Buffer): string => gunzipSync(bytes).toString('utf-8')

/**
 * Independent byte-level oracle: in 2-space JSON each value sits on its own
 * line, so scrubbing is replacing those lines (a dropped street loses its
 * line; it is never last in `address`).
 */
const oracle = (original: string): string =>
  original
    .split('\n')
    .flatMap(line => {
      if (line.includes(`"street": ${JSON.stringify(LINKED_STREET)}`)) {
        return [line.replace(LINKED_STREET, '9999 Overland Ave')]
      }
      if (line.includes(`"street": ${JSON.stringify(ONLY_LINK)}`)) return []
      if (line.includes(`"street": ${JSON.stringify(CREDENTIAL_STREET)}`)) {
        return []
      }
      if (line.includes('"meetingDay": "Tuesday bit.ly/REDACTED00"')) {
        return [line.replace('Tuesday bit.ly/REDACTED00', 'Tuesday')]
      }
      return [line]
    })
    .join('\n')

describe('scrubPlaceLinks (#2069)', () => {
  it("keeps club 977's street and drops its label and link", () => {
    const { value, scrubbed } = scrubPlaceLinks(linkedClub())
    expect(value).toMatchObject({
      address: { street: '9999 Overland Ave', city: 'Culver City' },
      meetingDay: 'Tuesday',
    })
    expect(scrubbed).toBe(2)
  })

  it('removes a street that is only a link, keeping the rest of the address', () => {
    const { value } = scrubPlaceLinks(onlyLinkClub())
    const address = (value as { address: Record<string, unknown> }).address
    expect(address).not.toHaveProperty('street')
    expect(address.city).toBe('Culver City')
  })

  it('changes only values that contain a link or a credential', () => {
    for (const c of [cleanClub()]) {
      const { value, scrubbed } = scrubPlaceLinks(c)
      expect(value).toEqual(c)
      expect(scrubbed).toBe(0)
    }
  })

  it('leaves the website alone (the frontend gate decides whether to show it)', () => {
    const { value } = scrubPlaceLinks(linkedClub())
    expect((value as { website: string }).website).toBe(
      'https://bit.ly/REDACTEDSITE'
    )
  })

  it('finds place links at any depth, in arrays and keyed objects', () => {
    expect(countPlaceLinks(districtFile())).toBe(5)
    expect(countPlaceLinks(analyticsFile())).toBe(4)
    expect(countPlaceLinks(clubTrendsIndex())).toBe(2)
    expect(countPlaceLinks(scrubPlaceLinks(districtFile()).value)).toBe(0)
  })

  it('does not mutate its input', () => {
    const before = districtFile()
    const copy = JSON.parse(JSON.stringify(before))
    scrubPlaceLinks(before)
    expect(before).toEqual(copy)
  })
})

describe('scrubPlaceLinks — meeting credentials (#2157)', () => {
  it('drops a credential from a city and keeps the city', () => {
    const { value, scrubbed } = scrubPlaceLinks(credentialCityClub())
    expect(value).toMatchObject({ address: { city: 'Springfield' } })
    expect(scrubbed).toBe(1)
  })

  it('removes a street that is only a credential', () => {
    const { value } = scrubPlaceLinks(credentialClub())
    expect((value as { address: object }).address).not.toHaveProperty('street')
  })

  it('scrubs a top-level city (prospectiveClubs, clubs-by-region rows)', () => {
    const shard = {
      clubs: [{ id: '7893475', name: 'Club X', city: CREDENTIAL_CITY }],
      prospectiveClubs: [{ clubId: '1', city: CREDENTIAL_CITY }],
    }
    const { value, scrubbed } = scrubPlaceLinks(shard)
    expect(value).toEqual({
      clubs: [{ id: '7893475', name: 'Club X', city: 'Springfield' }],
      prospectiveClubs: [{ clubId: '1', city: 'Springfield' }],
    })
    expect(scrubbed).toBe(2)
  })

  it('scrubs a credential out of a postal code', () => {
    const c = club('5', '9 Main St')
    const { value } = scrubPlaceLinks({
      ...c,
      address: { ...c.address, postalCode: '99999 PIN 0000' },
    })
    expect(value).toMatchObject({ address: { postalCode: '99999' } })
  })

  it('leaves a real "Pin…" city alone', () => {
    const c = club('6', '9 Main St')
    const pinner = { ...c, address: { ...c.address, city: 'Pinner' } }
    expect(scrubPlaceLinks(pinner)).toEqual({ value: pinner, scrubbed: 0 })
  })
})

describe('stripStoredObject — place links (#2069)', () => {
  it.each([
    ['district_<n>.json', districtFile],
    ['analytics/district_<n>_analytics.json', analyticsFile],
    ['analytics/district_<n>_club-trends-index.json', clubTrendsIndex],
  ])('%s: only the linked place lines change, byte for byte', (_kind, make) => {
    const original = stored(make())
    const result = stripStoredObject(original)
    expect(result.changed).toBe(true)
    if (!result.changed) return
    expect(text(result.bytes)).toBe(oracle(text(original)))
    expect(result.keysRemoved).toBe(0)
    expect(result.placeValuesScrubbed).toBe(countPlaceLinks(make()))
  })

  it('reports no change for an object with no link in its place text', () => {
    const clean = stored({ data: { clubs: [cleanClub()] } })
    expect(stripStoredObject(clean)).toEqual({ changed: false, gzipLayers: 1 })
  })

  it('is idempotent', () => {
    const first = stripStoredObject(stored(districtFile()))
    if (!first.changed) throw new Error('expected a change')
    expect(stripStoredObject(first.bytes)).toEqual({
      changed: false,
      gzipLayers: 1,
    })
  })
})

// ------------------------------------------------------------- runStrip

const md5 = (bytes: Buffer): string =>
  createHash('md5').update(bytes).digest('base64')

const HEADERS = {
  contentType: 'application/json',
  contentEncoding: 'gzip',
  cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
}

/** An in-memory bucket with generation-match semantics. */
class FakeBucket implements StripIo {
  objects = new Map<string, { bytes: Buffer; meta: StoredObjectMeta }>()
  writes: Array<{ name: string; ifGenerationMatch: string }> = []
  private next = 1000

  put(name: string, bytes: Buffer, headers: Partial<WriteMetadata> = HEADERS) {
    this.objects.set(name, {
      bytes,
      meta: {
        name,
        generation: String(this.next++),
        md5Hash: md5(bytes),
        ...headers,
      },
    })
  }

  async list(prefix: string): Promise<StoredObjectMeta[]> {
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
    const current = this.objects.get(name)
    if (!current || current.meta.generation !== ifGenerationMatch) {
      throw Object.assign(new Error('Precondition Failed'), { code: 412 })
    }
    this.put(name, bytes, metadata)
    return { ...this.objects.get(name)!.meta }
  }
}

const P = 'snapshots/2026-10-14'

function seeded(): FakeBucket {
  const b = new FakeBucket()
  b.put(`${P}/district_201.json`, stored(districtFile()))
  b.put(`${P}/analytics/district_201_analytics.json`, stored(analyticsFile()))
  b.put(
    `${P}/analytics/district_201_club-trends-index.json`,
    stored(clubTrendsIndex())
  )
  b.put(`${P}/analytics/district_201_membership.json`, stored({ data: {} }))
  return b
}

describe('runStrip — place links (#2069)', () => {
  it('dry run: plans the three linked objects, writes nothing, counts the values', async () => {
    const b = seeded()
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: ['2026-10-14'],
      dryRun: true,
    })
    expect(b.writes).toEqual([])
    expect(rows.filter(r => r.action === 'planned')).toHaveLength(3)
    expect(summary).toMatchObject({
      planned: 3,
      unchanged: 1,
      errors: 0,
      keysRemoved: 0,
      placeValuesScrubbed: 10,
    })
  })

  it('execute: conditional writes, verified on re-read, idempotent', async () => {
    const b = seeded()
    const name = `${P}/district_201.json`
    const gen = b.objects.get(name)!.meta.generation
    const opts = {
      bucket: 'toast-stats-data-staging',
      dates: ['2026-10-14'],
      dryRun: false,
    }
    const { rows } = await runStrip(b, opts)
    expect(b.writes).toContainEqual({ name, ifGenerationMatch: gen })
    const row = rows.find(r => r.path === name)!
    expect(row.action).toBe('stripped')
    expect(row.placeValuesScrubbed).toBe(4)
    expect(countPlaceLinks(JSON.parse(text(b.objects.get(name)!.bytes)))).toBe(
      0
    )
    b.writes = []
    const again = await runStrip(b, opts)
    expect(b.writes).toEqual([])
    expect(again.summary).toMatchObject({ stripped: 0, unchanged: 4 })
  })

  it('never records a link or a street in rows, summary or JSONL', async () => {
    const b = seeded()
    for (const dryRun of [true, false]) {
      const run = await runStrip(b, {
        bucket: 'toast-stats-data-staging',
        dates: ['2026-10-14'],
        dryRun,
      })
      const out = toJsonl(run.rows) + JSON.stringify(run.summary)
      expect(out).not.toMatch(/REDACTED|bit\.ly|zoom\.us|Overland/i)
    }
  })
})
