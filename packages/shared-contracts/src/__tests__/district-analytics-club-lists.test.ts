import { describe, it, expect } from 'vitest'
import {
  slimDistrictAnalyticsClubLists,
  expandDistrictAnalyticsClubLists,
} from '../index.js'

// Real-shape excerpt of a `district_<id>_analytics.json` `data` object (#1901):
// the three category arrays are full copies of their allClubs records.
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

const full = {
  districtId: '61',
  totalMembership: 4000,
  allClubs: [a, b, c],
  vulnerableClubs: [{ ...b }],
  thrivingClubs: [{ ...c }],
  interventionRequiredClubs: [{ ...a }],
  topGrowthClubs: [{ clubId: '9001', growth: 3 }],
}

describe('slimDistrictAnalyticsClubLists (#1901)', () => {
  it('replaces the three category arrays with clubId lists', () => {
    const slim = slimDistrictAnalyticsClubLists(full)
    expect(slim).not.toHaveProperty('vulnerableClubs')
    expect(slim).not.toHaveProperty('thrivingClubs')
    expect(slim).not.toHaveProperty('interventionRequiredClubs')
    expect(slim.vulnerableClubIds).toEqual(['7238597'])
    expect(slim.thrivingClubIds).toEqual(['9001'])
    expect(slim.interventionRequiredClubIds).toEqual(['3045'])
  })

  it('keeps every other field untouched', () => {
    const slim = slimDistrictAnalyticsClubLists(full)
    expect(slim.allClubs).toBe(full.allClubs)
    expect(slim.topGrowthClubs).toBe(full.topGrowthClubs)
    expect(slim.totalMembership).toBe(4000)
  })

  it('throws when a categorized club is missing from allClubs', () => {
    expect(() =>
      slimDistrictAnalyticsClubLists({
        ...full,
        vulnerableClubs: [club('404', 'vulnerable')],
      })
    ).toThrow(/404/)
  })
})

describe('expandDistrictAnalyticsClubLists (#1901)', () => {
  it('round-trips the slim shape back to the full shape', () => {
    const expanded = expandDistrictAnalyticsClubLists(
      slimDistrictAnalyticsClubLists(full)
    )
    expect(expanded).toEqual(full)
    expect(expanded).not.toHaveProperty('vulnerableClubIds')
  })

  it('resolves ids to the allClubs records, in id order', () => {
    const expanded = expandDistrictAnalyticsClubLists({
      allClubs: [a, b, c],
      vulnerableClubIds: ['9001', '3045'],
      thrivingClubIds: [],
      interventionRequiredClubIds: [],
    })
    expect(expanded.vulnerableClubs).toEqual([c, a])
  })

  it('passes a legacy full-shape file through unchanged', () => {
    expect(expandDistrictAnalyticsClubLists(full)).toEqual(full)
  })

  it('drops an id that has no allClubs record instead of yielding undefined', () => {
    const expanded = expandDistrictAnalyticsClubLists({
      allClubs: [a],
      vulnerableClubIds: ['404'],
      thrivingClubIds: [],
      interventionRequiredClubIds: ['3045'],
    })
    expect(expanded.vulnerableClubs).toEqual([])
    expect(expanded.interventionRequiredClubs).toEqual([a])
  })
})
