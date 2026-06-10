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
import {
  evaluateCdnSchema,
  buildCanaryIssueTitle,
  buildCanaryIssueBody,
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
})
