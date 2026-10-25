import { useEffect, useState, type ReactElement } from 'react'
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  Html5Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { getScenario } from '../scenarios'
import type {
  Beat,
  CaptureManifest,
  CapturedBeat,
  TimedCard,
} from '../scenarios/types'
import { THEME } from '../theme'

// A type alias (not an interface) so it satisfies Remotion's
// Record<string, unknown> props constraint.
export type HowToVideoProps = {
  scenarioId: string
  manifest: CaptureManifest | null
}

// 1920×1080 layout: the 1280×800 capture is shown at 1.05× in a panel, with a
// caption band under it. Captions are 64 px semibold Inter (6 % of the frame
// height) — about 13 pt when the 1080p frame plays full-width on a phone held
// upright, above the ~12 pt floor for comfortable reading. Two lines fit.
const PANEL_SCALE = 1.05
const PANEL_W = 1280 * PANEL_SCALE
const PANEL_H = 800 * PANEL_SCALE
const PANEL_X = (1920 - PANEL_W) / 2
const PANEL_Y = 24
const CAPTION_TOP = PANEL_Y + PANEL_H
const CAPTION_FONT_PX = 64
const CROSSFADE_SEC = 0.4

const ease = Easing.bezier(0.25, 0.1, 0.25, 1)

function useAppFonts(): void {
  const [handle] = useState(() => delayRender('Loading app fonts'))
  useEffect(() => {
    const faces = [
      new FontFace('Inter', `url(${staticFile('fonts/inter-latin.woff2')})`, {
        weight: '400 600',
      }),
      new FontFace(
        'Montserrat',
        `url(${staticFile('fonts/montserrat-latin.woff2')})`,
        { weight: '500 900' }
      ),
    ]
    Promise.all(faces.map(f => f.load()))
      .then(loaded => {
        for (const face of loaded) document.fonts.add(face)
        continueRender(handle)
      })
      .catch((err: unknown) => {
        console.error('Font load failed', err)
        continueRender(handle)
      })
  }, [handle])
}

/** Fade in over the first `inSec`, out over the last `outSec` of `lengthSec`. */
function fadeInOut(
  frame: number,
  fps: number,
  lengthSec: number,
  inSec: number,
  outSec: number
): number {
  const end = lengthSec * fps
  return interpolate(
    frame,
    [0, inSec * fps, end - outSec * fps, end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
}

function Highlight({
  captured,
  lengthSec,
}: {
  captured: CapturedBeat
  lengthSec: number
}): ReactElement | null {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!captured.box) return null
  const start = captured.highlightAtSec * fps
  const appear = interpolate(frame, [start, start + 0.35 * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const leave = interpolate(
    frame,
    [(lengthSec - 0.35) * fps, lengthSec * fps],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
  const opacity = Math.min(appear, leave)
  const pad = 8
  const { x, y, width, height } = captured.box
  return (
    <div
      style={{
        position: 'absolute',
        left: x * PANEL_SCALE - pad,
        top: y * PANEL_SCALE - pad,
        width: width * PANEL_SCALE + pad * 2,
        height: height * PANEL_SCALE + pad * 2,
        borderRadius: 12,
        border: `4px solid ${THEME.accent}`,
        // Spotlight: dim everything outside the box with ink at 30 %.
        boxShadow: `0 0 0 4000px rgba(15, 23, 32, ${0.3 * opacity})`,
        opacity,
        transform: `scale(${interpolate(appear, [0, 1], [1.03, 1])})`,
      }}
    />
  )
}

function Caption({
  text,
  index,
  total,
}: {
  text: string
  index: number
  total: number
}): ReactElement {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = interpolate(frame, [0, 0.35 * fps], [0, 1], {
    extrapolateRight: 'clamp',
    easing: ease,
  })
  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL_X,
        top: CAPTION_TOP,
        width: PANEL_W,
        height: 1080 - CAPTION_TOP,
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px)`,
      }}
    >
      <div
        aria-label={`Step ${index} of ${total}`}
        style={{
          flex: '0 0 auto',
          width: 72,
          height: 72,
          borderRadius: 36,
          background: THEME.accent,
          color: THEME.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: THEME.fontDisplay,
          fontWeight: 800,
          fontSize: 38,
        }}
      >
        {index}
      </div>
      <div
        style={{
          color: THEME.ink,
          fontFamily: THEME.fontBody,
          fontWeight: 600,
          fontSize: CAPTION_FONT_PX,
          lineHeight: 1.18,
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </div>
    </div>
  )
}

function BeatScene({
  beat,
  index,
  total,
  manifest,
}: {
  beat: Beat
  index: number
  total: number
  manifest: CaptureManifest | null
}): ReactElement {
  const { fps } = useVideoConfig()
  const captured = manifest?.beats.find(b => b.id === beat.id)
  const lengthSec = beat.endSec - beat.startSec
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: PANEL_X,
          top: PANEL_Y,
          width: PANEL_W,
          height: PANEL_H,
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid ${THEME.line}`,
          boxShadow: '0 12px 40px rgba(15, 23, 32, 0.12)',
          background: THEME.surface,
        }}
      >
        {manifest && captured ? (
          <>
            <OffthreadVideo
              src={staticFile(manifest.video)}
              trimBefore={Math.round(captured.videoStartSec * fps)}
              muted
              style={{ width: PANEL_W, height: PANEL_H }}
            />
            <Highlight captured={captured} lengthSec={lengthSec} />
          </>
        ) : (
          <AbsoluteFill
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              color: THEME.ink3,
              fontSize: 40,
            }}
          >
            No capture yet — run npm run videos:capture
          </AbsoluteFill>
        )}
      </div>
      <Caption text={beat.caption} index={index} total={total} />
    </AbsoluteFill>
  )
}

function Card({
  card,
  eyebrow,
  fadeIn,
  fadeOut,
}: {
  card: TimedCard
  eyebrow: string
  fadeIn: boolean
  fadeOut: boolean
}): ReactElement {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const lengthSec = card.endSec - card.startSec + CROSSFADE_SEC
  const opacity = fadeInOut(
    frame,
    fps,
    lengthSec,
    fadeIn ? CROSSFADE_SEC : 0.001,
    fadeOut ? CROSSFADE_SEC : 0.001
  )
  const rise = interpolate(frame, [0, 0.6 * fps], [24, 0], {
    extrapolateRight: 'clamp',
    easing: ease,
  })
  // "Lead: rest" captions (e.g. the closing URL) set the rest on its own line.
  const split = card.caption.indexOf(': ')
  const lead = split > 0 ? card.caption.slice(0, split + 1) : card.caption
  const rest = split > 0 ? card.caption.slice(split + 2) : null
  return (
    <AbsoluteFill
      style={{
        background: THEME.accent,
        color: THEME.surface,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 160px',
        opacity,
      }}
    >
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div
          style={{
            fontFamily: THEME.fontBody,
            fontWeight: 600,
            fontSize: 36,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.85,
            marginBottom: 36,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: THEME.fontDisplay,
            fontWeight: 800,
            fontSize: rest ? 84 : 96,
            lineHeight: 1.12,
            letterSpacing: '-0.01em',
          }}
        >
          {lead}
        </div>
        {rest ? (
          <div
            style={{
              marginTop: 32,
              fontFamily: THEME.fontBody,
              fontWeight: 600,
              fontSize: 54,
              lineHeight: 1.2,
              overflowWrap: 'anywhere',
            }}
          >
            {rest}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 64,
          fontFamily: THEME.fontBody,
          fontWeight: 500,
          fontSize: 32,
          opacity: 0.85,
        }}
      >
        Toast Stats · ts.taverns.red
      </div>
    </AbsoluteFill>
  )
}

export function HowToVideo({
  scenarioId,
  manifest,
}: HowToVideoProps): ReactElement {
  useAppFonts()
  const scenario = getScenario(scenarioId)
  const { fps } = useVideoConfig()
  const f = (sec: number): number => Math.round(sec * fps)
  const { titleCard, closing, beats, durationSec } = scenario
  return (
    <AbsoluteFill
      style={{ background: THEME.surface2, fontFamily: THEME.fontBody }}
    >
      {beats.map((beat, i) => (
        <Sequence
          key={beat.id}
          name={beat.id}
          from={f(beat.startSec)}
          durationInFrames={f(beat.endSec - beat.startSec)}
        >
          <BeatScene
            beat={beat}
            index={i + 1}
            total={beats.length}
            manifest={manifest}
          />
        </Sequence>
      ))}
      {/* Cards overlap the neighbouring beat by CROSSFADE_SEC and fade over it. */}
      <Sequence
        name="title"
        from={0}
        durationInFrames={f(titleCard.endSec + CROSSFADE_SEC)}
      >
        <Card
          card={titleCard}
          eyebrow={`For ${scenario.role}s`}
          fadeIn={false}
          fadeOut
        />
      </Sequence>
      <Sequence
        name="closing"
        from={f(closing.startSec - CROSSFADE_SEC)}
        durationInFrames={f(closing.endSec - closing.startSec + CROSSFADE_SEC)}
      >
        <Card card={closing} eyebrow="Try it" fadeIn fadeOut={false} />
      </Sequence>
      <Html5Audio
        src={staticFile(scenario.music)}
        volume={frame => fadeInOut(frame, fps, durationSec, 1.5, 2.5)}
      />
    </AbsoluteFill>
  )
}
