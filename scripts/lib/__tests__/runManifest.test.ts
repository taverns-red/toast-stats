/**
 * The run manifest `runs/<github_run_id>/written.jsonl` (#1762, ADR-015 P5,
 * migration step 4): parsing, the dates the completeness gate reads from it,
 * and the 90-day retention prune applies to `runs/`.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  RUNS_PREFIX,
  RUN_MANIFEST_RETENTION_DAYS,
  expiredRunPrefixes,
  latestByPath,
  manifestSnapshotDates,
  parseRunManifest,
  runManifestPath,
} from '../runManifest.js'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const SHA = 'a'.repeat(64)
const line = (p: string, date: string | null, stage = 'daily-upload') =>
  JSON.stringify({ path: p, sha256: SHA, date, stage })

describe('parseRunManifest', () => {
  it('reads one entry per line and ignores blank lines', () => {
    const text = [
      line('snapshots/2026-10-10/district_61.json', '2026-10-10'),
      '',
      line('v1/latest.json', null, 'cdn-manifests'),
      '',
    ].join('\n')
    expect(parseRunManifest(text)).toEqual([
      {
        path: 'snapshots/2026-10-10/district_61.json',
        sha256: SHA,
        date: '2026-10-10',
        stage: 'daily-upload',
      },
      {
        path: 'v1/latest.json',
        sha256: SHA,
        date: null,
        stage: 'cdn-manifests',
      },
    ])
  })

  it.each([
    ['not JSON', '{"path":'],
    ['no path', JSON.stringify({ sha256: SHA, date: null, stage: 's' })],
    [
      'a short hash',
      JSON.stringify({
        path: 'v1/x.json',
        sha256: 'abc',
        date: null,
        stage: 's',
      }),
    ],
    [
      'a bad date',
      JSON.stringify({
        path: 'v1/x.json',
        sha256: SHA,
        date: '2026-1-1',
        stage: 's',
      }),
    ],
    [
      'no stage',
      JSON.stringify({ path: 'v1/x.json', sha256: SHA, date: null }),
    ],
  ])('throws on %s (the gates then fail closed)', (_, bad) => {
    expect(() => parseRunManifest(bad)).toThrow(/line 1/)
  })

  it('throws on an empty manifest: every gated mode writes at least the CDN manifests', () => {
    expect(() => parseRunManifest('\n')).toThrow(/empty/)
  })
})

describe('latestByPath', () => {
  it('keeps the last write of a path (a later step rewrote it)', () => {
    const entries = parseRunManifest(
      [
        JSON.stringify({
          path: 'v1/latest.json',
          sha256: 'b'.repeat(64),
          date: null,
          stage: 'one',
        }),
        JSON.stringify({
          path: 'v1/latest.json',
          sha256: 'c'.repeat(64),
          date: null,
          stage: 'two',
        }),
      ].join('\n')
    )
    expect(latestByPath(entries).get('v1/latest.json')?.stage).toBe('two')
  })
})

describe('manifestSnapshotDates (the completeness gate reads its dates here)', () => {
  it('is the sorted set of snapshot dates written; raw-csv, stores and v1/ do not count', () => {
    const entries = parseRunManifest(
      [
        line('snapshots/2026-10-10/district_61.json', '2026-10-10'),
        line('snapshots/2026-09-30/global-totals.json', '2026-09-30'),
        line(
          'snapshots/2026-10-10/analytics/district_61_analytics.json',
          '2026-10-10'
        ),
        line(
          'raw-csv/2026-10-11/district-61/club-performance.csv',
          '2026-10-11'
        ),
        line('time-series/district_61/2026-2027.json', null),
        line('v1/latest.json', null),
      ].join('\n')
    )
    expect(manifestSnapshotDates(entries)).toEqual(['2026-09-30', '2026-10-10'])
  })
})

describe('runs/ is internal', () => {
  it('the manifest lives under runs/<run id>/written.jsonl', () => {
    expect(runManifestPath('38152756138')).toBe(
      'runs/38152756138/written.jsonl'
    )
    expect(() => runManifestPath('../x')).toThrow()
  })

  it('is never under a promoted prefix (it is never copied to prod)', () => {
    expect(PROMOTED_PREFIXES.some(p => RUNS_PREFIX.startsWith(p))).toBe(false)
  })
})

describe('expiredRunPrefixes (prune retention, ADR-015 Consequences)', () => {
  // Recorded from `gcloud storage objects list --format=json` (#1731): the
  // keys are `name` and `creation_time` ("2026-10-10T13:54:37+0000").
  const recorded = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, 'fixtures/gcloud-objects-list/staging-live.json'),
      'utf-8'
    )
  ) as Array<Record<string, unknown>>
  const shape = recorded[0]!
  const obj = (name: string, created: string, extra = {}) => ({
    ...shape,
    name,
    creation_time: created,
    ...extra,
  })
  const NOW = Date.parse('2026-10-11T12:00:00Z')

  it('the recorded listing has the keys it reads', () => {
    expect(typeof shape.name).toBe('string')
    expect(typeof shape.creation_time).toBe('string')
  })

  it('selects runs whose manifest is older than 90 days, never a younger one', () => {
    const listing = [
      obj('runs/100/written.jsonl', '2026-07-01T00:00:00+0000'), // 102 days
      obj('runs/200/written.jsonl', '2026-07-14T00:00:00+0000'), // 89.5 days
      obj('runs/300/written.jsonl', '2026-10-11T08:00:00+0000'),
    ]
    expect(expiredRunPrefixes(listing, NOW)).toEqual(['runs/100/'])
    expect(RUN_MANIFEST_RETENTION_DAYS).toBe(90)
  })

  it('keeps a run while any of its objects is younger than the cut-off', () => {
    const listing = [
      obj('runs/100/written.jsonl', '2026-06-01T00:00:00+0000'),
      obj('runs/100/extra.json', '2026-10-01T00:00:00+0000'),
    ]
    expect(expiredRunPrefixes(listing, NOW)).toEqual([])
  })

  it('ignores noncurrent generations and anything outside runs/', () => {
    const listing = [
      obj('runs/100/written.jsonl', '2026-01-01T00:00:00+0000', {
        noncurrent_time: '2026-02-01T00:00:00+0000',
      }),
      obj('snapshots/2020-01-31/metadata.json', '2020-02-01T00:00:00+0000'),
    ]
    expect(expiredRunPrefixes(listing, NOW)).toEqual([])
  })

  it('throws on an entry it cannot date: never delete on a guess', () => {
    expect(() =>
      expiredRunPrefixes([{ name: 'runs/1/written.jsonl' }], NOW)
    ).toThrow(/creation_time/)
  })
})
