/**
 * Pin targets for the keyboard path between map pins (#1940): the pins the
 * map has drawn, one per spot, in reading order, named by club and category
 * (never by colour). Pure: the overlay in `MapPinKeys` places and focuses
 * them.
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { ModeModel } from './pinModes'

/** The parts of a rendered pin feature this reads. */
export interface RenderedPin {
  geometry: { type: string; coordinates?: unknown }
  properties: Record<string, unknown>
}

export interface PinTarget {
  key: string
  /** Club ids at this spot (empty for a cluster). */
  ids: string[]
  cluster?: { id: number; count: number } | undefined
  at: [number, number]
  label: string
}

export type Project = (at: [number, number]) => { x: number; y: number }

/** Rows of a pin's 44 px target: pins in the same row read west to east. */
const ROW = 44
export const HALF = 22

const pointOf = (f: RenderedPin): [number, number] | null => {
  const c = f.geometry.coordinates
  return Array.isArray(c) &&
    typeof c[0] === 'number' &&
    typeof c[1] === 'number'
    ? [c[0], c[1]]
    : null
}

/** One target per spot, deduplicated (a pin can render in two tiles), in
 *  reading order, each named by club and category. */
export function pinTargets(
  features: readonly RenderedPin[],
  project: Project,
  clubs: readonly ClubTrend[],
  model: ModeModel
): PinTarget[] {
  const names = new Map(clubs.map(c => [c.clubId, c.clubName]))
  const spots = new Map<
    string,
    {
      at: [number, number]
      ids: Map<string, string>
      cluster?: PinTarget['cluster']
    }
  >()
  for (const f of features) {
    const at = pointOf(f)
    if (!at) continue
    const p = f.properties
    if (p['cluster']) {
      const id = Number(p['cluster_id'])
      spots.set(`c${id}`, {
        at,
        ids: new Map(),
        cluster: { id, count: Number(p['point_count']) },
      })
      continue
    }
    const key = `p${at[0]},${at[1]}`
    const spot = spots.get(key) ?? { at, ids: new Map<string, string>() }
    const id = String(p['id'])
    const category = model.categories[Number(p['k'])]?.label
    const name = names.get(id) ?? `Club ${id}`
    spot.ids.set(id, category ? `${name}, ${category}` : name)
    spots.set(key, spot)
  }
  const out = [...spots].map(([key, s]) => {
    const { x, y } = project(s.at)
    const ids = [...s.ids.keys()].sort()
    const named = ids.map(id => s.ids.get(id)!)
    const label = s.cluster
      ? `Group of ${s.cluster.count} clubs. Enter zooms in`
      : named.length > 1
        ? `${named.length} clubs here: ${named.join('; ')}`
        : named[0]!
    return { key, ids, cluster: s.cluster, at: s.at, label, x, y }
  })
  out.sort((a, b) => Math.round(a.y / ROW) - Math.round(b.y / ROW) || a.x - b.x)
  return out.map(({ x: _x, y: _y, ...t }) => t)
}
