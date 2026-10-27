import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium, type Page } from 'playwright'
import type {
  CaptureManifest,
  CapturedBeat,
  CaptureStep,
  FormFactor,
  Scenario,
} from '../scenarios/types'
import { privacyMaskScript, PRIVACY_STYLE_ID } from '../scenarios/privacy'

/** How long the page gets to settle after a beat's steps (animations, refetch). */
const SETTLE_MS = 450
/** A smooth scroll in Chromium finishes well inside this. */
const SCROLL_MS = 900
/** Delay between typed keys: quick, but slow enough to read. */
const TYPE_DELAY_MS = 110

async function runStep(page: Page, step: CaptureStep): Promise<void> {
  switch (step.kind) {
    case 'click':
      await page.locator(step.selector).first().click()
      // Park the pointer in the corner so no hover tooltip follows the
      // scroll that comes next (#2353).
      await page.mouse.move(0, 0)
      return
    case 'select':
      await page.locator(step.selector).selectOption(step.value)
      return
    case 'scrollTo':
      await page
        .locator(step.selector)
        .first()
        .evaluate((el, offsetTop) => {
          const top = el.getBoundingClientRect().top + window.scrollY
          window.scrollTo({ top: top - offsetTop, behavior: 'smooth' })
        }, step.offsetTop)
      await page.waitForTimeout(SCROLL_MS)
      return
    case 'type':
      await page
        .locator(step.selector)
        .first()
        .pressSequentially(step.text, { delay: TYPE_DELAY_MS })
      return
    case 'press':
      await page.keyboard.press(step.key)
      return
    case 'download': {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(step.selector).first().click(),
      ])
      await download.path()
      await download.delete()
      return
    }
    case 'pause':
      await page.waitForTimeout(step.ms)
      return
  }
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {
    // A long-poll or analytics beacon can keep the network busy; the fixed
    // settle below still applies.
  })
  await page.waitForTimeout(SETTLE_MS)
}

function clampBox(
  box: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number }
): CapturedBeat['box'] {
  if (!box) return null
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const right = Math.min(viewport.width, box.x + box.width)
  const bottom = Math.min(viewport.height, box.y + box.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Records the page by taking device-pixel screenshots back to back (~20 fps
 * at 3×) while the beats run, each stamped on the same clock as the beat
 * marks.
 *
 * Playwright's `recordVideo` and CDP's screencast both deliver frames at CSS
 * pixels (390×844 for a phone), which turns blurry once the composer zooms
 * in to make phone text readable. Screenshots honour deviceScaleFactor, and
 * the UI between actions is static, so a modest sample rate is enough.
 */
class FrameSampler {
  private readonly frames: { file: string; atSec: number }[] = []
  private running = false
  private loop: Promise<void> = Promise.resolve()

  constructor(
    private readonly page: Page,
    private readonly dir: string,
    private readonly clock: () => number
  ) {}

  start(): void {
    this.running = true
    this.loop = (async (): Promise<void> => {
      while (this.running) {
        const before = this.clock()
        const jpeg = await this.page.screenshot({
          type: 'jpeg',
          quality: 92,
          scale: 'device',
          animations: 'allow',
        })
        const file = join(
          this.dir,
          `f${String(this.frames.length).padStart(6, '0')}.jpg`
        )
        writeFileSync(file, jpeg)
        // A screenshot shows the page at the moment capture began.
        this.frames.push({ file, atSec: before })
      }
    })()
  }

  /** Stop sampling; returns the frames and the clock time sampling ended. */
  async stop(): Promise<{
    frames: { file: string; atSec: number }[]
    endSec: number
  }> {
    this.running = false
    await this.loop
    return { frames: this.frames, endSec: this.clock() }
  }
}

/** Assemble timestamped frames into constant-fps H.264, t=0 at the first. */
function encodeFrames(
  frames: { file: string; atSec: number }[],
  endSec: number,
  fps: number,
  listFile: string,
  mp4: string
): void {
  const first = frames[0]
  if (!first) throw new Error('No frames were captured')
  const lines: string[] = []
  frames.forEach((frame, i) => {
    const next = frames[i + 1]?.atSec ?? endSec
    lines.push(`file '${frame.file}'`)
    lines.push(`duration ${Math.max(0.001, next - frame.atSec).toFixed(4)}`)
  })
  // The concat demuxer ignores the last entry's duration unless the file is
  // repeated.
  lines.push(`file '${frames[frames.length - 1]?.file ?? first.file}'`)
  writeFileSync(listFile, lines.join('\n') + '\n')
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-vf',
      `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-c:v',
      'libx264',
      '-crf',
      '14',
      '-preset',
      'slow',
      '-pix_fmt',
      'yuv420p',
      mp4,
    ],
    { stdio: 'inherit' }
  )
}

/**
 * Record one scenario in one form factor on the live site and write
 * `capture.mp4` and `manifest.json` to `outDir`. Each beat is held for exactly
 * its on-screen length, so the composer can cut the recording at the beat
 * starts.
 */
export async function runCapture(
  scenario: Scenario,
  format: FormFactor,
  outDir: string,
  publicRelDir: string
): Promise<CaptureManifest> {
  const form = scenario.forms[format]
  if (!form) throw new Error(`Scenario ${scenario.id} has no ${format} form`)
  const { device } = form
  const framesDir = join(outDir, 'frames')
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(framesDir, { recursive: true })

  const browser = await chromium.launch()
  // A fresh context per capture: no "your district" star, theme or other
  // localStorage leaks between videos. Light theme is pinned explicitly.
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    colorScheme: 'light',
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
    acceptDownloads: true,
  })
  // Hide street addresses and contact links on every document, before the
  // first paint, so no frame ever shows them (#2353).
  // A source string, not a function: tsx wraps named arrow functions in a
  // `__name` helper that does not exist in the page, which made a function
  // init script throw silently and leave the address on screen.
  await context.addInitScript({ content: privacyMaskScript() })
  const page = await context.newPage()
  const clock = (): number => performance.now() / 1000

  try {
    await page.goto(scenario.url, { waitUntil: 'networkidle' })
    await page.locator(form.readySelector).first().waitFor()
    if ((await page.locator(`style#${PRIVACY_STYLE_ID}`).count()) !== 1) {
      throw new Error('the privacy mask is not on the page; refusing to record')
    }
    await page.evaluate(() => document.fonts.ready)
    for (const step of form.setup) await runStep(page, step)
    await settle(page)

    const sampler = new FrameSampler(page, framesDir, clock)
    sampler.start()
    const marks: CapturedBeat[] = []
    try {
      for (const beat of scenario.beats) {
        const actions = form.beats[beat.id]
        if (!actions) throw new Error(`${format} has no actions for ${beat.id}`)
        const beatStart = clock()
        for (const step of actions.steps) await runStep(page, step)
        await settle(page)
        const highlightAtSec = clock() - beatStart
        const box = actions.highlight
          ? clampBox(
              await page.locator(actions.highlight).first().boundingBox(),
              device.viewport
            )
          : null
        const lengthSec = beat.endSec - beat.startSec
        const remainingMs = (lengthSec - (clock() - beatStart)) * 1000
        if (remainingMs < 0) {
          throw new Error(
            `beat "${beat.id}" needed ${(clock() - beatStart).toFixed(2)} s; it has ${lengthSec} s on screen`
          )
        }
        await page.waitForTimeout(remainingMs)
        marks.push({
          id: beat.id,
          videoStartSec: beatStart,
          highlightAtSec,
          box,
        })
      }
    } catch (error) {
      // Stop sampling before the browser closes, so the step's own error is
      // reported rather than a screenshot on a closed page (#2353).
      await sampler.stop().catch(() => undefined)
      throw error
    }
    // Hold the final frame briefly so the last beat never runs off the end.
    await page.waitForTimeout(500)
    const { frames, endSec } = await sampler.stop()
    await context.close()

    const t0 = frames[0]?.atSec ?? 0
    const mp4 = join(outDir, 'capture.mp4')
    encodeFrames(frames, endSec, scenario.fps, join(outDir, 'frames.txt'), mp4)
    rmSync(framesDir, { recursive: true, force: true })
    rmSync(join(outDir, 'frames.txt'), { force: true })

    const manifest: CaptureManifest = {
      scenarioId: scenario.id,
      format,
      capturedAt: new Date().toISOString(),
      url: scenario.url,
      viewport: device.viewport,
      video: `${publicRelDir}/capture.mp4`,
      beats: marks.map(m => ({
        ...m,
        videoStartSec: Math.max(0, m.videoStartSec - t0),
      })),
    }
    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    )
    console.error(
      `  ${frames.length} frames over ${(endSec - t0).toFixed(1)} s (${(frames.length / (endSec - t0)).toFixed(1)} fps sampled)`
    )
    return manifest
  } finally {
    await browser.close()
  }
}
