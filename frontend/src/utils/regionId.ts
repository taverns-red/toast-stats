/* Region ids (#2130). Rankings and region-rollups key regions as two-digit
   strings ("01".."14"), but a hand-typed or shared URL may say `/region/1`.
   Every region route reads its `:n` through `normaliseRegionId`, and
   `CanonicalRegionRoute` redirects the unpadded URL to the padded one. */

/** "1" → "01", "001" → "01", " 7 " → "07"; a non-numeric id is only trimmed. */
export function normaliseRegionId(raw: string | null | undefined): string {
  const id = (raw ?? '').trim()
  if (!/^\d+$/.test(id)) return id
  return String(Number(id)).padStart(2, '0')
}

/** The same location with its `/region/<id>` segment set to `canonical`. */
export function canonicalRegionPath(
  location: { pathname: string; search: string; hash: string },
  canonical: string
): string {
  const pathname = location.pathname.replace(
    /^\/region\/[^/]+/,
    `/region/${encodeURIComponent(canonical)}`
  )
  return `${pathname}${location.search}${location.hash}`
}
