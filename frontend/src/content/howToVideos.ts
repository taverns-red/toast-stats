/**
 * Published how-to videos (#2310) — the one file that adding a video touches.
 *
 * The site is a static SPA, so the list is hard-coded here rather than read
 * from the CDN. An entry belongs here only once the publish workflow
 * (`.github/workflows/videos-publish.yml`) has written both cuts and they
 * answer 200/206 from the CDN. Check with `npm run videos:check-urls`.
 *
 * Titles and roles come from the scenario files (`videos/src/scenarios/*.ts`)
 * and the storyboard (`.routine-tmp/video-scenarios-2026-10-25.md` §4). The
 * description is the video's title-card caption.
 *
 * Versions are immutable: a re-render is published under a new version
 * (`2026-10-26.2`), and this file moves to it.
 */

export const VIDEO_CDN_BASE = 'https://cdn.taverns.red/videos'

/** The two renders of every scenario: 16:9 desktop and 9:16 phone. */
export type VideoCut = 'desktop' | 'mobile'

export interface HowToVideo {
  /** Scenario id, as in `videos/src/scenarios/index.ts` (`v2`). */
  id: string
  title: string
  /** Who it is for. The first role is the one the page groups it under. */
  roles: readonly string[]
  /** One line. */
  description: string
  /** Published version: the path segment under `videos/<id>/`. */
  version: string
  desktopUrl: string
  mobileUrl: string
}

/** The CDN path the publish workflow writes for one cut. */
export function videoUrl(id: string, version: string, cut: VideoCut): string {
  return `${VIDEO_CDN_BASE}/${id}/${version}/${id}-${cut}.mp4`
}

function video(
  id: string,
  version: string,
  fields: Pick<HowToVideo, 'title' | 'roles' | 'description'>
): HowToVideo {
  return {
    id,
    version,
    ...fields,
    desktopUrl: videoUrl(id, version, 'desktop'),
    mobileUrl: videoUrl(id, version, 'mobile'),
  }
}

/** In storyboard rank order. */
export const HOW_TO_VIDEOS: readonly HowToVideo[] = [
  video('v1', '2026-10-27', {
    title: 'How far from Distinguished District?',
    roles: ['District Director'],
    description: "Your district's gap to Distinguished, on one page.",
  }),
  video('v2', '2026-10-26.2', {
    title: 'What should I do this week?',
    roles: ['Area Director'],
    description: "Your area's to-do list, built from the data.",
  }),
  video('v3', '2026-10-27', {
    title: 'One nudge from Distinguished',
    roles: ['Program Quality Director', 'Area Director', 'Club President'],
    description: 'Find the clubs one nudge from Distinguished.',
  }),
  video('v4', '2026-10-27', {
    title: "Your club's page",
    roles: ['Club officers'],
    description: 'Everything TI publishes about your club, on one page.',
  }),
]

export interface RoleGroup {
  role: string
  videos: readonly HowToVideo[]
}

/** Group by each video's first role, in first-seen order. */
export function groupByPrimaryRole(videos: readonly HowToVideo[]): RoleGroup[] {
  const groups = new Map<string, HowToVideo[]>()
  for (const v of videos) {
    const role = v.roles[0]
    if (role === undefined) continue
    const list = groups.get(role)
    if (list) list.push(v)
    else groups.set(role, [v])
  }
  return [...groups].map(([role, list]) => ({ role, videos: list }))
}
