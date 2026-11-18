/**
 * check-video-urls failure report (#2899): a failure must name the video,
 * the cut and the URL, so whoever reads the run log knows which file to
 * restore without opening the JSON.
 */
import { describe, it, expect } from 'vitest'
import { describeFailures, type VideoUrlResult } from '../videoUrlCheck'

const ok = (id: string): VideoUrlResult => ({
  id,
  cut: 'desktop',
  url: `https://cdn.taverns.red/videos/${id}/desktop.mp4`,
  status: 206,
  ok: true,
})

describe('describeFailures (#2899)', () => {
  it('is empty when every URL is live', () => {
    expect(describeFailures([ok('v1'), ok('v2')])).toEqual([])
  })

  it('names the video, the cut, the URL and the status of each failure', () => {
    const lines = describeFailures([
      ok('v1'),
      {
        id: 'v2',
        cut: 'mobile',
        url: 'https://cdn.taverns.red/videos/v2/mobile.mp4',
        status: 404,
        ok: false,
      },
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('v2')
    expect(lines[0]).toContain('mobile')
    expect(lines[0]).toContain('https://cdn.taverns.red/videos/v2/mobile.mp4')
    expect(lines[0]).toContain('404')
  })

  it('says "no response" when the request itself failed', () => {
    const lines = describeFailures([
      {
        id: 'v3',
        cut: 'desktop',
        url: 'https://x/y.mp4',
        status: null,
        ok: false,
      },
    ])
    expect(lines[0]).toContain('no response')
  })
})
