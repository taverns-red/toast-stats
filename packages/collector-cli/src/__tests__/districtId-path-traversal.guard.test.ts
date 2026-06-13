/**
 * Path-traversal guard for district-id inputs (#1111).
 *
 * A district id is interpolated into file/GCS paths (`district_{id}.json`,
 * `district-{id}/...`). The active tripwire requires `validateDistrictId`
 * before any path is constructed from request/operator input. This guard
 * pins two surfaces the 2026-06-09 audit (§9b) found unprotected:
 *
 *  1. `parseDistrictList` — the CLI `--districts` chokepoint, which only
 *     split/trimmed (`--districts '../x'` flowed straight through).
 *  2. The `getDistrictSnapshotPath` builders in TransformService and
 *     AnalyticsComputeService, which `path.join`-ed raw districtId.
 */

import { describe, it, expect } from 'vitest'
import { parseDistrictList } from '../cliHelpers.js'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const TRAVERSAL_IDS = [
  '../x',
  '..',
  'a/b',
  '../../etc/passwd',
  'foo.bar',
  '6 1',
]

describe('parseDistrictList — alphanumeric chokepoint (#1111)', () => {
  it('accepts valid alphanumeric district ids', () => {
    expect(parseDistrictList('01,61,F,U,130')).toEqual([
      '01',
      '61',
      'F',
      'U',
      '130',
    ])
  })

  it.each(TRAVERSAL_IDS)('rejects non-alphanumeric id %j', id => {
    expect(() => parseDistrictList(`61,${id}`)).toThrow(/district id/i)
  })
})

describe('path builders reject traversal district ids (#1111)', () => {
  const transform = new TransformService({ cacheDir: '/tmp/ts-guard-1111' })
  const analytics = new AnalyticsComputeService({
    cacheDir: '/tmp/ac-guard-1111',
  })

  it.each(TRAVERSAL_IDS)(
    'TransformService.snapshotExists rejects %j',
    async id => {
      await expect(transform.snapshotExists('2026-01-01', id)).rejects.toThrow(
        /district id/i
      )
    }
  )

  it.each(TRAVERSAL_IDS)(
    'AnalyticsComputeService.analyticsExist rejects %j',
    async id => {
      await expect(analytics.analyticsExist('2026-01-01', id)).rejects.toThrow(
        /district id/i
      )
    }
  )
})
