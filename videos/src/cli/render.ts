/**
 * `npm run videos:render -- <scenario> [--format mobile]` — compose the
 * captured walkthrough into videos/out/<scenario>[-<format>].mp4 (gitignored).
 * Needs a prior capture of the same format. Opt-in only: never part of npm
 * test, the pre-push hook or CI (#2293).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { generatePad, measureLufs } from '../render/music'
import { DEFAULT_MUSIC } from '../scenarios/music'
import { RENDER_ENCODING } from '../output/encoding'
import { outputName, type CliArgs } from '../scenarios/cliArgs'
import type { CaptureManifest } from '../scenarios/types'
import {
  captureRelDir,
  FRONTEND_FONTS,
  loadValidScenario,
  OUT_DIR,
  PUBLIC_DIR,
  runIfMain,
  VIDEOS_ROOT,
} from './paths'

export async function render({ id, format }: CliArgs): Promise<void> {
  const scenario = loadValidScenario(id)
  const name = outputName(scenario.id, format)

  const manifestPath = join(PUBLIC_DIR, captureRelDir(name), 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No ${format} capture for ${scenario.id}. Run: npm run videos:capture -- ${scenario.id} --format ${format}`
    )
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  ) as CaptureManifest

  // The app's own self-hosted faces, copied rather than duplicated in git.
  mkdirSync(join(PUBLIC_DIR, 'fonts'), { recursive: true })
  for (const file of ['inter-latin.woff2', 'montserrat-latin.woff2']) {
    copyFileSync(join(FRONTEND_FONTS, file), join(PUBLIC_DIR, 'fonts', file))
  }

  const musicPath = join(PUBLIC_DIR, scenario.music)
  if (!existsSync(musicPath)) {
    if (scenario.music !== DEFAULT_MUSIC) {
      throw new Error(`Music track ${musicPath} is missing.`)
    }
    console.error('Generating the original background pad …')
    generatePad(musicPath)
  }

  console.error('Bundling the composition …')
  const serveUrl = await bundle({
    entryPoint: join(VIDEOS_ROOT, 'src', 'remotion', 'index.ts'),
    publicDir: PUBLIC_DIR,
  })
  const inputProps = { scenarioId: scenario.id, format, manifest }
  const composition = await selectComposition({
    serveUrl,
    id: 'HowTo',
    inputProps,
  })

  mkdirSync(OUT_DIR, { recursive: true })
  const outputLocation = join(OUT_DIR, `${name}.mp4`)
  let lastPct = -10
  await renderMedia({
    composition,
    serveUrl,
    ...RENDER_ENCODING,
    crf: 23,
    audioBitrate: '128k',
    outputLocation,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100)
      if (pct >= lastPct + 10) {
        lastPct = pct
        console.error(`  rendering ${pct}%`)
      }
    },
  })

  const sizeMb = statSync(outputLocation).size / 1024 / 1024
  const lufs = measureLufs(outputLocation)
  console.error(
    `Wrote ${outputLocation} — ${scenario.durationSec} s, ${sizeMb.toFixed(1)} MB, ` +
      `integrated loudness ${lufs === null ? 'unknown' : `${lufs} LUFS`}`
  )
}

runIfMain(import.meta.url, render)
