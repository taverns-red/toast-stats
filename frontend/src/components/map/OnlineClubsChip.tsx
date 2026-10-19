// #2174 red stub.
export interface OnlineClub {
  clubId: string
  clubName: string
  districtId?: string
}
export interface OnlineClubsChipProps {
  clubs: readonly OnlineClub[]
  districtId?: string
}
export default function OnlineClubsChip(_: OnlineClubsChipProps) {
  return null
}
