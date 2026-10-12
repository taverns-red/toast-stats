export interface ChoroplethBin {
  min: number
  max: number | null
  label: string
}
export interface ChoroplethTheme {
  fills: readonly string[]
  noClubs: string
  water: string
  border: string
  hatch: string
  markerOutline: string
  selection: { inner: string; outer: string }
}
export const CHOROPLETH_BINS: readonly ChoroplethBin[] = []
const EMPTY: ChoroplethTheme = {
  fills: [],
  noClubs: '',
  water: '',
  border: '',
  hatch: '',
  markerOutline: '',
  selection: { inner: '', outer: '' },
}
export const CHOROPLETH_THEME: Record<'light' | 'dark', ChoroplethTheme> = {
  light: EMPTY,
  dark: EMPTY,
}
export function binFor(_clubs: number): number | null {
  return null
}
