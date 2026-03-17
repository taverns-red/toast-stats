import React from 'react'
import { ClubTrend } from '../hooks/useDistrictAnalytics'
import { useClubTrends } from '../hooks/useClubTrends'
import { formatDisplayDate } from '../utils/dateFormatting'
import { getClubStatusBadge } from '../utils/clubStatusBadge'
import {
  getProgramYearForDate,
  calculateProgramYearDay,
  type ProgramYear,
} from '../utils/programYear'

interface ClubDetailModalProps {
  club: ClubTrend | null
  districtId?: string
  programYear?: ProgramYear
  onClose: () => void
}

export const ClubDetailModal: React.FC<ClubDetailModalProps> = ({
  club,
  districtId,
  programYear: programYearProp,
  onClose,
}) => {
  // Fetch dense per-club trend data from the club-trends-index (#79b)
  const { data: denseClubData } = useClubTrends(
    districtId ?? null,
    club?.clubId ?? null,
    !!districtId && !!club
  )

  if (!club) return null

  // Use dense trend data if available, otherwise fall back to sparse data
  const membershipTrend =
    denseClubData?.membershipTrend &&
    denseClubData.membershipTrend.length > club.membershipTrend.length
      ? denseClubData.membershipTrend
      : club.membershipTrend

  const dcpGoalsTrend =
    denseClubData?.dcpGoalsTrend &&
    denseClubData.dcpGoalsTrend.length > club.dcpGoalsTrend.length
      ? denseClubData.dcpGoalsTrend
      : club.dcpGoalsTrend

  // Use the prop if provided, otherwise infer from the data (#119)
  const programYear =
    programYearProp ??
    getProgramYearForDate(
      membershipTrend[0]?.date ?? new Date().toISOString().slice(0, 10)
    )

  // Filter trend data to only include points within the selected program year (#119)
  const filteredMembershipTrend = membershipTrend.filter(
    p => p.date >= programYear.startDate && p.date <= programYear.endDate
  )
  const filteredDcpGoalsTrend = dcpGoalsTrend.filter(
    p => p.date >= programYear.startDate && p.date <= programYear.endDate
  )

  // Get status badge styling
  const getStatusBadge = (
    status: 'thriving' | 'vulnerable' | 'intervention-required'
  ) => {
    switch (status) {
      case 'intervention-required':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'vulnerable':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-green-100 text-green-800 border-green-300'
    }
  }

  // Get base membership from snapshot data (Toastmasters 'Mem. Base' column)
  // Falls back to first trend point for backward compatibility with older data
  const baseMembership =
    club.membershipBase ??
    (filteredMembershipTrend.length > 0
      ? (filteredMembershipTrend[0]?.count ?? 0)
      : 0)

  // Get latest membership (from filtered data)
  const latestMembership =
    filteredMembershipTrend.length > 0
      ? (filteredMembershipTrend[filteredMembershipTrend.length - 1]?.count ??
        0)
      : 0

  // Get membership change (from filtered data)
  const membershipChange =
    filteredMembershipTrend.length > 1
      ? (filteredMembershipTrend[filteredMembershipTrend.length - 1]?.count ??
          0) - (filteredMembershipTrend[0]?.count ?? 0)
      : 0

  // Get latest DCP goals (from filtered data)
  const latestDcpGoals =
    filteredDcpGoalsTrend.length > 0
      ? (filteredDcpGoalsTrend[filteredDcpGoalsTrend.length - 1]
          ?.goalsAchieved ?? 0)
      : 0

  // Format date (using utility to avoid UTC timezone shift)
  const formatDate = (dateStr: string) => formatDisplayDate(dateStr)

  // Export club data as CSV (using filtered data)
  const handleExport = () => {
    const csvRows = []

    // Header
    csvRows.push('Date,Membership,DCP Goals')

    // Combine membership and DCP data
    const maxLength = Math.max(
      filteredMembershipTrend.length,
      filteredDcpGoalsTrend.length
    )
    for (let i = 0; i < maxLength; i++) {
      const membershipData = filteredMembershipTrend[i]
      const dcpData = filteredDcpGoalsTrend[i]

      const date = membershipData?.date || dcpData?.date || ''
      const membership = membershipData?.count ?? ''
      const dcpGoals = dcpData?.goalsAchieved ?? ''

      csvRows.push(`${date},${membership},${dcpGoals}`)
    }

    // Create blob and download
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${club.clubName.replace(/[^a-z0-9]/gi, '_')}_data.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  // Calculate chart dimensions based on filtered program year data
  const membershipValues = filteredMembershipTrend.map(d => d.count)
  const rawMin = membershipValues.length > 0 ? Math.min(...membershipValues) : 0
  const rawMax = membershipValues.length > 0 ? Math.max(...membershipValues) : 0
  // Pad the range symmetrically when all values are equal (#107)
  const yPadding = rawMax === rawMin ? 2 : 0
  const minMembership = Math.max(0, rawMin - yPadding)
  const maxMembership = rawMax + yPadding
  const membershipRange = maxMembership - minMembership || 1
  const totalProgramDays = 365

  // Key Toastmasters dates as program year day positions
  const keyDates = [
    { day: 0, label: 'Jul 1', description: 'Program Year Start' },
    { day: 92, label: 'Oct 1', description: 'October Renewals' },
    { day: 275, label: 'Apr 1', description: 'April Renewals' },
    { day: 365, label: 'Jun 30', description: 'Program Year End' },
  ]

  // Map a program year day to SVG x-coordinate (chart is 800 wide)
  const dayToX = (day: number) => (day / totalProgramDays) * 800

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900 font-tm-headline">
                {club.clubName}
              </h3>
              <p className="text-gray-600 mt-1 font-tm-body">
                {club.areaName} • {club.divisionName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Status and Export */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {/* Health status badge */}
              <span
                className={`px-4 py-2 text-sm font-medium rounded-full border ${getStatusBadge(club.currentStatus)}`}
              >
                {club.currentStatus.toUpperCase()}
              </span>

              {/* Club status badge - only render when clubStatus is defined */}
              {club.clubStatus && (
                <span
                  className={`px-4 py-2 text-sm font-medium rounded-full border ${getClubStatusBadge(club.clubStatus)}`}
                >
                  {club.clubStatus}
                </span>
              )}
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-tm-loyal-blue text-white rounded-lg hover:bg-tm-loyal-blue-80 transition-colors font-tm-body"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export Data
            </button>
          </div>

          {/* Club Stats Grid */}
          <div className="mb-6 grid grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                Base
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {baseMembership}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                Current
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {latestMembership}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                Net Change
              </div>
              <div
                className={`text-lg font-semibold font-tm-body tabular-nums ${membershipChange > 0 ? 'text-green-600' : membershipChange < 0 ? 'text-red-600' : 'text-gray-900'}`}
              >
                {membershipChange > 0 ? '+' : ''}
                {membershipChange}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                DCP Goals
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {latestDcpGoals}/10
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                Oct Renewals
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {club.octoberRenewals ?? '—'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                Apr Renewals
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {club.aprilRenewals ?? '—'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
              <div className="text-xs text-gray-500 font-tm-body mb-1">
                New Members
              </div>
              <div className="text-lg font-semibold text-gray-900 font-tm-body tabular-nums">
                {club.newMembers ?? '—'}
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          {club.riskFactors.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2 font-tm-headline">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Risk Factors
              </h4>
              <div className="space-y-2">
                {club.riskFactors.map((factor, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-red-900 font-tm-body">{factor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distinguished Status */}
          {club.distinguishedLevel &&
            club.distinguishedLevel !== 'NotDistinguished' && (
              <div className="mb-6 bg-tm-happy-yellow-20 border border-tm-happy-yellow-40 rounded-lg p-4">
                <h4 className="font-semibold text-tm-true-maroon mb-2 flex items-center gap-2 font-tm-headline">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  Distinguished Status
                </h4>
                <span className="inline-block px-4 py-2 bg-tm-happy-yellow-30 text-tm-true-maroon text-sm font-medium rounded-full font-tm-body">
                  {club.distinguishedLevel}
                </span>
              </div>
            )}

          {/* Membership Trend Chart — full program year with key date markers */}
          {filteredMembershipTrend.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2 font-tm-headline">
                <svg
                  className="w-5 h-5 text-tm-loyal-blue"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Membership Trend
              </h4>
              <p className="text-xs text-gray-500 mb-4 font-tm-body">
                Program Year {programYear.label}
              </p>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                {/* Stats */}
                <div className="flex items-center justify-between mb-4 text-sm">
                  <div>
                    <span className="text-gray-600 font-tm-body">Base: </span>
                    <span className="font-semibold text-gray-900 font-tm-body">
                      {baseMembership} members
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-tm-body">
                      Current:{' '}
                    </span>
                    <span className="font-semibold text-gray-900 font-tm-body">
                      {latestMembership} members
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-tm-body">Change: </span>
                    <span
                      className={`font-semibold font-tm-body ${membershipChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {membershipChange >= 0 ? '+' : ''}
                      {membershipChange} members
                    </span>
                  </div>
                </div>

                {/* Program Year Chart */}
                <div className="relative h-48 bg-white rounded border border-gray-200 p-4">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-4 bottom-4 w-10 flex flex-col justify-between text-xs text-gray-500 font-tm-body">
                    <span>{maxMembership}</span>
                    <span>
                      {Math.round(minMembership + membershipRange * 0.5)}
                    </span>
                    <span>{minMembership}</span>
                  </div>
                  <svg
                    className="w-full h-full ml-8"
                    viewBox="0 0 800 180"
                    preserveAspectRatio="none"
                    aria-label={`Membership trend for ${programYear.label} program year, from ${minMembership} to ${maxMembership} members`}
                  >
                    {/* Horizontal grid lines */}
                    {[0, 45, 90, 135, 160].map(y => (
                      <line
                        key={`grid-${y}`}
                        x1="0"
                        y1={y}
                        x2="800"
                        y2={y}
                        stroke="var(--tm-cool-gray)"
                        strokeWidth="0.5"
                      />
                    ))}

                    {/* Key date reference lines */}
                    {keyDates.map(kd => {
                      const x = dayToX(kd.day)
                      return (
                        <g key={kd.label}>
                          <line
                            x1={x}
                            y1="0"
                            x2={x}
                            y2="160"
                            stroke="var(--tm-cool-gray)"
                            strokeWidth="1"
                            strokeDasharray="4 3"
                          />
                          <text
                            x={x}
                            y="175"
                            textAnchor="middle"
                            fontSize="10"
                            fill="#6b7280"
                            fontFamily="inherit"
                          >
                            {kd.label}
                          </text>
                        </g>
                      )
                    })}

                    {/* Data line path — positioned by date within program year */}
                    {filteredMembershipTrend.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="var(--tm-loyal-blue)"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={filteredMembershipTrend
                          .map(point => {
                            const day = calculateProgramYearDay(point.date)
                            const x = dayToX(day)
                            const y =
                              160 -
                              ((point.count - minMembership) /
                                membershipRange) *
                                160
                            return `${x},${y}`
                          })
                          .join(' ')}
                      />
                    )}

                    {/* Data points */}
                    {filteredMembershipTrend.map((point, index) => {
                      const day = calculateProgramYearDay(point.date)
                      const x = dayToX(day)
                      const y =
                        160 -
                        ((point.count - minMembership) / membershipRange) * 160
                      return (
                        <g key={index}>
                          <circle
                            cx={x}
                            cy={y}
                            r="3"
                            fill="var(--tm-loyal-blue)"
                          />
                          {/* Tooltip on hover — count label */}
                          <title>
                            {formatDate(point.date)}: {point.count} members
                          </title>
                        </g>
                      )
                    })}
                  </svg>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between mt-2 text-xs text-gray-500 font-tm-body">
                  <span>{programYear.label} Program Year</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block w-3 h-0.5 bg-gray-400"
                        style={{ borderTop: '1px dashed #9ca3af' }}
                      ></span>
                      Key dates
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'var(--tm-loyal-blue)' }}
                      ></span>
                      Data points
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DCP Goals Progress — with achievement dates */}
          {filteredDcpGoalsTrend.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 font-tm-headline">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
                DCP Goals Progress Over Time
              </h4>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                {/* Current Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600 font-tm-body">
                      Current Progress
                    </span>
                    <span className="font-semibold text-gray-900 font-tm-body">
                      {latestDcpGoals} / 10 goals
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(latestDcpGoals / 10) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Goal achievement timeline — show when each new goal was achieved */}
                <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 font-tm-body">
                  Goal Achievement Timeline
                </h5>
                <div className="space-y-2">
                  {(() => {
                    // Data already filtered by program year (#119), no need to re-filter (#79b)
                    const inProgramYear = filteredDcpGoalsTrend

                    // Show only dates where goals changed
                    const changed = inProgramYear.filter(
                      (point, index, arr) => {
                        if (index === 0) return true
                        return (
                          point.goalsAchieved !== arr[index - 1]?.goalsAchieved
                        )
                      }
                    )

                    return changed.map((point, index) => {
                      const prevGoals =
                        index > 0
                          ? (changed[index - 1]?.goalsAchieved ?? 0)
                          : // Use the last pre-program-year value as baseline
                            (inProgramYear[0]?.goalsAchieved ?? 0)
                      const gained = point.goalsAchieved - prevGoals
                      const isIncrease = gained > 0
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span className="text-gray-600 w-24 flex-shrink-0 font-tm-body">
                            {formatDate(point.date)}
                          </span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-tm-loyal-blue h-2 rounded-full"
                              style={{
                                width: `${(point.goalsAchieved / 10) * 100}%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-gray-900 w-12 text-right font-tm-body">
                            {point.goalsAchieved}/10
                          </span>
                          {index > 0 && (
                            <span
                              className={`text-xs w-8 text-right font-medium font-tm-body ${
                                isIncrease ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {isIncrease ? '+' : ''}
                              {gained}
                            </span>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium font-tm-body"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
