import React from 'react'
import { Link } from 'react-router-dom'
import { sectionVideoId } from '../config/sectionVideos'

/** "Watch how (30s)": a link to the how-to video for a district section. */
export const WatchHowLink: React.FC<{ segment: string }> = ({ segment }) => {
  const id = sectionVideoId(segment)
  if (!id) return null
  return (
    <Link className="watch-how-link" to={`/videos#video-${id}`}>
      Watch how (30s)
    </Link>
  )
}

/** "How-to videos": a link to the videos page, shown on every district page
    and in the phone sheet. Same style as the Watch how link. */
export const HowToVideosLink: React.FC = () => (
  <Link className="watch-how-link" to="/videos">
    All how-to videos
  </Link>
)
