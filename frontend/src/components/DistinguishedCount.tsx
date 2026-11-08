import React from 'react'

/* STUB (red commit, #2554): replaced in the green commit. */
export const DistinguishedCount: React.FC<{
  confirmed: number
  provisional?: number | null | undefined
}> = ({ confirmed }) => <span>{confirmed.toLocaleString()}</span>
