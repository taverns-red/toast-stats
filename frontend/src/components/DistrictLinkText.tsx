import React from 'react'
import { hasDescriptiveName } from '../utils/districtName'

/** Link text whose accessible name always says "District" and contains the
 *  visible label (WCAG 2.5.3, #2648): "D93 (District 93)". */
export const DistrictLinkText: React.FC<{ id: string; name: string }> = ({
  id,
  name,
}) => {
  if (hasDescriptiveName(name)) {
    return /district/i.test(name) ? (
      <>{name}</>
    ) : (
      <>
        <span className="sr-only">District {id}, </span>
        {name}
      </>
    )
  }
  if (id === 'U') return <>Undistricted</>
  const n = /^\d+$/.test(id) ? Number(id) : id
  return (
    <>
      D{n} <span className="sr-only">(District {n})</span>
    </>
  )
}

export default DistrictLinkText
