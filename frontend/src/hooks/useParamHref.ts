import { useSearchParams } from 'react-router-dom'

/* Search-param links for the education pages (#1793, #1810): the href that
   sets or clears one key and keeps the rest, so a switch is a plain link
   (ADR-005: URL state, no tabs). A sort is per rollup level, so switching
   `rollup` starts that table fresh. */

export function useParamHref(): (key: string, value: string | null) => string {
  const [params] = useSearchParams()
  return (key, value) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    // A sort is per rollup level; switching level starts that table fresh.
    if (key === 'rollup') {
      next.delete('sort')
      next.delete('dir')
    }
    const s = next.toString()
    return s ? `?${s}` : '?'
  }
}
