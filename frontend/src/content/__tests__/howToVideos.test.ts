/* How-to video catalogue (#2310). The one file that adding a published video
   touches; these invariants keep a hand-typed entry from pointing at a file
   the publish workflow never wrote. The live URL check (200/206 from the CDN)
   is `npm run videos:check-urls`, which reads this same catalogue. */

import { describe, it, expect } from 'vitest'
import {
  HOW_TO_VIDEOS,
  VIDEO_CDN_BASE,
  groupByPrimaryRole,
  videoUrl,
  type HowToVideo,
} from '../howToVideos'

const entry = (over: Partial<HowToVideo> & { id: string }): HowToVideo => ({
  title: `Title ${over.id}`,
  roles: ['Area Director'],
  description: 'One line.',
  version: '2026-10-27',
  desktopUrl: videoUrl(over.id, over.version ?? '2026-10-27', 'desktop'),
  mobileUrl: videoUrl(over.id, over.version ?? '2026-10-27', 'mobile'),
  ...over,
})

describe('videoUrl', () => {
  it('builds the immutable versioned CDN path the publish workflow writes', () => {
    expect(videoUrl('v2', '2026-10-26.2', 'desktop')).toBe(
      'https://cdn.taverns.red/videos/v2/2026-10-26.2/v2-desktop.mp4'
    )
    expect(videoUrl('v4', '2026-10-27', 'mobile')).toBe(
      'https://cdn.taverns.red/videos/v4/2026-10-27/v4-mobile.mp4'
    )
  })
})

describe('HOW_TO_VIDEOS', () => {
  it('lists at least one video', () => {
    expect(HOW_TO_VIDEOS.length).toBeGreaterThan(0)
  })

  it('has unique scenario ids', () => {
    const ids = HOW_TO_VIDEOS.map(v => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(HOW_TO_VIDEOS.map(v => [v.id, v] as const))(
    '%s: both cuts point at its own id and version on the CDN',
    (_id, v) => {
      expect(v.desktopUrl).toBe(videoUrl(v.id, v.version, 'desktop'))
      expect(v.mobileUrl).toBe(videoUrl(v.id, v.version, 'mobile'))
      expect(v.desktopUrl.startsWith(`${VIDEO_CDN_BASE}/`)).toBe(true)
    }
  )

  it.each(HOW_TO_VIDEOS.map(v => [v.id, v] as const))(
    '%s: has a title, at least one role and a one-line description',
    (_id, v) => {
      expect(v.title.trim()).not.toBe('')
      expect(v.roles.length).toBeGreaterThan(0)
      for (const role of v.roles) expect(role.trim()).not.toBe('')
      expect(v.description.trim()).not.toBe('')
      expect(v.description).not.toMatch(/\n/)
    }
  )

  it('uses a dated version, optionally with a .N republish suffix', () => {
    for (const v of HOW_TO_VIDEOS) {
      expect(v.version).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/)
    }
  })

  it('lists V2 at the 2026-10-26.2 republish, not the first 2026-10-26 cut', () => {
    const v2 = HOW_TO_VIDEOS.find(v => v.id === 'v2')
    expect(v2?.version).toBe('2026-10-26.2')
    expect(v2?.title).toBe('What should I do this week?')
    expect(v2?.roles[0]).toBe('Area Director')
  })

  it('lists the first batch (V1, V3, V4) at its 2026-10-27 publish', () => {
    // Each URL answered 206 from the CDN on 2026-10-27
    // (npm run videos:check-urls) before it was added here.
    expect(HOW_TO_VIDEOS.slice(0, 4).map(v => [v.id, v.version])).toEqual([
      ['v1', '2026-10-27'],
      ['v2', '2026-10-26.2'],
      ['v3', '2026-10-27'],
      ['v4', '2026-10-27'],
    ])
  })

  it('lists the second batch (V5, V8, V12) at its 2026-10-27 publish', () => {
    // Each URL answered 206 from the CDN on 2026-10-27 (npm run
    // videos:check-urls) before it was added here. Storyboard rank order.
    expect(HOW_TO_VIDEOS.map(v => v.id)).toEqual([
      'v1',
      'v2',
      'v3',
      'v4',
      'v5',
      'v8',
      'v12',
    ])
    for (const id of ['v5', 'v8', 'v12']) {
      expect(HOW_TO_VIDEOS.find(v => v.id === id)?.version).toBe('2026-10-27')
    }
  })
})

describe('groupByPrimaryRole', () => {
  it('groups by the first role, in first-seen order, keeping entry order', () => {
    const a = entry({ id: 'a', roles: ['District Director'] })
    const b = entry({ id: 'b', roles: ['Area Director', 'Division Director'] })
    const c = entry({ id: 'c', roles: ['District Director', 'Area Director'] })
    expect(groupByPrimaryRole([a, b, c])).toEqual([
      { role: 'District Director', videos: [a, c] },
      { role: 'Area Director', videos: [b] },
    ])
  })

  it('returns no groups for no videos', () => {
    expect(groupByPrimaryRole([])).toEqual([])
  })
})
