/**
 * Basemap location (#1786, ADR-016).
 *
 * The Protomaps PMTiles archive lives on the same bucket and CDN as the data,
 * under an immutable, dated object name: a new build is a new object, never
 * an overwrite, so a long cache lifetime is safe. Each build reads its own
 * copy: preview builds read the staging bucket base and prod reads
 * cdn.taverns.red, as `VITE_CDN_BASE_URL` already decides for data.
 * `VITE_BASEMAP_PMTILES_URL` overrides the location, for example to point dev
 * at a local extract.
 */

export const BASEMAP_OBJECT_PATH =
  'basemap/protomaps-v4/world-z0-14-20261015.pmtiles'

/** The archive's highest zoom (the `z0-<n>` in its name). MapLibre
 * over-zooms its tiles beyond it. */
export const BASEMAP_MAX_ZOOM = 14

const DEFAULT_CDN_BASE_URL = 'https://cdn.taverns.red'

export function resolveBasemapUrl(
  env: Record<string, string | undefined>,
  cdnBaseUrl: string
): string {
  const override = env['VITE_BASEMAP_PMTILES_URL']
  if (override) return override
  return `${cdnBaseUrl.replace(/\/+$/, '')}/${BASEMAP_OBJECT_PATH}`
}

export function basemapUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>
  return resolveBasemapUrl(
    env,
    env['VITE_CDN_BASE_URL'] || DEFAULT_CDN_BASE_URL
  )
}
