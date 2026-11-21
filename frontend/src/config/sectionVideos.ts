/* Kept apart from content/howToVideos.ts so the district header does not
   pull every video's steps into its bundle. The key is the section segment
   after /district/:id ('' is the hub). howToVideos.sources.test.ts checks
   that this file does not import the catalogue and that every mapped page
   shows the link; howToVideos.test.ts checks each id and its pageUrl. */

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

/* Sections whose video does not open on that page, on purpose: v6 and v9
   both open on the district Overview and reach Grid and Rankings in a later
   beat. Every other section must map to a video whose catalogue page is that
   section. howToVideos.test.ts enforces both: unlisted sections match their
   page, and a listed video's scenario has a beat with that section's id. */
export const VIDEO_STARTS_ON_ANOTHER_PAGE: Readonly<Record<string, string>> = {
  grid: 'v6',
  rankings: 'v9',
}

/** The video id for a district section segment, or undefined if none. */
export function sectionVideoId(segment: string): string | undefined {
  return SECTION_VIDEO_IDS[segment] ?? VIDEO_STARTS_ON_ANOTHER_PAGE[segment]
}

/** Every section segment that has a video, for the consistency test. */
export const SECTION_VIDEO_SEGMENTS: readonly string[] = [
  ...Object.keys(SECTION_VIDEO_IDS),
  ...Object.keys(VIDEO_STARTS_ON_ANOTHER_PAGE),
]
