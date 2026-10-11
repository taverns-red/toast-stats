/**
 * #1783 — the club hero's "where it meets" line (stub; implemented next).
 */
export interface ClubMeetingInfo {
  schedule: string | null
  mode: string | null
  place: string | null
  websiteUrl: string | null
  contactUrl: string | null
}

export interface ClubMeetingSource {
  clubId: string
  address?: {
    street?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
  email?: string
  phone?: string
  website?: string
  meetingDay?: string
  meetingTime?: string
  allowsVirtualAttendance?: boolean
  coordinates?: { lat: number; lng: number }
}

export function toastmastersClubPageUrl(_clubId: string): string | null {
  return null
}

export function buildClubMeetingInfo(
  _club: ClubMeetingSource
): ClubMeetingInfo | null {
  return null
}
