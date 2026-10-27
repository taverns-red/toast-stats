import { DEFAULT_VARIANT_ID, trackPath } from '../music/variants'

/**
 * Background track for every scenario, relative to `videos/public/`.
 *
 * The default is an original, upbeat track synthesised at render time from
 * a score (`src/music/`, #2336), so it carries no third-party licence. A
 * scenario can pick another variant with `trackPath('<variant>')`, and a
 * render can override it with `--music <variant>`. To use a licensed track
 * instead, drop the file in `videos/public/music/`, record its licence in
 * `videos/README.md`, and point the scenario's `music` at it.
 */
export const DEFAULT_MUSIC = trackPath(DEFAULT_VARIANT_ID)
