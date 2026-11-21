import type { ModeModel } from './pinModes'

/** Height in px to reserve for the legend chips before they render. */
export function legendSlotHeight(_labels: readonly string[]): number {
  return 0
}

export function estimateLegendLabels(_model: ModeModel): string[] {
  return []
}
