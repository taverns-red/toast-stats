import React from 'react'

export interface LegendSeries {
  key: string
  name: string
  color: string
  dash?: string
}

export interface SeriesVisibility {
  isVisible: (key: string) => boolean
  toggle: (key: string, all: readonly string[]) => void
}

export function useSeriesVisibility(): SeriesVisibility {
  return { isVisible: () => true, toggle: () => {} }
}

export interface ChartLegendChipsProps {
  series: readonly LegendSeries[]
  visibility: SeriesVisibility
}

export const ChartLegendChips: React.FC<ChartLegendChipsProps> = () => null
