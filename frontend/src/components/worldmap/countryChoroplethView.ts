/**
 * View model for the country choropleth (#1797).
 *
 * One row per published country with its rank, share, bin and how the map
 * draws it. Shares are stated against `membership.clubsCounted`, the same
 * whole the `/history` country table uses, so `sum(rows) + unknown` is 100%.
 */
import { binFor } from './choroplethScale'
import { isoIdForCountry } from './countryCodes'

/** How the map draws a country: a shape, or a dot for a small territory. */
export type Placement = 'polygon' | 'marker'

export interface ChoroplethRow {
  /** The published (Find-A-Club) country name. */
  name: string
  isoId: string | null
  clubs: number
  sharePct: number
  /** Competition rank: tied countries share a rank (1, 2, 2, 4). */
  rank: number
  bin: number | null
  placement: Placement | 'none'
}

export interface ChoroplethView {
  rows: ChoroplethRow[]
  byIsoId: Map<string, ChoroplethRow>
  /** Published countries the map cannot place; still listed in the table. */
  notOnMap: ChoroplethRow[]
  unknown: { clubs: number; sharePct: number }
  clubsCounted: number
}

export function buildChoroplethView(
  countries: ReadonlyArray<{ country: string; clubs: number }>,
  unknown: number,
  clubsCounted: number,
  placementOf: (isoId: string) => Placement | undefined
): ChoroplethView {
  const whole = clubsCounted > 0 ? clubsCounted : 1
  const share = (n: number): number => Math.round((n / whole) * 1000) / 10

  const sorted = [...countries].sort(
    (a, b) => b.clubs - a.clubs || a.country.localeCompare(b.country)
  )

  const rows: ChoroplethRow[] = []
  sorted.forEach((c, i) => {
    const prev = rows[i - 1]
    const isoId = isoIdForCountry(c.country)
    rows.push({
      name: c.country,
      isoId,
      clubs: c.clubs,
      sharePct: share(c.clubs),
      rank: prev && prev.clubs === c.clubs ? prev.rank : i + 1,
      bin: binFor(c.clubs),
      placement: (isoId && placementOf(isoId)) || 'none',
    })
  })

  const byIsoId = new Map<string, ChoroplethRow>()
  for (const row of rows) {
    if (row.isoId && !byIsoId.has(row.isoId)) byIsoId.set(row.isoId, row)
  }

  return {
    rows,
    byIsoId,
    notOnMap: rows.filter(r => r.placement === 'none'),
    unknown: { clubs: unknown, sharePct: share(unknown) },
    clubsCounted,
  }
}
