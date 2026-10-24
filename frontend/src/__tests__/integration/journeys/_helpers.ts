import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/* Open a district from the landing (#2249): the rankings row is the
   navigation the journeys exercise. The district-only hero suggestions
   this used to click were retired with the omni-search hero (whose
   results need the club index, which the journeys do not mock); the row
   link/cell is what a leader clicks after narrowing the table. */
export async function clickDistrictRow(
  user: UserEvent,
  districtId: string
): Promise<void> {
  const chip = await screen.findByTestId(`district-number-chip-D${districtId}`)
  await user.click(chip)
}
