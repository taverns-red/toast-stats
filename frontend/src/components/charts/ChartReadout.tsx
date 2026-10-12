import React from 'react'
import type { TooltipProps } from 'recharts'

/** Devices that cannot hover (phones, tablets). */
export const TOUCH_QUERY = '(hover: none)'

export interface ChartReadingRow {
  key: string
  name: string
  value: number | string
  color?: string
}

export interface ChartReading {
  label: string
  rows: ChartReadingRow[]
}

export interface ChartReadoutHandle {
  touch: boolean
  reading: ChartReading | null
  tooltipProps: Partial<TooltipProps<number | string, string>>
}

export function useChartReadout(): ChartReadoutHandle {
  return { touch: false, reading: null, tooltipProps: {} }
}

export interface ChartReadoutProps {
  readout: ChartReadoutHandle
  labelFormatter?: (label: string) => string
  valueFormatter?: (value: number | string, name: string) => string
  hint?: string
}

export const ChartReadout: React.FC<ChartReadoutProps> = () => null
