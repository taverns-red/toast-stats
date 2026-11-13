/* Shared display spellings (#2648). The same quantity used to be written many
   ways on one screen; each helper here is the single spelling. Display only:
   nothing here resolves a program year or reads data. Dates live in
   `dateFormatting.formatDateText`. */

const MINUS = '−'

/** "+312", "−2,501", "0": true minus sign, thousands separators. `zero` lets a
 *  caller choose how no change reads (the club trend uses "±0"). */
export function signedDelta(n: number, zero = '0'): string {
  if (n === 0) return zero
  return `${n > 0 ? '+' : MINUS}${Math.abs(n).toLocaleString()}`
}

/** "+3.0%", "−2.0%", "0.0%": one decimal, true minus sign. */
export function signedPercent(percent: number): string {
  const text = Math.abs(percent).toFixed(1)
  if (Number(text) === 0) return '0.0%'
  return `${percent > 0 ? '+' : MINUS}${text}%`
}

/** "PY 2026–27" ('long') or "PY 26–27" ('short'), en dash. Takes the
 *  start year or any "2026-2027" / "2026-27" label; an unparseable label is
 *  returned unchanged. */
export function formatPY(
  py: string | number,
  style: 'long' | 'short' = 'long'
): string {
  let start: number
  if (typeof py === 'number') {
    start = py
  } else {
    const m = /^(\d{4})\s*[-–—]\s*\d{2,4}$/.exec(py.trim())
    if (!m) return py
    start = Number(m[1])
  }
  const end = String((start + 1) % 100).padStart(2, '0')
  const from = style === 'short' ? String(start % 100).padStart(2, '0') : start
  return `PY ${from}–${end}`
}

/** "Region 4" in prose and headings, "R4" as the compact tag. Ids arrive
 *  zero-padded ("04") or bare; the padding never reaches the reader. */
export function formatRegion(
  id: string | number,
  style: 'long' | 'compact' = 'long'
): string {
  const raw = String(id).trim()
  const n = /^\d+$/.test(raw) ? String(Number(raw)) : raw
  return style === 'compact' ? `R${n}` : `Region ${n}`
}

const isNumericId = (id: string) => /^\d+$/.test(id.trim())

/** District link text: "D93". The undistricted bucket ("U") is named. */
export function formatDistrict(id: string): string {
  const raw = id.trim()
  if (raw === 'U') return 'Undistricted'
  return `D${isNumericId(raw) ? Number(raw) : raw}`
}

/** The accessible name that goes with `formatDistrict`: "District 93". */
export function districtAriaLabel(id: string): string {
  const raw = id.trim()
  if (raw === 'U') return 'Undistricted'
  return `District ${isNumericId(raw) ? Number(raw) : raw}`
}
