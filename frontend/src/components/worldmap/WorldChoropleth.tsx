import React from 'react'
import type { WorldGeometry } from './worldGeometry'
import type { ChoroplethView } from './countryChoroplethView'
export interface WorldChoroplethProps {
  geometry: WorldGeometry
  view: ChoroplethView
  theme: 'light' | 'dark'
  selectedId: string | null
  onSelect: (isoId: string | null) => void
}
export const WorldChoropleth: React.FC<WorldChoroplethProps> = () => null
