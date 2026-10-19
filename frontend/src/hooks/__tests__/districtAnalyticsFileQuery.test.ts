import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { fetchFromCdn } from '../../services/cdn'
import { districtAnalyticsFileQueryOptions } from '../districtAnalyticsFileQuery'
import { toSnapshotDate } from '../../types/snapshotDate'

vi.mock('../../services/cdn', () => ({
  cdnAnalyticsUrl: vi.fn(() => 'https://cdn.test/analytics.json'),
  fetchFromCdn: vi.fn(),
}))

const DATE = toSnapshotDate('2026-10-13')!

const club = (clubId: string, currentStatus: string) => ({
  clubId,
  clubName: `Club ${clubId}`,
  currentStatus,
  membershipTrend: [{ date: '2026-10-13', count: 14 }],
  dcpGoalsTrend: [{ date: '2026-10-13', goalsAchieved: 2 }],
})
const a = club('3045', 'intervention-required')
const b = club('7238597', 'vulnerable')
const c = club('9001', 'thriving')

describe('districtAnalyticsFileQueryOptions (#1901 dual-shape reader)', () => {
  beforeEach(() => vi.mocked(fetchFromCdn).mockReset())

  const read = () =>
    new QueryClient().fetchQuery(districtAnalyticsFileQueryOptions('61', DATE))

  it('expands a slim (clubId-list) file into the category arrays', async () => {
    vi.mocked(fetchFromCdn).mockResolvedValue({
      metadata: {},
      data: {
        districtId: '61',
        allClubs: [a, b, c],
        vulnerableClubIds: ['7238597'],
        thrivingClubIds: ['9001'],
        interventionRequiredClubIds: ['3045'],
      },
    })
    const analytics = await read()
    expect(analytics.vulnerableClubs).toEqual([b])
    expect(analytics.thrivingClubs).toEqual([c])
    expect(analytics.interventionRequiredClubs).toEqual([a])
    expect(analytics).not.toHaveProperty('vulnerableClubIds')
  })

  it('reads a legacy full-shape file unchanged', async () => {
    const data = {
      districtId: '61',
      allClubs: [a, b, c],
      vulnerableClubs: [{ ...b }],
      thrivingClubs: [{ ...c }],
      interventionRequiredClubs: [{ ...a }],
    }
    vi.mocked(fetchFromCdn).mockResolvedValue({ metadata: {}, data })
    expect(await read()).toEqual(data)
  })
  // #2153 — analytics files written before the source fix carry FAC's (0, 0)
  // ungeocoded sentinel. Read through the shared rule, the club is unmapped:
  // no null-island pin, counted in the district map's "not on the map".
  it('drops (0, 0) coordinates from every club list, keeps real ones', async () => {
    const real = { ...a, coordinates: { lat: 45.42, lng: -75.69 } }
    const sentinel = { ...b, coordinates: { lat: 0, lng: 0 } }
    vi.mocked(fetchFromCdn).mockResolvedValue({
      metadata: {},
      data: {
        districtId: '49',
        allClubs: [real, sentinel],
        vulnerableClubs: [{ ...sentinel }],
        thrivingClubs: [],
        interventionRequiredClubs: [{ ...real }],
      },
    })
    const analytics = await read()
    expect(analytics.allClubs[0]!.coordinates).toEqual(real.coordinates)
    expect(analytics.allClubs[1]).not.toHaveProperty('coordinates')
    expect(analytics.vulnerableClubs[0]).not.toHaveProperty('coordinates')
    expect(analytics.interventionRequiredClubs[0]!.coordinates).toEqual(
      real.coordinates
    )
  })
})
