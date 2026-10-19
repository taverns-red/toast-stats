let cached: boolean | undefined

/**
 * #2162 — can this browser give MapLibre (6.x: WebGL2 only) a context?
 * Asked once, and only when a map is about to load: creating a context is
 * not free. False on any failure, so callers keep their non-map fallback.
 */
export function supportsWebGL(): boolean {
  if (cached !== undefined) return cached
  try {
    const canvas = document.createElement('canvas')
    cached = !!canvas.getContext('webgl2')
  } catch {
    cached = false
  }
  return cached
}
