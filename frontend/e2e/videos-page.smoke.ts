import { test, expect, type Page } from './fixtures/test'

/* /videos — published how-to videos (#2310), against the deployed preview.
 *
 * At 390 (phone) and 1280 (desktop), light and dark:
 *   - no sideways page scroll, and every video frame fits the viewport;
 *   - every <video> has a CDN src, the phone cut at 390 and the desktop cut
 *     at 1280, with controls, preload="none" and no autoplay;
 *   - every video offers direct links to both MP4 files.
 * At 1280 one video loads its metadata. preload="none" means the page itself
 * never requests a video, so this is the only check that the hosting CSP
 * (media-src) and the CDN let a video play. The files are faststart MP4s, so
 * metadata is a small range read.
 *
 * Fixed-position chrome cannot hide an overflow from the scroll check here
 * (Lesson: a fixed bar that overflows adds no page scroll): the frames are
 * in normal flow, and each box is also measured against the viewport. */

const THEMES = ['light', 'dark'] as const
const WIDTHS = [
  { width: 390, height: 844, cut: 'mobile' },
  { width: 1280, height: 900, cut: 'desktop' },
] as const

async function open(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t as string)
  }, theme)
  await page.goto('/videos')
  await page.locator('video').first().waitFor({ state: 'attached' })
}

for (const theme of THEMES) {
  for (const { width, height, cut } of WIDTHS) {
    test(`/videos at ${width}px (${theme})`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.setViewportSize({ width, height })
      await open(page, theme)

      await expect(
        page.getByRole('heading', { level: 1, name: /how-to videos/i })
      ).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)

      const videos = await page.locator('video').evaluateAll(els =>
        els.map(el => {
          const v = el as HTMLVideoElement
          const box = v.getBoundingClientRect()
          return {
            src: v.getAttribute('src') ?? '',
            preload: v.getAttribute('preload'),
            controls: v.hasAttribute('controls'),
            autoplay: v.hasAttribute('autoplay'),
            left: box.left,
            right: box.right,
            width: box.width,
          }
        })
      )
      expect(videos.length).toBeGreaterThan(0)
      for (const v of videos) {
        expect(v.src).toMatch(
          new RegExp(
            `^https://cdn\\.taverns\\.red/videos/[^/]+/[^/]+/[^/]+-${cut}\\.mp4$`
          )
        )
        expect(v.preload).toBe('none')
        expect(v.controls).toBe(true)
        expect(v.autoplay).toBe(false)
        expect(v.width).toBeGreaterThan(0)
        expect(v.left).toBeGreaterThanOrEqual(0)
        expect(v.right).toBeLessThanOrEqual(width)
      }

      const cards = page.locator('[data-testid^="video-"]')
      await expect(cards).toHaveCount(videos.length)
      for (const card of await cards.all()) {
        await expect(
          card.getByRole('link', { name: /desktop mp4/i })
        ).toHaveAttribute('href', /-desktop\.mp4$/)
        await expect(
          card.getByRole('link', { name: /phone mp4/i })
        ).toHaveAttribute('href', /-mobile\.mp4$/)
      }

      if (width === 1280) {
        const readyState = await page
          .locator('video')
          .first()
          .evaluate(
            el =>
              new Promise<number>(resolve => {
                const v = el as HTMLVideoElement
                const done = () => resolve(v.readyState)
                v.addEventListener('loadedmetadata', done, { once: true })
                v.addEventListener('error', done, { once: true })
                setTimeout(done, 15_000)
                v.preload = 'metadata'
                v.load()
              })
          )
        expect(
          readyState,
          'video metadata loads (CSP media-src + CDN)'
        ).toBeGreaterThanOrEqual(1)
      }

      expect(errors).toEqual([])
    })
  }
}
