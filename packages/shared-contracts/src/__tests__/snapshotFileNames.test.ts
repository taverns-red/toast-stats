/**
 * Canonical district-snapshot file naming (#1428).
 *
 * The on-disk snapshot layout is a contract, so the matcher that decides what
 * `district_<id>.json` means lives here — one definition shared by `scripts/`
 * (publish gate, snapshot index, divisions/areas index, anomaly detector) and
 * `packages/collector-cli` (AnalyticsComputeService district discovery).
 *
 * Every one of those used to carry its own `district_(.+)` / `district_(\w+)`
 * / `startsWith('district_')` copy, and every copy also matched the
 * daily-reports sidecar `district_<id>_reports.json`.
 */

import { describe, it, expect } from 'vitest'
import {
  districtIdFromSnapshotFileName,
  indexDistrictSnapshotObjects,
  isDistrictSnapshotFile,
  parseDistrictSnapshotObjectName,
} from '../naming/snapshotFileNames.js'

describe('isDistrictSnapshotFile', () => {
  it('matches every district id that ships — numeric, F/U, 201-231', () => {
    for (const id of ['1', '01', '61', '107', 'F', 'U', '203', '231']) {
      expect(isDistrictSnapshotFile(`district_${id}.json`)).toBe(true)
      expect(districtIdFromSnapshotFileName(`district_${id}.json`)).toBe(id)
    }
  })

  it('rejects sidecars — the pattern, not a _reports special case', () => {
    for (const name of [
      'district_61_reports.json',
      'district_F_reports.json',
      'district_61_foo.json',
      'district_61.reports.json',
    ]) {
      expect(isDistrictSnapshotFile(name)).toBe(false)
      expect(districtIdFromSnapshotFileName(name)).toBeNull()
    }
  })

  it('rejects non-district files', () => {
    for (const name of ['metadata.json', 'district_.json', 'district_61.txt']) {
      expect(isDistrictSnapshotFile(name)).toBe(false)
    }
  })
})

describe('parseDistrictSnapshotObjectName / indexDistrictSnapshotObjects', () => {
  it('resolves a snapshot object name, and only a snapshot object name', () => {
    expect(
      parseDistrictSnapshotObjectName('snapshots/2026-08-20/district_61.json')
    ).toEqual({ snapshotDate: '2026-08-20', districtId: '61' })
    expect(
      parseDistrictSnapshotObjectName(
        'snapshots/2026-08-20/district_61_reports.json'
      )
    ).toBeNull()
    expect(
      parseDistrictSnapshotObjectName('config/district-snapshot-index.json')
    ).toBeNull()
  })

  it('never indexes a phantom *_reports district', () => {
    const { districts, fileCount } = indexDistrictSnapshotObjects([
      'snapshots/2026-08-19/district_61.json',
      'snapshots/2026-08-20/district_61.json',
      'snapshots/2026-08-20/district_61_reports.json',
      'snapshots/2026-08-20/district_F.json',
    ])
    expect(Object.keys(districts).sort()).toEqual(['61', 'F'])
    expect(districts['61']).toEqual(['2026-08-19', '2026-08-20'])
    expect(fileCount).toBe(3)
  })
})
