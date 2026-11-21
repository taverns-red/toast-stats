import React from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsMobile } from '../hooks/useIsMobile'
import { useScrollToHashWhenReady } from '../hooks/useScrollToHashWhenReady'
import {
  HOW_TO_VIDEOS,
  groupByPrimaryRole,
  roleAnchorId,
  type HowToVideo,
  type VideoCut,
} from '../content/howToVideos'

/* How-to videos page (#2310). Lists every published video from the typed
   catalogue in content/howToVideos.ts, grouped by the role it is for.

   Cost and layout budgets:
   - Native <video controls preload="none">: nothing is fetched until the
     viewer presses play, and nothing autoplays.
   - The poster is an inline SVG (the title on the legacy loyal blue), so it
     costs no request. The CSP's img-src already allows data: URIs.
   - Each frame has a fixed aspect ratio (16:9 desktop, 9:16 phone), so the
     page cannot shift when a video loads. No data fetch either.
   - The cut follows the viewport (useIsMobile, <768px): the phone render on
     a phone, the desktop render elsewhere. Both files are linked under each
     video for anyone who wants the other cut or a download. */

const POSTER_BG = '#004165' // --tm-loyal-blue (light); a fixed image, both themes
const POSTER_INK = '#ffffff'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Greedy word wrap; SVG text does not wrap by itself. */
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** A request-free poster: the title card, drawn as an SVG data URI. */
function posterFor(title: string, cut: VideoCut): string {
  const [w, h, size, maxChars] =
    cut === 'mobile' ? [1080, 1920, 84, 18] : [1920, 1080, 88, 30]
  const lines = wrap(title, maxChars)
  const lineH = size * 1.2
  const top = h / 2 - ((lines.length - 1) * lineH) / 2
  const tspans = lines
    .map(
      (l, i) =>
        `<text x="${w / 2}" y="${top + i * lineH}" font-size="${size}">${escapeXml(l)}</text>`
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${POSTER_BG}"/>` +
    `<g fill="${POSTER_INK}" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle">${tspans}</g>` +
    `<text x="${w / 2}" y="${size * 1.5}" fill="${POSTER_INK}" fill-opacity="0.8" font-family="Inter, Arial, sans-serif" font-size="${size * 0.5}" text-anchor="middle">Toast Stats how-to</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const VideoCard: React.FC<{ video: HowToVideo; cut: VideoCut }> = ({
  video,
  cut,
}) => {
  const src = cut === 'mobile' ? video.mobileUrl : video.desktopUrl
  const headingId = `video-${video.id}-title`
  return (
    <article
      id={`video-${video.id}`}
      className="videos-page__card"
      data-testid={`video-${video.id}`}
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="videos-page__title">
        {video.title}
      </h3>
      <p className="videos-page__desc">{video.description}</p>
      <p className="videos-page__roles">
        <span className="videos-page__label">For: </span>
        {video.roles.join(' · ')}
      </p>
      <div className={`videos-page__frame videos-page__frame--${cut}`}>
        <video
          className="videos-page__video"
          src={src}
          controls
          preload="none"
          playsInline
          poster={posterFor(video.title, cut)}
          width={cut === 'mobile' ? 1080 : 1920}
          height={cut === 'mobile' ? 1920 : 1080}
          aria-label={`${video.title} (${cut === 'mobile' ? 'phone' : 'desktop'} video)`}
        />
      </div>
      {/* The videos have no narration or caption track, so this list is
          their text alternative (#2658, WCAG 1.2.1). */}
      <details className="videos-page__steps">
        <summary>Steps shown</summary>
        <ol>
          {video.steps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <p className="videos-page__links">
        {/* #2657 REF-41: the visible text repeats on every card, so the
            accessible name adds the video's title (label first, WCAG 2.5.3). */}
        <Link
          className="videos-page__link"
          to={video.pageUrl}
          aria-label={`Open this page: ${video.title}`}
        >
          Open this page
        </Link>
        <a
          className="videos-page__link"
          href={video.desktopUrl}
          aria-label={`Desktop MP4: ${video.title}`}
        >
          Desktop MP4
        </a>
        <a
          className="videos-page__link"
          href={video.mobileUrl}
          aria-label={`Phone MP4: ${video.title}`}
        >
          Phone MP4
        </a>
      </p>
    </article>
  )
}

const VideosPage: React.FC = () => {
  useDocumentTitle('How-to videos')
  // The page is static, so a #video-… link from a district page can scroll at once.
  useScrollToHashWhenReady(true)
  const cut: VideoCut = useIsMobile() ? 'mobile' : 'desktop'
  const groups = groupByPrimaryRole(HOW_TO_VIDEOS)

  return (
    <div className="methodology-page videos-page">
      <header className="methodology-page__header">
        <p className="placeholder-page__eyebrow">Help · Videos</p>
        <h1 className="placeholder-page__title">How-to videos</h1>
        <p className="long-text-lede" data-testid="videos-lede">
          Short walkthroughs of one job each, about 30 seconds long. They have
          no narration: the captions on screen carry the message. Grouped by the
          role each one is for.
        </p>
        {/* Nine role groups make a long page; these links skip to one. */}
        <nav aria-label="Jump to a role" className="videos-page__jump">
          <ul>
            {groups.map(group => (
              <li key={group.role}>
                <a
                  className="videos-page__link"
                  href={`#${roleAnchorId(group.role)}`}
                >
                  {group.role}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {groups.map(group => {
        const id = roleAnchorId(group.role)
        return (
          <section
            key={group.role}
            className="methodology-section videos-page__group"
            aria-labelledby={id}
          >
            <h2 id={id} className="methodology-section__title">
              {group.role}
            </h2>
            <ul className="videos-page__list">
              {group.videos.map(v => (
                <li key={v.id}>
                  <VideoCard video={v} cut={cut} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default VideosPage
