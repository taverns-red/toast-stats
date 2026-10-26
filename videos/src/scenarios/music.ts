/**
 * Background track for every scenario, relative to `videos/public/`.
 *
 * The default is an original pad synthesized by ffmpeg at render time
 * (`src/render/music.ts`), so it carries no third-party licence. To use a
 * licensed track instead, drop the file in `videos/public/music/`, record its
 * licence in `videos/README.md`, and change this one line.
 */
export const DEFAULT_MUSIC = 'music/calm-pad.wav'
