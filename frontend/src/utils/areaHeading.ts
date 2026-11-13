/**
 * The text a section heading prints for an area (#2718, UNIT-11).
 *
 * The analytics rows already name the area "Area 01", so "Area {id} — {name}"
 * printed "Area 01 — Area 01". When the name already carries the id (or opens
 * with "Area"), it is the whole label; a custom name keeps the id before it.
 */
export function areaHeadingLabel(areaId: string, areaName: string): string {
  const name = areaName.trim()
  if (!name) return `Area ${areaId}`
  if (
    /^area\b/i.test(name) ||
    name.toLowerCase().includes(areaId.toLowerCase())
  )
    return name
  return `Area ${areaId} — ${name}`
}
