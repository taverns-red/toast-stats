import React from 'react'
import { getLegendItems, type GridColorMode } from '../utils/clubGridColor'

/**
 * Legend for the district club grid (#1230). Always visible, and switches with
 * the active colour mode so the tile fills are decodable without relying on
 * colour memory (WCAG 1.4.1 — each swatch also carries its non-colour glyph and
 * a text label). The rows come from `getLegendItems`, which derives them from
 * the same `club-grid-tile--*` modifier + glyph maps the tiles use, so legend
 * and grid can never drift apart (one source of truth — Lesson 052).
 */

export interface ClubGridLegendProps {
  colorMode: GridColorMode
}

export const ClubGridLegend: React.FC<ClubGridLegendProps> = ({
  colorMode,
}) => {
  const items = getLegendItems(colorMode)
  const label =
    colorMode === 'tier' ? 'Distinguished tier legend' : 'Health legend'

  return (
    <div className="club-grid-legend" role="group" aria-label={label}>
      {items.map(item => (
        <span key={item.modifierClass} className="club-grid-legend__item">
          <span
            className={`club-grid-legend__swatch ${item.modifierClass}`}
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
