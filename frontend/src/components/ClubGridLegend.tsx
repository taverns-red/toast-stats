import React from 'react'
import type { GridColorMode } from '../utils/clubGridColor'

/**
 * Legend for the district club grid (#1230). Always visible, and switches with
 * the active colour mode so the tile fills are decodable without relying on
 * colour memory (WCAG 1.4.1 — each swatch also carries its non-colour glyph and
 * a text label). The swatch reuses the same `club-grid-tile--*` modifier classes
 * the tiles use, so legend and grid can never drift apart.
 */

export interface ClubGridLegendProps {
  colorMode: GridColorMode
}

interface LegendItem {
  modifier: string
  glyph: string
  label: string
}

const HEALTH_ITEMS: LegendItem[] = [
  { modifier: 'club-grid-tile--thriving', glyph: '✓', label: 'Thriving' },
  { modifier: 'club-grid-tile--vulnerable', glyph: '⚠', label: 'Vulnerable' },
  {
    modifier: 'club-grid-tile--intervention',
    glyph: '✗',
    label: 'Intervention Required',
  },
]

const TIER_ITEMS: LegendItem[] = [
  {
    modifier: 'club-grid-tile--tier-presidents',
    glyph: 'P',
    label: "President's Distinguished",
  },
  {
    modifier: 'club-grid-tile--tier-select',
    glyph: 'S',
    label: 'Select Distinguished',
  },
  {
    modifier: 'club-grid-tile--tier-distinguished',
    glyph: 'D',
    label: 'Distinguished',
  },
  {
    modifier: 'club-grid-tile--tier-smedley',
    glyph: 'M',
    label: 'Smedley (10/10)',
  },
  {
    modifier: 'club-grid-tile--tier-none',
    glyph: '—',
    label: 'Not yet Distinguished',
  },
]

const SUSPENDED_ITEM: LegendItem = {
  modifier: 'club-grid-tile--suspended',
  glyph: '⊘',
  label: 'Suspended',
}

export const ClubGridLegend: React.FC<ClubGridLegendProps> = ({
  colorMode,
}) => {
  const items = [
    ...(colorMode === 'tier' ? TIER_ITEMS : HEALTH_ITEMS),
    SUSPENDED_ITEM,
  ]
  const label =
    colorMode === 'tier' ? 'Distinguished tier legend' : 'Health legend'

  return (
    <div className="club-grid-legend" role="group" aria-label={label}>
      {items.map(item => (
        <span key={item.modifier} className="club-grid-legend__item">
          <span
            className={`club-grid-legend__swatch ${item.modifier}`}
            aria-hidden="true"
          >
            {item.glyph}
          </span>
          <span className="club-grid-legend__label">{item.label}</span>
        </span>
      ))}
    </div>
  )
}

export default ClubGridLegend
