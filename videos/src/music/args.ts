import { getVariant, MUSIC_VARIANTS, TRACK_SEC } from './variants'

export interface MusicArgs {
  /** Variant ids, in the order given; every variant when none is named. */
  variants: string[]
  /** Length of each preview clip. */
  seconds: number
}

const DEFAULT_SECONDS = 20
const MIN_SECONDS = 5

function toSeconds(raw: string): number {
  const n = Number(raw)
  if (
    raw.trim() === '' ||
    !Number.isFinite(n) ||
    n < MIN_SECONDS ||
    n > TRACK_SEC
  ) {
    throw new Error(
      `--seconds must be a number from ${MIN_SECONDS} to ${TRACK_SEC}, got "${raw}"`
    )
  }
  return n
}

/**
 * Arguments after `npm run videos:music --`: optional variant ids and
 * `--seconds N` (preview clip length).
 */
export function parseMusicArgs(args: readonly string[]): MusicArgs {
  const variants: string[] = []
  let seconds = DEFAULT_SECONDS
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--seconds') {
      seconds = toSeconds(args[++i] ?? '')
    } else if (arg.startsWith('--seconds=')) {
      seconds = toSeconds(arg.slice('--seconds='.length))
    } else {
      variants.push(getVariant(arg).id)
    }
  }
  return {
    variants: variants.length > 0 ? variants : MUSIC_VARIANTS.map(v => v.id),
    seconds,
  }
}
