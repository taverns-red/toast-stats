/**
 * Club contact fields (#2026).
 *
 * Find-A-Club publishes a contact email and phone per club. We republished
 * them in bulk on every promoted, CDN-served snapshot and analytics file;
 * no surface reads them. They stay in the raw FAC fetch (`raw-fac/`, never
 * promoted) and are written nowhere else. The writers strip them, the
 * content gate holds a promoted object that still carries one, and the
 * completeness gate does not count their absence as a regression against
 * prod objects written before the change.
 */

/** Keys never written into a promoted artifact. */
export const CLUB_CONTACT_KEYS = ['email', 'phone'] as const

const CONTACT = new Set<string>(CLUB_CONTACT_KEYS)

/** True for a retired club contact key. */
export function isClubContactKey(key: string): boolean {
  return CONTACT.has(key)
}

/**
 * The record without its contact keys. Returns the same object when it has
 * none, and passes non-objects through, so it can map any record array.
 */
export function omitClubContactFields<T>(record: T): T {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return record
  }
  const keys = Object.keys(record)
  if (!keys.some(isClubContactKey)) return record
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (!isClubContactKey(key)) {
      out[key] = (record as Record<string, unknown>)[key]
    }
  }
  return out as T
}

/**
 * The path (e.g. `data.clubs[3].email`) of the first contact key holding a
 * non-blank string anywhere in `value`, or null. It names where, never the
 * value, so it is safe to log.
 */
export function findClubContactField(value: unknown): string | null {
  const walk = (node: unknown, path: string): string | null => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const hit = walk(node[i], `${path}[${i}]`)
        if (hit !== null) return hit
      }
      return null
    }
    if (typeof node !== 'object' || node === null) return null
    for (const [key, child] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key
      if (
        isClubContactKey(key) &&
        typeof child === 'string' &&
        child.trim() !== ''
      ) {
        return at
      }
      const hit = walk(child, at)
      if (hit !== null) return hit
    }
    return null
  }
  return walk(value, '')
}
