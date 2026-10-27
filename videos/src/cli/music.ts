/**
 * `npm run videos:music -- [variant…] [--seconds N]` — generate each music
 * variant (all of them by default) and write a short AAC preview of each to
 * videos/out/music/<variant>.m4a (gitignored), for listening before picking
 * one (#2336). videos.yml uploads these with the PR's render.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseMusicArgs, type MusicArgs } from '../music/args'
import { getVariant, trackPath } from '../music/variants'
import { encodeClip, generateTrack, measureAudio } from '../render/music'
import { OUT_DIR, PUBLIC_DIR } from './paths'

export function music({ variants, seconds }: MusicArgs): void {
  for (const id of variants) {
    const variant = getVariant(id)
    const wav = join(PUBLIC_DIR, trackPath(id))
    generateTrack(id, wav)
    const clip = join(OUT_DIR, 'music', `${id}.m4a`)
    encodeClip(wav, clip, seconds)
    const full = measureAudio(wav)
    console.error(
      `Wrote ${clip} — ${variant.label}; full track ${full.durationSec.toFixed(1)} s, ` +
        `${full.integratedLufs} LUFS, true peak ${full.truePeakDb} dBTP`
    )
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    music(parseMusicArgs(process.argv.slice(2)))
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}
