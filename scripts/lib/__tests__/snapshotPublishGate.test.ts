/**
 * Publish-time snapshot schema gate — decision logic tests (#1125).
 *
 * The gate validates every district_<id>.json in a snapshot directory
 * against the shared PerDistrictDataSchema BEFORE the gsutil upload, so
 * contract drift fails loudly at write time instead of surfacing in a
 * downstream validating consumer (the #1096 MCP outage: merge-find-a-club
 * rewrote validated snapshots in place with no re-validation).
 *
 * The happy-path fixture is the recorded real CDN payload from Sprint 1
 * (#1123) — synthetic fixtures validate the code, only a captured real
 * payload validates the policy (Lesson 154).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateSnapshotFiles,
  buildGateSummary,
} from '../snapshotPublishGate.js'

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/mcp-server/src/__fixtures__/district-snapshot.json'
)

/** Recorded real FAC-enriched PerDistrictData payload (#1123). */
const realSnapshot = readFileSync(FIXTURE_PATH, 'utf-8')

function validFile(districtId = '61') {
  const parsed = JSON.parse(realSnapshot)
  parsed.districtId = districtId
  return {
    fileName: `district_${districtId}.json`,
    content: JSON.stringify(parsed),
  }
}

describe('evaluateSnapshotFiles', () => {
  it('passes a directory of valid recorded real snapshots', () => {
    const result = evaluateSnapshotFiles([validFile('61'), validFile('86')])
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(2)
    expect(result.failures).toEqual([])
  })

  it('fails a contract-violating snapshot with district and date in the failure', () => {
    // The exact #1096 drift class: an arbitrary object value smuggled into
    // a clubPerformance row (rejected by the strict union — Lesson 157).
    const parsed = JSON.parse(realSnapshot)
    parsed.data.clubPerformance[0]['Injected Junk'] = { anything: 'at all' }
    const bad = {
      fileName: 'district_42.json',
      content: JSON.stringify(parsed),
    }

    const result = evaluateSnapshotFiles([validFile('61'), bad])
    expect(result.ok).toBe(false)
    expect(result.checked).toBe(2)
    expect(result.failures).toHaveLength(1)
    const failure = result.failures[0]
    expect(failure.fileName).toBe('district_42.json')
    // Fail-loud with district + date (sprint AC)
    expect(failure.districtId).toBe(parsed.districtId)
    expect(failure.snapshotDate).toBe(parsed.data.snapshotDate)
    expect(failure.reason).toContain('clubPerformance')
  })

  it('fails on unparseable JSON, recovering the district id from the file name', () => {
    const result = evaluateSnapshotFiles([
      { fileName: 'district_109.json', content: '{not json' },
    ])
    expect(result.ok).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].districtId).toBe('109')
    expect(result.failures[0].snapshotDate).toBeNull()
    expect(result.failures[0].reason).toMatch(/JSON/i)
  })

  it('fails when there are zero district files — a gate that checks nothing must not pass', () => {
    const result = evaluateSnapshotFiles([])
    expect(result.ok).toBe(false)
    expect(result.checked).toBe(0)
    expect(result.reason).toMatch(/no district snapshot files/i)
  })

  it('ignores non-district files (metadata, manifest, rankings)', () => {
    const result = evaluateSnapshotFiles([
      validFile('61'),
      { fileName: 'metadata.json', content: '{not even json' },
      { fileName: 'manifest.json', content: '{}' },
      { fileName: 'all-districts-rankings.json', content: '[]' },
    ])
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })

  it('reports every failing district, not just the first', () => {
    const junk = (id: string) => ({
      fileName: `district_${id}.json`,
      content: JSON.stringify({ totally: 'wrong shape' }),
    })
    const result = evaluateSnapshotFiles([
      junk('1'),
      junk('2'),
      validFile('61'),
    ])
    expect(result.ok).toBe(false)
    expect(result.failures.map(f => f.fileName)).toEqual([
      'district_1.json',
      'district_2.json',
    ])
  })
})

describe('buildGateSummary', () => {
  it('renders a passing summary with the checked count', () => {
    const summary = buildGateSummary(evaluateSnapshotFiles([validFile('61')]), {
      snapshotDir: './cache/snapshots/2026-06-09',
    })
    expect(summary).toContain('1')
    expect(summary).toContain('./cache/snapshots/2026-06-09')
    expect(summary).toMatch(/pass/i)
  })

  it('renders each failure with district and date', () => {
    const parsed = JSON.parse(realSnapshot)
    parsed.data.clubPerformance[0]['Injected Junk'] = { anything: 'at all' }
    const result = evaluateSnapshotFiles([
      { fileName: 'district_42.json', content: JSON.stringify(parsed) },
    ])
    const summary = buildGateSummary(result, {
      snapshotDir: './cache/snapshots/2026-06-09',
    })
    expect(summary).toContain(parsed.districtId)
    expect(summary).toContain(parsed.data.snapshotDate)
    expect(summary).toMatch(/fail/i)
  })
})
