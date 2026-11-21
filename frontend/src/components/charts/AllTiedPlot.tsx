import React from 'react'
import { ALL_TIED_MESSAGE } from '../../utils/rankTies'

/**
 * Takes a rank chart's plot box when every plotted date is tied, at the
 * plot's height so nothing below it moves (rankCharts.tied.test.tsx).
 */
export const AllTiedPlot: React.FC<{ height: number }> = ({ height }) => (
  <div className="flex items-center justify-center" style={{ height }}>
    <p className="text-base text-[var(--ink-2)] font-tm-body text-center">
      {ALL_TIED_MESSAGE}
    </p>
  </div>
)
