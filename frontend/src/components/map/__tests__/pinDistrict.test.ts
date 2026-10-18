/**
 * District colour mode (#1808): the region map's added mode. One category
 * per district, coloured by adjacency over the shared categorical palette
 * (spec §7.1, as division and area), the district number on the pin, and
 * the `?district=` key its legend chips write.
 */
import { describe, it, expect } from 'vitest'
import { ClubsByRegionShardSchema } from '@taverns-red/shared-contracts'
import recorded from '../../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
import { toRegionClubs } from '../../../utils/regionClubs'
import { CATEGORICAL8, legendChips, SUSPENDED } from '../pinModes'
import { districtModel } from '../pinDistrict'

const two = [
  ...toRegionClubs(ClubsByRegionShardSchema.parse(recorded.shards['05'])),
  ...toRegionClubs(ClubsByRegionShardSchema.parse(recorded.shards['01'])),
]

describe('districtModel', () => {
  const model = districtModel(two)

  it('has one categorical category per district, coded with its number', () => {
    expect(model.mode).toBe('district')
    expect(model.kind).toBe('categorical')
    const named = model.categories.filter(c => c.key !== SUSPENDED.key)
    expect(named.map(c => [c.key, c.label, c.code])).toEqual([
      ['49', 'District 49', '49'],
      ['61', 'District 61', '61'],
    ])
    for (const c of named) expect(CATEGORICAL8).toContain(c.fill)
    expect(named[0]!.fill).not.toBe(named[1]!.fill)
  })

  it('puts each club in its district and writes ?district=', () => {
    const chips = legendChips(model, two)
    expect(chips.map(c => [c.key, c.count])).toEqual([
      ['61', 161],
      ['49', 66],
    ])
    expect(model.facet?.param).toBe('district')
    expect(model.facet?.valueOf(chips[0]!)).toBe('61')
  })
})
