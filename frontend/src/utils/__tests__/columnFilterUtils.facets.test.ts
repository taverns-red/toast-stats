/**
 * Facet filters on division and area (#1836).
 *
 * The phone "Filter & sort" sheet filters division and area by tapping chips,
 * which is an exact-match set ("Division A" or "Division C"), not the desktop
 * text match ("contains A"). Both shapes live on the same field, so the
 * filter step must honour a categorical filter there too.
 */
import { describe, it, expect } from 'vitest'
import { applyFilter } from '../columnFilterUtils'
import type { ProcessedClubTrend } from '../../components/filters/types'

const club = (id: string, divisionName: string, areaName: string) =>
  ({ clubId: id, divisionName, areaName }) as ProcessedClubTrend

const clubs = [
  club('1', 'Division A', 'Area A1'),
  club('2', 'Division A', 'Area A12'),
  club('3', 'Division B', 'Area B1'),
  club('4', 'Division C', 'Area C1'),
]
const ids = (list: ProcessedClubTrend[]) => list.map(c => c.clubId)

describe('applyFilter — categorical division/area facets (#1836)', () => {
  it('keeps clubs whose division is in the selected set', () => {
    const out = applyFilter(clubs, {
      field: 'division',
      type: 'categorical',
      value: ['Division A', 'Division C'],
      operator: 'in',
    })
    expect(ids(out)).toEqual(['1', '2', '4'])
  })

  it('matches area exactly, so A1 does not also select A12', () => {
    const out = applyFilter(clubs, {
      field: 'area',
      type: 'categorical',
      value: ['Area A1'],
      operator: 'in',
    })
    expect(ids(out)).toEqual(['1'])
  })

  it('treats an empty selection as no filter', () => {
    const out = applyFilter(clubs, {
      field: 'division',
      type: 'categorical',
      value: [],
      operator: 'in',
    })
    expect(ids(out)).toEqual(['1', '2', '3', '4'])
  })
})
