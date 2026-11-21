/**
 * Published how-to videos (#2310) — the one file that adding a video touches.
 *
 * The site is a static SPA, so the list is hard-coded here rather than read
 * from the CDN. An entry belongs here only once the publish workflow
 * (`.github/workflows/videos-publish.yml`) has written both cuts and they
 * answer 200/206 from the CDN. Check with `npm run videos:check-urls`.
 *
 * Titles and roles come from the scenario files (`videos/src/scenarios/*.ts`)
 * and the storyboard (`.routine-tmp/video-scenarios-2026-10-25.md` §4). The
 * description is the video's title-card caption.
 *
 * Versions are immutable: a re-render is published under a new version
 * (`2026-10-26.2`), and this file moves to it.
 */

export const VIDEO_CDN_BASE = 'https://cdn.taverns.red/videos'

/** The two renders of every scenario: 16:9 desktop and 9:16 phone. */
export type VideoCut = 'desktop' | 'mobile'

export interface HowToVideo {
  /** Scenario id, as in `videos/src/scenarios/index.ts` (`v2`). */
  id: string
  title: string
  /** Who it is for. The first role is the one the page groups it under. */
  roles: readonly string[]
  /** One line. */
  description: string
  /** The page the video shows, as a site path (the closing card's address). */
  pageUrl: string
  /**
   * The captions burned into the video, one per step, in order. The videos
   * have no narration or caption track, so this is their text alternative
   * (WCAG 1.2.1). They must equal the scenario's beat captions;
   * howToVideos.sources.test.ts checks it.
   */
  steps: readonly string[]
  /** Published version: the path segment under `videos/<id>/`. */
  version: string
  desktopUrl: string
  mobileUrl: string
}

/** The CDN path the publish workflow writes for one cut. */
export function videoUrl(id: string, version: string, cut: VideoCut): string {
  return `${VIDEO_CDN_BASE}/${id}/${version}/${id}-${cut}.mp4`
}

function video(
  id: string,
  version: string,
  fields: Pick<
    HowToVideo,
    'title' | 'roles' | 'description' | 'pageUrl' | 'steps'
  >
): HowToVideo {
  return {
    id,
    version,
    ...fields,
    desktopUrl: videoUrl(id, version, 'desktop'),
    mobileUrl: videoUrl(id, version, 'mobile'),
  }
}

/** In storyboard rank order. */
export const HOW_TO_VIDEOS: readonly HowToVideo[] = [
  video('v1', '2026-10-27', {
    title: 'How far from Distinguished District?',
    roles: ['District Director'],
    description: "Your district's gap to Distinguished, on one page.",
    pageUrl: '/district/86',
    steps: [
      "Type a district number. That's the whole login.",
      'Every metric with its world rank and the Distinguished bar.',
      'Prerequisites checked. The exact gap, in clubs and payments.',
      "Charter milestones tracked against TI's two checkpoint dates.",
      'Your world rank at every snapshot this program year.',
    ],
  }),
  video('v2', '2026-10-26.2', {
    title: 'What should I do this week?',
    roles: ['Area Director'],
    description: "Your area's to-do list, built from the data.",
    pageUrl: '/district/86/action-list',
    steps: [
      'Four lists. Close to Distinguished, visits due, intervention, no CSP.',
      'Filter to your area. The link remembers it.',
      'Each club: how many members and goals it still needs.',
      'Round 1 visits still unreported, before the November deadline.',
      'Export it. Paste it into your Area Council agenda.',
    ],
  }),
  video('v3', '2026-10-27', {
    title: 'One nudge from Distinguished',
    roles: ['Program Quality Director', 'Area Director', 'Club President'],
    description: 'Find the clubs one nudge from Distinguished.',
    pageUrl: '/district/86/clubs?preset=close-to-distinguished',
    steps: [
      'From your district page, open Clubs.',
      'Every club: health, members, renewals and DCP goals.',
      'One tap lists the clubs within reach of Distinguished.',
      'Open a club: members, goals met and CSP at a glance.',
      'The gap to each tier, counted in goals.',
      'Which goal, and exactly what it takes.',
    ],
  }),
  video('v4', '2026-10-27', {
    title: "Your club's page",
    roles: ['Club officers'],
    description: 'Everything TI publishes about your club, on one page.',
    pageUrl: '/club/2728',
    steps: [
      'Search by club name or number.',
      "Members, renewals, DCP goals and CSP, from TI's latest dashboard.",
      "This year's membership against every prior year.",
      'Officer list, dues, CSP, visits: each with its date.',
      'Where your club stands among every club worldwide.',
      'Every program year on record, on one screen.',
    ],
  }),
  video('v5', '2026-10-27', {
    title: 'The club growth funnel',
    roles: ['Club Growth Director'],
    description: 'Prospective → chartered → coached → suspended. One page.',
    pageUrl: '/district/114/growth',
    steps: [
      'From your district page, open Growth.',
      "Your pipeline this program year, from TI's daily reports.",
      'Who has waited longest, and who has paid.',
      'Every charter dated; sponsors and mentors counted, never named.',
      'Coached clubs and how long the coach has been in.',
      'Of the clubs you charter, how many survive five years?',
    ],
  }),
  video('v8', '2026-10-27', {
    title: 'What changed since the last meeting?',
    roles: ['District Director', 'Administration Manager', 'Area Director'],
    description: 'What changed since the last DEC, in one feed.',
    pageUrl: '/district/86/changes',
    steps: [
      'From your district page, open What Changed.',
      'Compare any two snapshots. Pick a range.',
      'A month of October renewals, summarised.',
      'Status drops and CSP submissions, club by club.',
      'Area movement and payments by type: October, April, new, late.',
      'Export the feed. Attach it to the minutes.',
    ],
  }),
  video('v12', '2026-10-27', {
    title: 'The world and the region',
    roles: [
      'Region Advisor',
      'International Directors and Officers',
      'World Headquarters',
    ],
    description: 'Every district, every region, one scoreboard.',
    pageUrl: '/regions',
    steps: [
      'The world this program year, at a glance.',
      'Fourteen regions ranked, with membership sparklines.',
      "Your region's districts, ranked metric by metric.",
      'Health and compliance per district: CSP, dues, officer lists.',
      'Growth funnel by district; every club on one map.',
    ],
  }),
  video('v6', '2026-10-27', {
    title: 'Division and area recognition',
    roles: ['Division Director', 'Area Director'],
    description: 'Distinguished Area and Division, tracked club by club.',
    pageUrl: '/district/86/divisions',
    steps: [
      'From your district page, open Grid.',
      'The whole district on one screen, by division and area.',
      'Colour by health or by tier. Print it for Division Council.',
      'Every division and area against the Distinguished Area Program.',
      'Plain language: what the division must do to qualify.',
      "An area's status, its next tier, and the Round 2 deadline.",
    ],
  }),
  video('v15', '2026-10-27', {
    title: "Who hasn't filed?",
    roles: [
      'Program Quality Director',
      'Area Director',
      'Club President',
      'Club Secretary',
    ],
    description: 'CSP, dues, officer lists: who is missing, by when.',
    pageUrl: '/district/60/action-list',
    steps: [
      'Your district page counts the missing Club Success Plans.',
      'See which clubs, each with its own due date.',
      'On the map: who still needs the call.',
      "A club's compliance checklist, dated from TI's reports.",
      'The same checks rolled up, region by region.',
    ],
  }),
  video('v7', '2026-10-27', {
    title: 'Education awards, this year to date',
    roles: ['Program Quality Director'],
    description: 'Who is earning what: by level, path and area.',
    pageUrl: '/district/86/education',
    steps: [
      'From your district page, open Education.',
      'Every ledger award this program year, counted once.',
      'Levels 1–5 and DTMs, so far this year.',
      'Which paths your members actually choose.',
      'Awards by division and area: who needs an education push.',
      'Leaderboards for the newsletter and the DEC.',
    ],
  }),
  video('v14', '2026-10-27', {
    title: 'Clubs that need intervention',
    roles: ['Club Growth Director', 'Division Director', 'Club coaches'],
    description: 'Find the clubs that need help, and who is coaching.',
    pageUrl: '/district/86/clubs?status=intervention',
    steps: [
      'From your district page, open Clubs.',
      'Filter to clubs that need intervention, each with its trend.',
      'Sort by trend to see who is falling fastest.',
      'On the map, red badges flag where those clubs cluster.',
      'Colour by club coach: coverage at a glance, never names.',
    ],
  }),
  video('v10', '2026-10-27', {
    title: 'Realign without a spreadsheet',
    roles: ['District Director', 'Alignment Committee'],
    description: 'Try a new area layout. Nothing is saved.',
    pageUrl: '/district/86/map?sandbox=1',
    steps: [
      'From your district page, open Map.',
      'Colour by division or area to see the boundaries.',
      'Open the realignment sandbox to move clubs between areas.',
      "Move a club and watch each area's balance update.",
      'The plan lives in the link. Share it with the committee.',
    ],
  }),
  video('v9', '2026-10-27', {
    title: 'Trends and rank, year over year',
    roles: [
      'District Director',
      'Club Growth Director',
      'Immediate Past District Director',
    ],
    description: 'This year against the years before it.',
    pageUrl: '/district/86/trends',
    steps: [
      'From your district page, open Trends.',
      'Membership by snapshot, July to June, against prior years.',
      'Payments to date versus the base and last year.',
      'Three measures, against the same date last year.',
      'Rankings: every year of rank, the climbs and the falls.',
      'Where the dues came from: new, April, October, late.',
    ],
  }),
  video('v13', '2026-10-27', {
    title: 'Stories worth telling',
    roles: ['District PR Manager', 'VP Public Relations'],
    description: 'Good news, with the receipts.',
    pageUrl: '/district/86',
    steps: [
      'Your district page lists club anniversaries coming up.',
      'Clubs reaching a milestone year this program year.',
      'Clubs: the first in the world to reach each tier.',
      "The whole race, with your district's clubs in it.",
      'Open a club: its worldwide standing, ready to quote.',
      'District award standings, from the same public data.',
    ],
  }),
  video('v11', '2026-10-27', {
    title: 'When do clubs meet?',
    roles: [
      'Club Growth Director',
      'VP Membership',
      'Program Quality Director',
    ],
    description: 'Which evenings have no club? Which have too many?',
    pageUrl: '/district/86/meetings',
    steps: [
      'From your district page, open Meetings.',
      "A heatmap of every club's meeting day and start hour.",
      'Online only: clubs that meet online or hybrid.',
      'Pick a cell: who meets then. Never a meeting link.',
      'Show on the map: where those clubs are.',
      'The same view for a region, or the whole world.',
    ],
  }),
  video('v16', '2026-10-27', {
    title: 'Everything is a link',
    roles: ['Webmaster', 'Administration Manager', 'World Headquarters'],
    description: 'No login. Every view is a link you can share.',
    pageUrl: '/district/86/clubs',
    steps: [
      'From your district page, open Clubs.',
      'Pin any snapshot date, reproducible for the minutes.',
      'Add a filter. The link carries it too.',
      'Copy link: paste it in the minutes or the newsletter.',
      'History: year-end standings, frozen when each year closes.',
      'When TI changes a rule, the site says what compares.',
      'Ask an AI assistant the same numbers, with sources.',
    ],
  }),
]

export interface RoleGroup {
  role: string
  videos: readonly HowToVideo[]
}

const DISTRICT_PATH = /^\/district\/(\d+)(?=\/|\?|$)/

/** The example district a video's page URL names, or undefined (club, world). */
export function exampleDistrictId(pageUrl: string): string | undefined {
  return DISTRICT_PATH.exec(pageUrl)?.[1]
}

/** The page URL with the viewer's district in place of the example district. */
export function pageUrlForDistrict(
  pageUrl: string,
  districtId: string | null
): string {
  if (!districtId || exampleDistrictId(pageUrl) === undefined) return pageUrl
  return pageUrl.replace(DISTRICT_PATH, `/district/${districtId}`)
}

/** The anchor id of a role group's heading, which the jump links target. */
export function roleAnchorId(role: string): string {
  return `role-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/** Group by each video's first role, in first-seen order. */
export function groupByPrimaryRole(videos: readonly HowToVideo[]): RoleGroup[] {
  const groups = new Map<string, HowToVideo[]>()
  for (const v of videos) {
    const role = v.roles[0]
    if (role === undefined) continue
    const list = groups.get(role)
    if (list) list.push(v)
    else groups.set(role, [v])
  }
  return [...groups].map(([role, list]) => ({ role, videos: list }))
}
