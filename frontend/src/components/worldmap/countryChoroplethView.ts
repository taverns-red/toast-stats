export type Placement = 'polygon' | 'marker'
export interface ChoroplethRow {
  name: string
  isoId: string | null
  clubs: number
  sharePct: number
  rank: number
  bin: number | null
  placement: Placement | 'none'
}
export interface ChoroplethView {
  rows: ChoroplethRow[]
  byIsoId: Map<string, ChoroplethRow>
  notOnMap: ChoroplethRow[]
  unknown: { clubs: number; sharePct: number }
  clubsCounted: number
}
export function buildChoroplethView(
  _countries: ReadonlyArray<{ country: string; clubs: number }>,
  _unknown: number,
  _clubsCounted: number,
  _placementOf: (isoId: string) => Placement | undefined
): ChoroplethView {
  return {
    rows: [],
    byIsoId: new Map(),
    notOnMap: [],
    unknown: { clubs: 0, sharePct: 0 },
    clubsCounted: 0,
  }
}
