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
