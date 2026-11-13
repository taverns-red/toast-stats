/* Compact number forms shared by the district KPI strip's collapsed summary
   and the stuck KPI line (#2708): 888, 8.9K, 12K, +312, −1.2K, 0. */

export const formatCompact = (n: number): string => {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${k.toFixed(k >= 10 ? 0 : 1)}K`
  }
  return String(n)
}

/** Signed form: +312 / −1.2K / 0 (a true minus sign, not a hyphen). */
export const formatSignedCompact = (n: number): string => {
  if (n === 0) return '0'
  const sign = n > 0 ? '+' : '−'
  return `${sign}${formatCompact(Math.abs(n))}`
}
