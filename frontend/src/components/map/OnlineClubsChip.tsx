/**
 * OnlineClubsChip — "N online clubs" beside the map legend (#2174).
 *
 * Online-only clubs get no pin (Ron, 2026-10-19: no proxy or invented
 * point), so the map page says how many are in scope and lists them, and
 * every club stays one tap from the map. A disclosure button: the list
 * opens in place, never over the map. Hidden when there are none.
 */
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compareLabel } from './pinModes'

export interface OnlineClub {
  clubId: string
  clubName: string
  /** The club's own district, when the map spans several (region). */
  districtId?: string
}

export interface OnlineClubsChipProps {
  clubs: readonly OnlineClub[]
  /** The district map's district, for clubs that carry none. */
  districtId?: string
}

export default function OnlineClubsChip({
  clubs,
  districtId,
}: OnlineClubsChipProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const sorted = useMemo(
    () => [...clubs].sort((a, b) => compareLabel(a.clubName, b.clubName)),
    [clubs]
  )
  if (sorted.length === 0) return null
  const n = sorted.length
  return (
    <div className="map-online">
      <button
        type="button"
        className="map-pill map-online__chip"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <rect x="1.5" y="3" width="13" height="8.5" rx="1.5" />
          <path d="M5.5 14h5" />
        </svg>
        {n} online {n === 1 ? 'club' : 'clubs'}
      </button>
      {open && (
        <ul id={listId} className="map-list map-online__list">
          {sorted.map(c => (
            <li key={c.clubId}>
              <Link
                to={`/district/${c.districtId ?? districtId ?? ''}/club/${c.clubId}`}
              >
                {c.clubName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
