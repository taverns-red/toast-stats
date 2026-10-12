import React from 'react'
import type { DistrictKpiStripData } from './DistrictKpiStrip'
import { formatSigned, nextTierText, worldRankText } from '../utils/districtHub'
import {
  HUB_BULLET_TILES,
  HUB_DASH,
  HUB_NET_CAPTION,
  HUB_NET_LABEL,
  HUB_NET_TITLE,
  type HubTileKey,
} from './districtHubTileMeta'

/* The district hub's 2×2 KPI tiles (#1842), shared by the hub and the
   `/district/:id` route fallback (#1901).

   The fallback renders `<DistrictHubTiles kpis={null} />` while the route
   chunk loads, so the hub's LCP element (the Net change caption) paints with
   the app shell instead of after the lazy page is revealed. Both render paths
   go through this one component, so the fallback tiles and the loading hub's
   tiles are the same markup and nothing moves when the page mounts.

   This module is in the entry bundle (App.tsx imports the fallback), so keep
   it light: markup, labels, and the small formatters in utils/districtHub. */

interface TileProps {
  title: string
  label: string
  value: string
  delta: string | null
  rank: string | null
  tone?: 'up' | 'down' | undefined
  onOpen: () => void
  disabled: boolean
}

const Tile: React.FC<TileProps> = ({
  title,
  label,
  value,
  delta,
  rank,
  tone,
  onOpen,
  disabled,
}) => (
  <li className="district-hub__tile-item">
    <button
      type="button"
      className="district-hub__tile"
      data-testid="district-hub-tile"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
    >
      <span className="district-hub__tile-title">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{title}</span>
      </span>
      <span
        className={`district-hub__tile-value${
          tone ? ` district-hub__tile-value--${tone}` : ''
        }`}
      >
        {value}
      </span>
      <span className="district-hub__tile-line district-hub__tile-line--delta">
        {delta ?? HUB_DASH}
      </span>
      {/* Empty string = no rank for this metric: keep the line for height. */}
      <span className="district-hub__tile-line">
        {rank === '' ? ' ' : (rank ?? HUB_DASH)}
      </span>
    </button>
  </li>
)

const noop = () => {}

export interface DistrictHubTilesProps {
  /** The KPI values; null while loading (dashes, tiles disabled). */
  kpis: DistrictKpiStripData | null
  /** Opens the tile's detail sheet. */
  onOpen?: (key: HubTileKey | 'net') => void
}

export const DistrictHubTiles: React.FC<DistrictHubTilesProps> = ({
  kpis,
  onOpen = noop,
}) => {
  const net = kpis ? kpis.netMemberChange.current : null
  return (
    <ul className="district-hub__tiles" data-testid="district-hub-tiles">
      {HUB_BULLET_TILES.map(t => {
        const card = kpis ? kpis[t.key] : null
        return (
          <Tile
            key={t.key}
            title={t.title}
            label={t.label}
            value={card ? card.current.toLocaleString() : HUB_DASH}
            delta={card ? nextTierText(card.current, card.targets) : null}
            rank={card ? worldRankText(card.rankings) : null}
            onOpen={() => onOpen(t.key)}
            disabled={!card}
          />
        )
      })}
      <Tile
        title={HUB_NET_TITLE}
        label={HUB_NET_LABEL}
        value={net !== null ? formatSigned(net) : HUB_DASH}
        delta={HUB_NET_CAPTION}
        rank=""
        tone={
          net !== null
            ? net > 0
              ? 'up'
              : net < 0
                ? 'down'
                : undefined
            : undefined
        }
        onOpen={() => onOpen('net')}
        disabled={!kpis}
      />
    </ul>
  )
}
