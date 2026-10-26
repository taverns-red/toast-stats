/**
 * Video publish destination — pure functions (#2310).
 *
 * Reviewed how-to renders (videos.yml artifacts) are published to
 * `videos/<scenario>/<version>/<scenario>-<format>.mp4` on the data buckets.
 * `cdn.taverns.red` already serves the prod bucket and
 * `cdn-staging.taverns.red` the staging bucket, so no new infrastructure is
 * needed, the same placement as the basemap (ADR-016).
 *
 * `videos/` is outside every prefix the data pipeline owns: promotion and
 * the content gates are allow-lists (PROMOTED_PREFIXES,
 * MANIFEST_GATED_PREFIXES), prune deletes only dated raw-csv/ and snapshots/
 * dirs, run-manifest retention only runs/<id>/, and every lifecycle rule
 * that ages out live objects is prefix-scoped. The tests in
 * __tests__/videoPublish.test.ts pin each of those.
 *
 * Objects are immutable: a new render is a new version label, never an
 * overwrite, so the cache header can be a year.
 */
import {
  MANIFEST_GATED_PREFIXES,
  PROMOTED_PREFIXES,
} from './promotionContentGate.js'
import {
  PRUNE_DELETABLE_LAYERS,
  PRUNE_RETAINED_LAYERS,
} from './pruneGcsDeletions.js'
import { RUNS_PREFIX } from './runManifest.js'
// The render CLI's own naming, so the planner and videos.yml cannot drift.
import { outputName } from '../../videos/src/scenarios/cliArgs'

export const VIDEO_PREFIX = 'videos/'
export const VIDEO_FORMATS = ['desktop', 'mobile'] as const
export type VideoFormat = (typeof VIDEO_FORMATS)[number]

export const VIDEO_CONTENT_TYPE = 'video/mp4'
/**
 * One year, immutable: the path is versioned and never overwritten.
 * `no-transform` keeps Cloud CDN dynamic compression off the bytes.
 */
export const VIDEO_CACHE_CONTROL =
  'public, max-age=31536000, immutable, no-transform'
export const VIDEO_CDN_BASE_URL = 'https://cdn.taverns.red'

/** Every prefix the data pipeline (or the basemap build) writes or deletes. */
export const DATA_PREFIXES: readonly string[] = [
  ...new Set<string>([
    ...PROMOTED_PREFIXES,
    ...MANIFEST_GATED_PREFIXES,
    ...PRUNE_DELETABLE_LAYERS.map(l => `${l}/`),
    ...PRUNE_RETAINED_LAYERS.map(l => `${l}/`),
    RUNS_PREFIX,
    'basemap/',
  ]),
]

/** A lowercase slug: `v2`, `club-search`. Same rule as videos.yml. */
const SCENARIO = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** `2026-10-26`, `r1`, `1.0.2`: no slash, no `..`, no gcloud wildcard. */
const VERSION = /^[a-z0-9]+([.-][a-z0-9]+)*$/
const MAX_VERSION_LENGTH = 40

/**
 * The full object shape. videos-publish.yml re-checks each object against
 * this same pattern in shell before writing it.
 */
export const VIDEO_OBJECT =
  /^videos\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[a-z0-9]+(?:[.-][a-z0-9]+)*\/([a-z0-9]+(?:-[a-z0-9]+)*)-(desktop|mobile)\.mp4$/

export function videoObjectPath(
  scenario: string,
  version: string,
  format: VideoFormat
): string {
  if (!SCENARIO.test(scenario)) {
    throw new Error(`invalid scenario id '${scenario}' (lowercase slug)`)
  }
  if (version.length > MAX_VERSION_LENGTH || !VERSION.test(version)) {
    throw new Error(
      `invalid version label '${version}' (lowercase letters, digits, single '.' or '-' between them, at most ${MAX_VERSION_LENGTH} characters)`
    )
  }
  if (!(VIDEO_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`invalid format '${String(format)}'`)
  }
  const object = `${VIDEO_PREFIX}${scenario}/${version}/${scenario}-${format}.mp4`
  assertVideoDestination(object)
  return object
}

/** Throws unless `object` is exactly a versioned video object. */
export function assertVideoDestination(object: string): void {
  const dataPrefix = DATA_PREFIXES.find(p => object.startsWith(p))
  if (dataPrefix) {
    throw new Error(
      `refusing video publish to '${object}': ${dataPrefix} is a data prefix`
    )
  }
  const m = VIDEO_OBJECT.exec(object)
  if (!m || m[1] !== m[2]) {
    throw new Error(
      `refusing video publish to '${object}': not videos/<scenario>/<version>/<scenario>-<desktop|mobile>.mp4`
    )
  }
}

export interface VideoPublishItem {
  format: VideoFormat
  /** File name inside the downloaded artifact (render CLI's outputName). */
  file: string
  /** Object name, bucket stripped. */
  object: string
  /** Where the prod CDN serves it. */
  url: string
}

/**
 * Map an artifact's files to their objects. The artifact must hold exactly
 * what the render CLI writes (`outputName`): `<scenario>.mp4` for desktop
 * and `<scenario>-mobile.mp4`. A missing format or any other file fails, so
 * a wrong or partial artifact never publishes. The published names always
 * carry the format (`<scenario>-desktop.mp4`), so a URL says what it is.
 */
export function planVideoPublish(input: {
  scenario: string
  version: string
  files: readonly string[]
}): VideoPublishItem[] {
  const { scenario, version, files } = input
  const items = VIDEO_FORMATS.map(format => {
    const object = videoObjectPath(scenario, version, format)
    return {
      format,
      file: `${outputName(scenario, format)}.mp4`,
      object,
      url: `${VIDEO_CDN_BASE_URL}/${object}`,
    }
  })
  const expected = new Set(items.map(i => i.file))
  const missing = [...expected].filter(f => !files.includes(f))
  if (missing.length > 0) {
    throw new Error(`artifact is missing ${missing.join(', ')}`)
  }
  const unexpected = files.filter(f => !expected.has(f))
  if (unexpected.length > 0) {
    throw new Error(
      `artifact holds unexpected files: ${unexpected.join(', ')} (expected only ${[...expected].join(', ')})`
    )
  }
  return items
}
