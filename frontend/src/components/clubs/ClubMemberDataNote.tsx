import React from 'react'
import { Link } from 'react-router-dom'

/* Club page footer note (#2302). Officers come to the club page looking for
   member retention, names or Pathways progress; none of that is published
   here by design. One line pointing to the Methodology section that says
   why, and where TI keeps it. */
const ClubMemberDataNote: React.FC = () => (
  <p className="club-member-data-note">
    Looking for individual members?{' '}
    <Link to="/methodology#member-data" className="club-member-data-note__link">
      Why member-level data isn&apos;t here
    </Link>
  </p>
)

export default ClubMemberDataNote
