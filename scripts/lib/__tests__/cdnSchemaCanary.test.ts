/**
 * Live-CDN schema canary — decision logic tests (#1125).
 *
 * The canary is the propagation-axis complement of the publish gate: the
 * gate certifies what the pipeline is ABOUT to publish; the canary runs
 * the real read-validation (the same safeParse the mcp-server performs)
 * against what the published CDN is ACTUALLY serving, and alerts when a
 * consumer would get schema not-available (Lessons 107/155: a "can't
 * tell" state must alert, never pass).
 *
 * Happy-path bodies use the recorded real CDN payload from Sprint 1
 * (#1123) — Lesson 154.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  evaluateCdnSchema,
  buildCanaryIssueTitle,
  buildCanaryIssueBody,
  decodeCdnJson,
  checkTimeSeriesMetadata,
  checkTimeSeriesProgramYear,
  checkDistrictSnapshotIndex,
  pickTimeSeriesDistricts,
  type CdnObjectFetch,
  type DistrictFetchResult,
} from '../cdnSchemaCanary.js'

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/mcp-server/src/__fixtures__/district-snapshot.json'
)

const realSnapshot = readFileSync(FIXTURE_PATH, 'utf-8')

function fetched(districtId: string, body = realSnapshot): DistrictFetchResult {
  return { districtId, ok: true, status: 200, body }
}

const LATEST_DATE = '2026-06-09'

describe('evaluateCdnSchema', () => {
  it('is healthy when every published district validates', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61'), fetched('86')],
    })
    expect(result.healthy).toBe(true)
    expect(result.checked).toBe(2)
    expect(result.failures).toEqual([])
    expect(result.latestDate).toBe(LATEST_DATE)
  })

  it('alerts on an injected schema-violating payload, naming the district', () => {
    const bad = JSON.parse(realSnapshot)
    bad.data.clubPerformance[0]['Injected Junk'] = { anything: 'at all' }
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61'), fetched('42', JSON.stringify(bad))],
    })
    expect(result.healthy).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].districtId).toBe('42')
    expect(result.failures[0].reason).toContain('clubPerformance')
  })

  it('alerts when a district fetch returns a non-200 — not-available is the outage', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61'), { districtId: '42', ok: false, status: 404 }],
    })
    expect(result.healthy).toBe(false)
    expect(result.failures[0].districtId).toBe('42')
    expect(result.failures[0].reason).toContain('404')
  })

  it('alerts on a network-level fetch error', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [
        { districtId: '61', ok: false, error: 'fetch timeout after 20s' },
      ],
    })
    expect(result.healthy).toBe(false)
    expect(result.failures[0].reason).toContain('timeout')
  })

  it('alerts on an unparseable district body', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61', '<html>garbage</html>')],
    })
    expect(result.healthy).toBe(false)
    expect(result.failures[0].reason).toMatch(/JSON/i)
  })

  it("alerts when the manifest chain could not be read — can't tell = alert", () => {
    const result = evaluateCdnSchema({
      latestDate: null,
      manifestError: 'HTTP 503 Service Unavailable',
      districts: [],
    })
    expect(result.healthy).toBe(false)
    expect(result.reason).toContain('503')
  })

  it('alerts on a malformed latest date instead of propagating it (output-injection guard)', () => {
    const result = evaluateCdnSchema({
      latestDate: 'evil\ntitle=injected',
      districts: [fetched('61')],
    })
    expect(result.healthy).toBe(false)
    expect(result.latestDate).toBeNull()
    expect(result.reason).toMatch(/malformed/i)
  })

  it('alerts when there are zero districts to check — a canary that checks nothing must not pass', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [],
    })
    expect(result.healthy).toBe(false)
    expect(result.reason).toMatch(/no district/i)
  })
})

describe('issue title and body', () => {
  const now = new Date('2026-06-10T15:30:00Z')
  const baseUrl = 'https://storage.googleapis.com/toast-stats-data-ca'

  it('unhealthy title names the snapshot date', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61', '{}')],
    })
    const title = buildCanaryIssueTitle(result)
    expect(title).toContain(LATEST_DATE)
    expect(title).toMatch(/schema/i)
  })

  it('body lists each failing district with its reason and the checked surface', () => {
    const bad = JSON.parse(realSnapshot)
    bad.data.clubPerformance[0]['Injected Junk'] = { anything: 'at all' }
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61'), fetched('42', JSON.stringify(bad))],
    })
    const body = buildCanaryIssueBody(result, { baseUrl, now })
    expect(body).toContain(baseUrl)
    expect(body).toContain('42')
    expect(body).toContain('clubPerformance')
    expect(body).toContain('2026-06-10T15:30:00')
  })

  it('escapes pipes in failure reasons so the markdown table stays intact', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [
        { districtId: '61', ok: false, error: 'weird | piped | message' },
      ],
    })
    const body = buildCanaryIssueBody(result, { baseUrl, now })
    expect(body).not.toContain('weird | piped')
    expect(body).toContain('weird \\| piped \\| message')
  })
})

// ---------------------------------------------------------------------------
// time-series/** and config/** coverage (#1710, plan S1-5).
//
// The #1702 outage: every time-series object was gzip-wrapped ~10 times. A
// browser (and Node's fetch) peels exactly ONE Content-Encoding layer, so the
// body the frontend received was still gzip bytes. These tests model the
// post-HTTP-decoding body a browser hands to JSON.parse.
// ---------------------------------------------------------------------------

const enc = (s: string) => new TextEncoder().encode(s)

function obj(path: string, body: string | Uint8Array): CdnObjectFetch {
  return { path, ok: true, status: 200, body }
}

// Modelled on the real prod payloads (D61, 2026-10-09).
const metadata = {
  districtId: '61',
  lastUpdated: '2026-10-09T12:12:11.680Z',
  availableProgramYears: ['2024-2025', '2025-2026', '2026-2027'],
  totalDataPoints: 247,
}

function programYearFile(lastDate: string) {
  return {
    districtId: '61',
    programYear: '2026-2027',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    lastUpdated: '2026-10-09T12:12:11.676Z',
    dataPoints: [
      {
        date: lastDate,
        snapshotId: lastDate,
        membership: 2160,
        payments: 3355,
        dcpGoals: 269,
        distinguishedTotal: 5,
        clubCounts: {
          total: 161,
          thriving: 29,
          vulnerable: 46,
          interventionRequired: 86,
        },
      },
    ],
    summary: {
      totalDataPoints: 54,
      membershipStart: 2937,
      membershipEnd: 2160,
      membershipPeak: 3067,
      membershipLow: 2160,
    },
  }
}

const snapshotIndex = {
  generatedAt: '2026-10-09T12:19:08.103Z',
  districts: { '61': ['2026-09-30', '2026-10-08'], '86': ['2026-10-08'] },
}

const NOW = new Date('2026-10-09T15:30:00Z')
const AGE = { now: NOW, maxAgeDays: 3 }
const PY_PATH = 'time-series/district_61/2026-2027.json'

describe('decodeCdnJson — decode exactly as a browser would', () => {
  it('parses a plain (already HTTP-decoded) JSON body', () => {
    const r = decodeCdnJson(obj('x.json', enc(JSON.stringify(metadata))))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(metadata)
  })

  it('fails on a double-gzipped object: one layer left after HTTP decoding (#1702)', () => {
    // GCS served gzip(gzip(json)) with Content-Encoding: gzip; the browser
    // peeled one layer and handed gzip bytes to JSON.parse.
    const r = decodeCdnJson(obj(PY_PATH, gzipSync(JSON.stringify(metadata))))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gzip/i)
  })

  it('fails on truncated JSON', () => {
    const r = decodeCdnJson(
      obj('x.json', enc(JSON.stringify(metadata).slice(0, 40)))
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/JSON/i)
  })

  it('fails on a non-2xx fetch, naming the status', () => {
    const r = decodeCdnJson({ path: 'x.json', ok: false, status: 404 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('404')
  })
})

describe('checkTimeSeriesMetadata', () => {
  it('passes a valid index-metadata and resolves the current PY from the data', () => {
    const r = checkTimeSeriesMetadata(
      obj('m.json', enc(JSON.stringify(metadata)))
    )
    expect(r.failure).toBeNull()
    expect(r.currentProgramYear).toBe('2026-2027')
  })

  it('fails a nested-gzip index-metadata', () => {
    const r = checkTimeSeriesMetadata(
      obj('m.json', gzipSync(gzipSync(JSON.stringify(metadata))))
    )
    expect(r.failure).toMatch(/gzip/i)
    expect(r.currentProgramYear).toBeNull()
  })

  it('fails when no program year is available', () => {
    const r = checkTimeSeriesMetadata(
      obj(
        'm.json',
        enc(JSON.stringify({ ...metadata, availableProgramYears: [] }))
      )
    )
    expect(r.failure).toMatch(/program year/i)
  })

  it('fails a schema-violating index-metadata', () => {
    const r = checkTimeSeriesMetadata(
      obj('m.json', enc(JSON.stringify({ districtId: '61' })))
    )
    expect(r.failure).toMatch(/schema/i)
  })
})

describe('checkTimeSeriesProgramYear', () => {
  const ok = (lastDate: string) =>
    obj(PY_PATH, enc(JSON.stringify(programYearFile(lastDate))))

  it('passes when the last point is valid and within N days', () => {
    expect(checkTimeSeriesProgramYear(ok('2026-10-08'), AGE)).toBeNull()
  })

  it('fails when the last point is older than N days', () => {
    expect(checkTimeSeriesProgramYear(ok('2026-10-05'), AGE)).toMatch(
      /2026-10-05.*days/
    )
  })

  it('fails when the last point is in the future', () => {
    expect(checkTimeSeriesProgramYear(ok('2026-10-12'), AGE)).toMatch(/future/i)
  })

  it('fails when the last point has an invalid calendar date', () => {
    expect(checkTimeSeriesProgramYear(ok('2026-02-30'), AGE)).toMatch(/date/i)
  })

  it('fails when there is no last point', () => {
    const empty = { ...programYearFile('2026-10-08'), dataPoints: [] }
    expect(
      checkTimeSeriesProgramYear(obj(PY_PATH, enc(JSON.stringify(empty))), AGE)
    ).toMatch(/no data points/i)
  })

  it('fails a double-gzipped program-year file (#1702)', () => {
    const body = gzipSync(JSON.stringify(programYearFile('2026-10-08')))
    expect(checkTimeSeriesProgramYear(obj(PY_PATH, body), AGE)).toMatch(/gzip/i)
  })
})

describe('checkDistrictSnapshotIndex', () => {
  it('passes a valid config/district-snapshot-index.json', () => {
    expect(
      checkDistrictSnapshotIndex(
        obj('c.json', enc(JSON.stringify(snapshotIndex)))
      )
    ).toBeNull()
  })

  it('fails a nested-gzip config index', () => {
    expect(
      checkDistrictSnapshotIndex(
        obj('c.json', gzipSync(JSON.stringify(snapshotIndex)))
      )
    ).toMatch(/gzip/i)
  })

  it('fails an empty districts map', () => {
    expect(
      checkDistrictSnapshotIndex(
        obj('c.json', enc(JSON.stringify({ districts: {} })))
      )
    ).toMatch(/no districts/i)
  })

  it('fails a malformed date entry, naming the district', () => {
    expect(
      checkDistrictSnapshotIndex(
        obj('c.json', enc(JSON.stringify({ districts: { '61': ['oops'] } })))
      )
    ).toMatch(/61/)
  })
})

describe('pickTimeSeriesDistricts', () => {
  it('always includes D61 plus N other distinct published districts', () => {
    const ids = ['42', '61', '86', 'F', 'U']
    const picked = pickTimeSeriesDistricts(ids, 2, () => 0)
    expect(picked[0]).toBe('61')
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    for (const id of picked) expect(ids).toContain(id)
  })

  it('includes D61 even if absent from the list, and caps at what exists', () => {
    expect(pickTimeSeriesDistricts(['42'], 2, () => 0.5)).toEqual(['61', '42'])
  })
})

describe('evaluateCdnSchema with time-series/config objects', () => {
  it('is unhealthy when an object check fails even if every district validates', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61')],
      objects: [
        { path: 'config/district-snapshot-index.json', failure: null },
        { path: PY_PATH, failure: 'body is still gzip-encoded' },
      ],
    })
    expect(result.healthy).toBe(false)
    expect(result.objectsChecked).toBe(2)
    expect(result.objectFailures).toEqual([
      { path: PY_PATH, reason: 'body is still gzip-encoded' },
    ])
    expect(result.reason).toMatch(/object/i)
    const body = buildCanaryIssueBody(result, {
      baseUrl: 'https://cdn.taverns.red',
      now: NOW,
    })
    expect(body).toContain(PY_PATH)
  })

  it('stays healthy when districts and objects all pass', () => {
    const result = evaluateCdnSchema({
      latestDate: LATEST_DATE,
      districts: [fetched('61')],
      objects: [{ path: PY_PATH, failure: null }],
    })
    expect(result.healthy).toBe(true)
    expect(result.objectFailures).toEqual([])
  })
})
