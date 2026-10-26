import { describe, expect, it } from 'vitest'
import {
  checkProbe,
  RENDER_ENCODING,
  type ProbeOutput,
  type ProbeStream,
} from '../encoding'

/**
 * Real shape: `ffprobe -v error -show_entries stream=codec_type,codec_name,
 * pix_fmt,color_space,color_transfer,color_primaries,color_range -of json`
 * on the PR #2295 mobile render from run 40206560397, before colorSpace was
 * set. ffprobe omits a key it reads as unknown (no color_space here) and
 * reports the sRGB transfer Chromium's screenshots carry.
 */
const UNTAGGED_RENDER: ProbeOutput = {
  streams: [
    {
      codec_name: 'h264',
      codec_type: 'video',
      pix_fmt: 'yuv420p',
      color_range: 'tv',
      color_transfer: 'iec61966-2-1',
      color_primaries: 'bt709',
    },
    { codec_name: 'aac', codec_type: 'audio' },
  ],
}

const BT709_VIDEO: ProbeStream = {
  codec_name: 'h264',
  codec_type: 'video',
  pix_fmt: 'yuv420p',
  color_range: 'tv',
  color_space: 'bt709',
  color_transfer: 'bt709',
  color_primaries: 'bt709',
}
const AAC_AUDIO: ProbeStream = { codec_name: 'aac', codec_type: 'audio' }
const BT709_RENDER: ProbeOutput = { streams: [BT709_VIDEO, AAC_AUDIO] }

describe('render encoding (#2293)', () => {
  it('asks Remotion for h264, yuv420p, bt709 and AAC explicitly', () => {
    expect(RENDER_ENCODING).toMatchObject({
      codec: 'h264',
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      audioCodec: 'aac',
    })
  })
})

describe('checkProbe', () => {
  it('passes a bt709-tagged h264/yuv420p render with AAC audio', () => {
    expect(checkProbe(BT709_RENDER)).toEqual([])
  })

  it('fails the untagged render: no matrix and an sRGB transfer', () => {
    expect(checkProbe(UNTAGGED_RENDER)).toEqual([
      'video color_space is unknown, expected bt709',
      'video color_transfer is iec61966-2-1, expected bt709',
    ])
  })

  it('fails a render with another codec or pixel format', () => {
    expect(
      checkProbe({
        streams: [
          { ...BT709_VIDEO, codec_name: 'hevc', pix_fmt: 'yuv444p' },
          AAC_AUDIO,
        ],
      })
    ).toEqual([
      'video codec_name is hevc, expected h264',
      'video pix_fmt is yuv444p, expected yuv420p',
    ])
  })

  it('fails a render without an AAC audio stream', () => {
    expect(checkProbe({ streams: [BT709_VIDEO] })).toEqual([
      'no audio stream, expected aac',
    ])
    expect(
      checkProbe({
        streams: [BT709_VIDEO, { codec_type: 'audio', codec_name: 'opus' }],
      })
    ).toEqual(['audio codec_name is opus, expected aac'])
  })

  it('fails a file with no video stream', () => {
    expect(checkProbe({ streams: [] })).toEqual([
      'no video stream, expected h264',
      'no audio stream, expected aac',
    ])
  })
})
