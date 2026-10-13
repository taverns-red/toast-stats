import React from 'react'
import { BottomSheet } from '../BottomSheet'
import { ModePicker } from './MapModePicker'
import type { MapColorMode } from './pinModes'

/* The map's phone sheets (#1784, #1788): the mode picker, the full legend
   and lists, and the tapped club's summary. Phones only, so this is an
   on-demand chunk the page fetches on mount below 768 — it keeps the map
   route's first load within its 300 KB budget. */

export interface MapPhoneSheetsProps {
  sheet: 'legend' | 'modes' | 'filters' | null
  onClose: () => void
  mode: MapColorMode
  onModeChange: (m: MapColorMode) => void
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
  mode,
  onModeChange,
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
      <ModePicker mode={mode} onChange={onModeChange} />
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
