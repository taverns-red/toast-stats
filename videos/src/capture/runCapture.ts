import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium, type Page } from 'playwright'
import type {
  CaptureManifest,
  FormFactor,
  CapturedBeat,
  CaptureStep,
  Scenario,
} from '../scenarios/types'

/** How long the page gets to settle after a beat's steps (animations, refetch). */
const SETTLE_MS = 450
/** A smooth scroll in Chromium finishes well inside this. */
const SCROLL_MS = 900

async function runStep(page: Page, step: CaptureStep): Promise<void> {
  switch (step.kind) {
    case 'click':
      await page.locator(step.selector).first().click()
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

function probeDurationSec(file: string): number {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ],
    { encoding: 'utf8' }
  )
  return Number.parseFloat(out.trim())
}

/**
 * Record one scenario on the live site and write `capture.mp4` and
 * `manifest.json` to `outDir`. Each beat is held for exactly its on-screen
 * length, so the composer can cut the recording at the beat starts.
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
  const rawDir = join(outDir, 'raw')
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(rawDir, { recursive: true })

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
    // Record at device pixels so a 3× phone capture stays sharp when the
    // composer zooms into it.
    recordVideo: {
      dir: rawDir,
      size: {
        width: device.viewport.width * device.deviceScaleFactor,
        height: device.viewport.height * device.deviceScaleFactor,
      },
    },
  })
  const page = await context.newPage()
  const t0 = performance.now()
  const elapsedSec = (): number => (performance.now() - t0) / 1000

  try {
    await page.goto(scenario.url, { waitUntil: 'networkidle' })
    await page.locator(form.readySelector).first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    for (const step of form.setup) await runStep(page, step)
    await settle(page)

    const beats: CapturedBeat[] = []
    for (const beat of scenario.beats) {
      const actions = form.beats[beat.id]
      if (!actions) throw new Error(`${format} has no actions for ${beat.id}`)
      const beatStart = elapsedSec()
      for (const step of actions.steps) await runStep(page, step)
      await settle(page)
      const highlightAtSec = elapsedSec() - beatStart
      const box = actions.highlight
        ? clampBox(
            await page.locator(actions.highlight).first().boundingBox(),
            device.viewport
          )
        : null
      const lengthSec = beat.endSec - beat.startSec
      const remainingMs = (lengthSec - (elapsedSec() - beatStart)) * 1000
      if (remainingMs < 0) {
        throw new Error(
          `beat "${beat.id}" needed ${(elapsedSec() - beatStart).toFixed(2)} s; it has ${lengthSec} s on screen`
        )
      }
      await page.waitForTimeout(remainingMs)
      beats.push({
        id: beat.id,
        videoStartSec: beatStart,
        highlightAtSec,
        box,
      })
    }

    // Hold the final frame briefly so the last beat never runs off the end.
    await page.waitForTimeout(500)
    const closedAtSec = elapsedSec()
    const video = page.video()
    if (!video) throw new Error('Playwright did not record a video')
    await context.close()
    const rawPath = await video.path()

    // The recorder starts a moment before `t0`; align the beat marks to the
    // file using its measured length.
    const offsetSec = probeDurationSec(rawPath) - closedAtSec
    const aligned = beats.map(b => ({
      ...b,
      videoStartSec: Math.max(0, b.videoStartSec + offsetSec),
    }))

    // Constant 30 fps H.264 is what the composer seeks most reliably in.
    const mp4 = join(outDir, 'capture.mp4')
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        rawPath,
        '-vf',
        `fps=${scenario.fps}`,
        '-c:v',
        'libx264',
        '-crf',
        '12',
        '-preset',
        'slow',
        '-pix_fmt',
        'yuv420p',
        mp4,
      ],
      { stdio: 'inherit' }
    )
    rmSync(rawDir, { recursive: true, force: true })

    const manifest: CaptureManifest = {
      scenarioId: scenario.id,
      format,
      capturedAt: new Date().toISOString(),
      url: scenario.url,
      viewport: device.viewport,
      video: `${publicRelDir}/capture.mp4`,
      beats: aligned,
    }
    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    )
    return manifest
  } finally {
    await browser.close()
  }
}
