/** Pre-projected world geometry for the country choropleth (#1797). */
export interface WorldGeometry {
  source: string
  width: number
  height: number
  sphere: string
  countries: { id: string; name: string; d: string; b: number[] }[]
  markers: { id: string; name: string; x: number; y: number }[]
}
