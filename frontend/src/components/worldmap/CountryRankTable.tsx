import React from 'react'
import type { ChoroplethView } from './countryChoroplethView'
export interface CountryRankTableProps {
  view: ChoroplethView
  selectedId: string | null
  onSelect: (isoId: string) => void
  limit?: number
}
export const CountryRankTable: React.FC<CountryRankTableProps> = () => null
