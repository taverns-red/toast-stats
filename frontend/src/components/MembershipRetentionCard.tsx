/**
 * MembershipRetentionCard (#1614): stub, built in the next commit.
 */
import React from 'react'
import type { MembershipRetentionAward } from '../services/cdn'

export interface MembershipRetentionCardProps {
  award: MembershipRetentionAward
}

export const MembershipRetentionCard: React.FC<
  MembershipRetentionCardProps
> = () => null

export default MembershipRetentionCard
