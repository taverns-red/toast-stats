/**
 * District colour mode (#1808) — the mode the region map adds to #1784's:
 * one category per district, coloured by adjacency over the shared
 * categorical palette (spec §7.1, the division and area modes' rule), the
 * district number on the pin from the code-label zoom, and the `?district=`
 * key its legend chips write (the explorer's district filter).
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { RegionClub } from '../../utils/regionClubs'
import { assignTerritoryColours } from './pinTerritory'
import {
  SUSPENDED,
  byKey,
  compareLabel,
  withSuspended,
  type ModeModel,
  type PinCategory,
} from './pinModes'

/** The mode's `categoryOf` sees the shared club shape; a club without a
 *  district (never a region club) falls to "?". */
const keyOf = (c: ClubTrend) => (c as Partial<RegionClub>).districtId ?? '?'

export function districtModel(clubs: readonly RegionClub[]): ModeModel {
  const colours = assignTerritoryColours(clubs, keyOf)
  const categories: PinCategory[] = [...colours.keys()]
    .sort(compareLabel)
    .map(key => ({
      key,
      label: `District ${key}`,
      fill: colours.get(key)!,
      shape: 'circle',
      code: key,
    }))
  categories.push(SUSPENDED)
  return {
    mode: 'district',
    title: 'District',
    kind: 'categorical',
    categories,
    categoryOf: withSuspended(c => byKey(categories, keyOf(c))),
    isDashed: () => false,
    facet: { param: 'district', valueOf: cat => cat.key },
  }
}
