/* Which how-to video explains which district page (#2658). Kept apart from
   content/howToVideos.ts so the district header does not pull the whole
   catalogue (every video's steps) into its bundle; a test keeps the two in
   step. The key is the section segment after /district/:id ('' is the hub). */

const SECTION_VIDEO_IDS: Readonly<Record<string, string>> = {
  '': 'v1',
  'action-list': 'v2',
  clubs: 'v3',
  growth: 'v5',
  divisions: 'v6',
  education: 'v7',
  changes: 'v8',
  trends: 'v9',
  map: 'v10',
  meetings: 'v11',
}

/** The video id for a district section segment, or undefined if none. */
export function sectionVideoId(segment: string): string | undefined {
  return SECTION_VIDEO_IDS[segment]
}

/** Every section segment that has a video, for the consistency test. */
export const SECTION_VIDEO_SEGMENTS: readonly string[] =
  Object.keys(SECTION_VIDEO_IDS)
