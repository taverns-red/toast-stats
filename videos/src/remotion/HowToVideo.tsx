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
import { cropOffset, LAYOUTS, type Layout } from '../layout'
import { getScenario } from '../scenarios'
import type {
  Beat,
  CaptureManifest,
  CapturedBeat,
  FormFactor,
  TimedCard,
} from '../scenarios/types'
import { THEME } from '../theme'

// A type alias (not an interface) so it satisfies Remotion's
// Record<string, unknown> props constraint.
export type HowToVideoProps = {
  scenarioId: string
  format: FormFactor
  manifest: CaptureManifest | null
}

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
  scale,
}: {
  captured: CapturedBeat
  lengthSec: number
  scale: number
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
        left: x * scale - pad,
        top: y * scale - pad,
        width: width * scale + pad * 2,
        height: height * scale + pad * 2,
        borderRadius: 12,
        border: `${scale > 2 ? 6 : 4}px solid ${THEME.accent}`,
        // Spotlight: dim everything outside the box with ink at 30 %.
        boxShadow: `0 0 0 6000px rgba(15, 23, 32, ${0.3 * opacity})`,
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
  layout,
}: {
  text: string
  index: number
  total: number
  layout: Layout
}): ReactElement {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = interpolate(frame, [0, 0.35 * fps], [0, 1], {
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const { x, y, w, h, fontPx } = layout.caption
  const pill = Math.round(fontPx * 1.12)
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
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
          width: pill,
          height: pill,
          borderRadius: pill / 2,
          background: THEME.accent,
          color: THEME.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: THEME.fontDisplay,
          fontWeight: 800,
          fontSize: Math.round(pill * 0.53),
        }}
      >
        {index}
      </div>
      <div
        style={{
          color: THEME.ink,
          fontFamily: THEME.fontBody,
          fontWeight: 600,
          fontSize: fontPx,
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
  layout,
  fromOffset,
  toOffset,
}: {
  beat: Beat
  index: number
  total: number
  manifest: CaptureManifest | null
  layout: Layout
  /** Crop pan (CSS px) carried over from the previous beat. */
  fromOffset: number
  /** Crop pan (CSS px) that frames this beat's highlight. */
  toOffset: number
}): ReactElement {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const captured = manifest?.beats.find(b => b.id === beat.id)
  const lengthSec = beat.endSec - beat.startSec
  const { panel, scale } = layout
  // Pan while the beat's steps run, arriving as the highlight appears.
  const panEnd = Math.max(0.6, captured?.highlightAtSec ?? 0.6) * fps
  const offset = interpolate(frame, [0, panEnd], [fromOffset, toOffset], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const viewport = manifest?.viewport ?? { width: 1280, height: 800 }
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: panel.x,
          top: panel.y,
          width: panel.w,
          height: panel.h,
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid ${THEME.line}`,
          boxShadow: '0 12px 40px rgba(15, 23, 32, 0.12)',
          background: THEME.surface,
        }}
      >
        {manifest && captured ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: viewport.width * scale,
              height: viewport.height * scale,
              transform: `translateY(${-offset * scale}px)`,
            }}
          >
            <OffthreadVideo
              src={staticFile(manifest.video)}
              trimBefore={Math.round(captured.videoStartSec * fps)}
              muted
              style={{
                width: viewport.width * scale,
                height: viewport.height * scale,
              }}
            />
            <Highlight
              captured={captured}
              lengthSec={lengthSec}
              scale={scale}
            />
          </div>
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
      <Caption
        text={beat.caption}
        index={index}
        total={total}
        layout={layout}
      />
    </AbsoluteFill>
  )
}

function Card({
  card,
  eyebrow,
  fadeIn,
  fadeOut,
  layout,
}: {
  card: TimedCard
  eyebrow: string
  fadeIn: boolean
  fadeOut: boolean
  layout: Layout
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
  const { padX, titlePx, bodyPx, hintPx } = layout.card
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
        padding: `0 ${padX}px`,
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
            fontSize: rest ? Math.round(titlePx * 0.875) : titlePx,
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
              fontSize: bodyPx,
              lineHeight: 1.25,
            }}
          >
            {/* Let a URL wrap after its slashes rather than mid-word. */}
            {rest.replace(/\//g, '/​')}
          </div>
        ) : null}
        {card.hint ? (
          <div
            style={{
              marginTop: 28,
              display: 'inline-block',
              padding: '10px 28px',
              borderRadius: 999,
              border: `2px solid ${THEME.surface}`,
              fontFamily: THEME.fontBody,
              fontWeight: 500,
              fontSize: hintPx,
              lineHeight: 1.2,
            }}
          >
            {card.hint}
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
  format,
  manifest,
}: HowToVideoProps): ReactElement {
  useAppFonts()
  const scenario = getScenario(scenarioId)
  const layout = LAYOUTS[format]
  const { fps } = useVideoConfig()
  const f = (sec: number): number => Math.round(sec * fps)
  const { titleCard, closing, beats, durationSec } = scenario

  // One crop pan per beat; desktop's window shows the whole viewport, so its
  // offsets are all 0.
  const viewportH = manifest?.viewport.height ?? 800
  const windowH = layout.panel.h / layout.scale
  const offsets = beats.map(beat =>
    cropOffset(
      manifest?.beats.find(b => b.id === beat.id)?.box ?? null,
      viewportH,
      windowH
    )
  )

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
            layout={layout}
            fromOffset={offsets[i - 1] ?? offsets[0] ?? 0}
            toOffset={offsets[i] ?? 0}
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
          layout={layout}
        />
      </Sequence>
      <Sequence
        name="closing"
        from={f(closing.startSec - CROSSFADE_SEC)}
        durationInFrames={f(closing.endSec - closing.startSec + CROSSFADE_SEC)}
      >
        <Card
          card={closing}
          eyebrow="Try it"
          fadeIn
          fadeOut={false}
          layout={layout}
        />
      </Sequence>
      <Html5Audio
        src={staticFile(scenario.music)}
        volume={frame => fadeInOut(frame, fps, durationSec, 1.5, 2.5)}
      />
    </AbsoluteFill>
  )
}
