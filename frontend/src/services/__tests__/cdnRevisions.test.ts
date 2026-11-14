/**
 * Month-end reconciliation revisions on the CDN (#2475): the per-revision
 * district file and `snapshots/<monthEnd>/revisions/index.json`. The index
 * shape is the one the collector wrote to prod on 2026-11-03.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnRevisionSnapshotUrl,
  fetchCdnRevisionDistrictSnapshot,
  fetchCdnRevisionIndex,
} from '../cdn'
import { snap } from '../../test-utils/snapshotDate'

function stubFetch(res: { ok: boolean; status: number; body?: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    headers: new Headers(),
    json: async () => res.body,
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const RECORDED_INDEX = {
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: [
    {
      asOf: '2026-11-02',
      collectedAt: '2026-11-03T10:02:07.652Z',
      closing: true,
      successfulDistricts: ['61', '02'],
    },
  ],
  final: null,
}

describe('cdnRevisionSnapshotUrl', () => {
  it('addresses the revision under its month end', () => {
    expect(
      cdnRevisionSnapshotUrl(snap('2026-10-31'), '2026-11-02', '61')
    ).toMatch(
      /\/snapshots\/2026-10-31\/revisions\/2026-11-02\/district_61\.json$/
    )
  })
})

describe('fetchCdnRevisionDistrictSnapshot', () => {
  it('reads the revision file', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: { districtId: '61' } })
    const data = await fetchCdnRevisionDistrictSnapshot(
      snap('2026-10-31'),
      '2026-11-02',
      '61'
    )
    expect(data).toEqual({ districtId: '61' })
    expect(fn.mock.calls[0]![0]).toMatch(
      /snapshots\/2026-10-31\/revisions\/2026-11-02\/district_61\.json$/
    )
  })
})

describe('fetchCdnRevisionIndex', () => {
  it('returns the validated index on a 200', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: RECORDED_INDEX })
    const index = await fetchCdnRevisionIndex('2026-10-31')
    expect(index?.revisions[0]?.asOf).toBe('2026-11-02')
    expect(fn.mock.calls[0]![0]).toMatch(
      /snapshots\/2026-10-31\/revisions\/index\.json$/
    )
  })

  it('keeps working when a newer pipeline adds a key', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...RECORDED_INDEX, someNewKey: 1 },
    })
    expect(await fetchCdnRevisionIndex('2026-10-31')).not.toBeNull()
  })

  it('resolves null on a 404: most month ends have no revisions', async () => {
    stubFetch({ ok: false, status: 404 })
    expect(await fetchCdnRevisionIndex('2026-09-30')).toBeNull()
  })

  it('resolves null for a body that breaks the contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...RECORDED_INDEX, monthEnd: '2026-10-30' },
    })
    expect(await fetchCdnRevisionIndex('2026-10-31')).toBeNull()
  })

  it('resolves null for an index of a different month end', async () => {
    stubFetch({ ok: true, status: 200, body: RECORDED_INDEX })
    expect(await fetchCdnRevisionIndex('2026-09-30')).toBeNull()
  })
})
