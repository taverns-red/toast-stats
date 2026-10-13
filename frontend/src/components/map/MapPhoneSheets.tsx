import React from 'react'
import { BottomSheet } from '../BottomSheet'
import { PinSwatch } from './PinSwatch'
import { CATEGORICAL8, buildModeModel, type MapColorMode } from './pinModes'

/* The map's phone sheets (#1784, #1788): the mode picker, the full legend
   and lists, and the tapped club's summary. Phones only, so this is an
   on-demand chunk the page fetches on mount below 768 — it keeps the map
   route's first load within its 300 KB budget. */

const preview = (id: MapColorMode) => (
  <span className="map-modes__preview" aria-hidden="true">
    {(id === 'health' || id === 'tier'
      ? buildModeModel(id).categories.slice(0, 5)
      : CATEGORICAL8.slice(0, 5).map(fill => ({
          key: fill,
          label: '',
          fill,
          shape: 'circle' as const,
        }))
    ).map(c => (
      <PinSwatch key={c.key} category={c} />
    ))}
  </span>
)

export interface MapPhoneSheetsProps {
  sheet: 'legend' | 'modes' | 'filters' | null
  onClose: () => void
  /** The page's mode buttons, given this chunk's swatch previews. */
  modes: (preview: (m: MapColorMode) => React.ReactNode) => React.ReactNode
  legendTitle: string
  legend: React.ReactNode
  /** Clubs at the tapped pin; the summary itself is the page's lazy one. */
  selectedCount: number
  summary: React.ReactNode
  onDeselect: () => void
}

export const MapPhoneSheets: React.FC<MapPhoneSheetsProps> = ({
  sheet,
  onClose,
  modes,
  legendTitle,
  legend,
  selectedCount,
  summary,
  onDeselect,
}) => (
  <>
    <BottomSheet
      isOpen={sheet === 'modes'}
      onClose={onClose}
      title="Colour pins by"
    >
      {modes(preview)}
    </BottomSheet>
    <BottomSheet
      isOpen={sheet === 'legend'}
      onClose={onClose}
      title={legendTitle}
    >
      {legend}
    </BottomSheet>
    <BottomSheet
      isOpen={selectedCount > 0 && sheet === null}
      onClose={onDeselect}
      title={selectedCount > 1 ? 'Clubs here' : 'Club details'}
      closeLabel="Close club details"
    >
      {summary}
    </BottomSheet>
  </>
)

export default MapPhoneSheets
