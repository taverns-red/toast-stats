import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the CDN service so we can assert the loader fetches lazily — and that
// merely importing the module triggers no network call (the 1MB club index
// must not be pulled at import / app boot).
const fetchCdnRankings = vi.fn()
const fetchCdnClubIndex = vi.fn()
const fetchCdnDivisionsAreasIndex = vi.fn()
const fetchCdnSnapshotIndex = vi.fn()
vi.mock('../cdn', () => ({
  fetchCdnRankings: (...args: unknown[]) => fetchCdnRankings(...args),
  fetchCdnClubIndex: (...args: unknown[]) => fetchCdnClubIndex(...args),
  fetchCdnDivisionsAreasIndex: (...args: unknown[]) =>
    fetchCdnDivisionsAreasIndex(...args),
  fetchCdnSnapshotIndex: (...args: unknown[]) => fetchCdnSnapshotIndex(...args),
}))

describe('loadSearchIndex (lazy)', () => {
  beforeEach(() => {
    fetchCdnRankings.mockReset()
    fetchCdnClubIndex.mockReset()
    fetchCdnDivisionsAreasIndex.mockReset()
    fetchCdnSnapshotIndex.mockReset()
    fetchCdnSnapshotIndex.mockResolvedValue({
      '61': ['2026-06-30', '2026-07-31'],
      '27': ['2025-06-30', '2026-06-30'],
    })
    fetchCdnDivisionsAreasIndex.mockResolvedValue({
      generatedAt: '2026-06-10T00:00:00Z',
      snapshotDate: '2026-06-09',
      totalDivisions: 1,
      totalAreas: 1,
      districts: { '61': { C: ['23'] } },
    })
    fetchCdnRankings.mockResolvedValue({
      rankings: [
        { districtId: '61', districtName: 'District 61', region: '07' },
      ],
      asOfDate: '2026-06-01',
      generatedAt: '2026-06-01T00:00:00Z',
    })
    fetchCdnClubIndex.mockResolvedValue({
      clubs: {
        '00001234': { districtId: '61', clubName: 'Toast of the Town' },
      },
    })
  })

  it('does not fetch anything at import time', async () => {
    await import('../searchIndex')
    expect(fetchCdnRankings).not.toHaveBeenCalled()
    expect(fetchCdnClubIndex).not.toHaveBeenCalled()
    expect(fetchCdnDivisionsAreasIndex).not.toHaveBeenCalled()
  })

  it('fetches rankings + club index only when invoked, and builds an index', async () => {
    const { loadSearchIndex } = await import('../searchIndex')
    expect(fetchCdnClubIndex).not.toHaveBeenCalled()

    const index = await loadSearchIndex()

    expect(fetchCdnRankings).toHaveBeenCalledTimes(1)
    expect(fetchCdnClubIndex).toHaveBeenCalledTimes(1)
    expect(
      index.entities.some(e => e.type === 'district' && e.id === '61')
    ).toBe(true)
    expect(
      index.entities.some(e => e.type === 'club' && e.id === '00001234')
    ).toBe(true)
  })

  // --- divisions/areas (#1135, epic #1101 Sprint 2) ---

  it('fetches the divisions/areas index and indexes divisions + areas', async () => {
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(fetchCdnDivisionsAreasIndex).toHaveBeenCalledTimes(1)
    expect(
      index.entities.some(e => e.type === 'division' && e.id === '61/C')
    ).toBe(true)
    expect(
      index.entities.some(e => e.type === 'area' && e.id === '61/C/23')
    ).toBe(true)
  })

  it('degrades gracefully when the divisions/areas index is unavailable (fail-soft)', async () => {
    // The artifact only lands via the scheduled pipeline (#1134) — a 404 must
    // not take down district/region/club search with it.
    fetchCdnDivisionsAreasIndex.mockRejectedValue(
      new Error('CDN fetch failed: 404 for …/config/divisions-areas-index.json')
    )
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(
      index.entities.some(e => e.type === 'district' && e.id === '61')
    ).toBe(true)
    expect(
      index.entities.some(e => e.type === 'club' && e.id === '00001234')
    ).toBe(true)
    expect(index.entities.some(e => e.type === 'division')).toBe(false)
    expect(index.entities.some(e => e.type === 'area')).toBe(false)
  })

  it('tolerates a malformed divisions/areas payload without taking search down', async () => {
    // Fail-soft must cover payload shape, not just fetch failure: the
    // fetcher does no schema validation, so districts:null must degrade
    // exactly like a 404 (review finding on #1135).
    fetchCdnDivisionsAreasIndex.mockResolvedValue({ districts: null })
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(
      index.entities.some(e => e.type === 'district' && e.id === '61')
    ).toBe(true)
    expect(index.entities.some(e => e.type === 'division')).toBe(false)
  })

  // --- union of all rosters (#1403) ---

  it('fetches the snapshot index and indexes districts that no longer exist', async () => {
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(fetchCdnSnapshotIndex).toHaveBeenCalledTimes(1)
    const d27 = index.entities.find(e => e.type === 'district' && e.id === '27')
    expect(d27).toBeDefined()
    expect(d27!.inactive).toBe(true)
    expect(d27!.route).toBe('/district/27?py=2025&date=2026-06-30')
  })

  it('resolves the index atomically — one await, no partial current-roster result', async () => {
    // The union arrives in the SAME promise as the rankings, so there is no
    // window in which search answers from the current roster and then
    // silently changes its answer (the #1398/#1401 async-scoping trap).
    let releaseSnapshotIndex: (v: unknown) => void = () => {}
    fetchCdnSnapshotIndex.mockReturnValue(
      new Promise(resolve => {
        releaseSnapshotIndex = resolve
      })
    )
    const { loadSearchIndex } = await import('../searchIndex')

    let settled = false
    const pending = loadSearchIndex().then(i => {
      settled = true
      return i
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSnapshotIndex({ '61': ['2026-07-31'], '27': ['2026-06-30'] })
    const index = await pending
    expect(
      index.entities.some(e => e.type === 'district' && e.id === '27')
    ).toBe(true)
  })

  it('degrades to the current roster when the snapshot index is unavailable (fail-soft)', async () => {
    fetchCdnSnapshotIndex.mockRejectedValue(
      new Error(
        'CDN fetch failed: 404 for …/config/district-snapshot-index.json'
      )
    )
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(
      index.entities.some(e => e.type === 'district' && e.id === '61')
    ).toBe(true)
    expect(
      index.entities.some(e => e.type === 'district' && e.id === '27')
    ).toBe(false)
  })

  it('tolerates a malformed snapshot-index payload', async () => {
    fetchCdnSnapshotIndex.mockResolvedValue(null)
    const { loadSearchIndex } = await import('../searchIndex')
    const index = await loadSearchIndex()

    expect(
      index.entities.some(e => e.type === 'district' && e.id === '61')
    ).toBe(true)
    expect(index.entities.filter(e => e.type === 'district')).toHaveLength(1)
  })
})
