import React from 'react'
import { DISTRICT_SECTIONS } from '../config/districtSections'

/* The title block of a district section page that has no program-year or date
   controls of its own (What Changed, Council): the same markup and classes as
   DistrictDetailHeader's intro, so the section bar under it sits at the same
   height as on every other tab (#2646, HUB-07). The eyebrow names the
   section where the other tabs name the program year; the lede is the
   section's own `about`. */

interface DistrictSectionIntroProps {
  districtName: string
  /** The `DISTRICT_SECTIONS` segment this page is. */
  segment: string
}

export const DistrictSectionIntro: React.FC<DistrictSectionIntroProps> = ({
  districtName,
  segment,
}) => {
  const section = DISTRICT_SECTIONS.find(s => s.segment === segment)
  return (
    <div className="district-detail-page-header">
      <div className="district-detail-page-header__intro">
        <p className="district-detail-page-header__eyebrow">{section?.label}</p>
        <h1 className="district-detail-page-header__title">{districtName}</h1>
        {section && (
          <p
            className="district-detail-page-header__lede"
            data-testid="district-detail-lede"
          >
            {section.about}
          </p>
        )}
      </div>
    </div>
  )
}
