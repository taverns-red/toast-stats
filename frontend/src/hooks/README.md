# District Data Hooks

This directory contains React Query hooks for fetching and managing district-level data in the Toastmasters District Visualizer.

## Available Hooks

### District Data Hooks

#### `useDistrictData(districtId, date, enabled?)`

Fetches cached district data for a specific date, including district, division, and club performance reports.

**Parameters:**

- `districtId`: The district ID (e.g., "46")
- `date`: Date in YYYY-MM-DD format
- `enabled`: Optional boolean to enable/disable the query (default: true)

**Returns:** District cache entry with all three report types

**Cache Strategy:** 10 minutes stale time (historical data doesn't change)

**Example:**

```typescript
const { data, isLoading, error } = useDistrictData('46', '2025-11-22')
```

#### `useDistrictCachedDates(districtId, enabled?)`

Fetches all available cached dates for a district.

**Parameters:**

- `districtId`: The district ID
- `enabled`: Optional boolean to enable/disable the query (default: true)

**Returns:** List of cached dates and date range

**Cache Strategy:** 5 minutes stale time

**Example:**

```typescript
const { data: cachedDates } = useDistrictCachedDates('46')
// cachedDates.dates: ['2025-11-01', '2025-11-02', ...]
// cachedDates.dateRange: { startDate: '2025-11-01', endDate: '2025-11-22' }
```

### Analytics Hooks

#### `useDistrictAnalytics(districtId, startDate?, endDate?)`

Fetches comprehensive district analytics including membership trends, club health, distinguished status, and division rankings.

**Parameters:**

- `districtId`: The district ID
- `startDate`: Optional start date for analysis range
- `endDate`: Optional end date for analysis range

**Returns:** Comprehensive district analytics object

**Cache Strategy:** 5 minutes stale time

**Example:**

```typescript
const { data: analytics } = useDistrictAnalytics(
  '46',
  '2025-07-01',
  '2025-11-22'
)
```

#### `useAtRiskClubs(districtId, enabled?)`

Fetches list of at-risk and critical clubs for a district.

**Parameters:**

- `districtId`: The district ID
- `enabled`: Optional boolean to enable/disable the query (default: true)

**Returns:** List of at-risk clubs with risk factors

**Cache Strategy:** 5 minutes stale time

**Example:**

```typescript
const { data: atRiskData } = useAtRiskClubs('46')
// atRiskData.clubs: Array of at-risk clubs
// atRiskData.criticalClubs: Count of critical clubs
```

### Backfill Hooks

The backfill hooks have been consolidated into a unified interface that supports both global and district-specific backfill operations.

#### `useInitiateBackfill(districtId?)`

Mutation hook to initiate a backfill operation. When districtId is provided, uses district-specific endpoints.

**Parameters:**

- `districtId`: Optional district ID for district-specific backfills

**Returns:** Mutation object with `mutate` function

**Example:**

```typescript
// Global backfill
const { mutate: startBackfill } = useInitiateBackfill()
startBackfill({ startDate: '2025-07-01', endDate: '2025-11-22' })

// District-specific backfill
const { mutate: startDistrictBackfill } = useInitiateBackfill('46')
startDistrictBackfill({ startDate: '2025-07-01', endDate: '2025-11-22' })
```

#### `useBackfillStatus(backfillId, enabled?, districtId?)`

Polls the status of a backfill operation. Automatically polls every 2 seconds while processing.

**Parameters:**

- `backfillId`: The backfill job ID (or null)
- `enabled`: Optional boolean to enable/disable polling (default: true)
- `districtId`: Optional district ID for district-specific backfills

**Returns:** Backfill status with progress information

**Auto-polling:** Stops when status is 'complete' or 'error'

**Example:**

```typescript
// Global backfill status
const { data: status } = useBackfillStatus(backfillId, true)

// District-specific backfill status
const { data: status } = useBackfillStatus(backfillId, true, '46')
// status.progress: { total, completed, current, skipped, failed }
```

#### `useCancelBackfill(districtId?)`

Mutation hook to cancel a running backfill operation.

**Parameters:**

- `districtId`: Optional district ID for district-specific backfills

**Returns:** Mutation object with `mutate` function

**Example:**

```typescript
// Cancel global backfill
const { mutate: cancelBackfill } = useCancelBackfill()
cancelBackfill(backfillId)

// Cancel district-specific backfill
const { mutate: cancelDistrictBackfill } = useCancelBackfill('46')
cancelDistrictBackfill(backfillId)
```

#### `useBackfill(options?, backfillId?, enabled?)`

Unified hook that provides all backfill operations in a single interface.

**Parameters:**

- `options`: Optional object with `districtId` for district-specific backfills
- `backfillId`: Optional backfill ID for status polling
- `enabled`: Optional boolean to enable/disable status polling (default: true)

**Returns:** Object with `initiateBackfill`, `backfillStatus`, and `cancelBackfill`

**Example:**

```typescript
// Global backfill
const { initiateBackfill, backfillStatus, cancelBackfill } = useBackfill()

// District-specific backfill
const { initiateBackfill, backfillStatus, cancelBackfill } = useBackfill(
  { districtId: '46' },
  backfillId,
  true
)
```

#### Backward Compatibility

For backward compatibility, the following aliases are available (deprecated):

- `useInitiateDistrictBackfill(districtId)` → Use `useInitiateBackfill(districtId)`
- `useDistrictBackfillStatus(districtId, backfillId, enabled)` → Use `useBackfillStatus(backfillId, enabled, districtId)`
- `useCancelDistrictBackfill(districtId)` → Use `useCancelBackfill(districtId)`

## Caching Strategy

All hooks use React Query's caching mechanism with the following defaults:

- **Stale Time:** 5-10 minutes depending on data type
  - Historical data (useDistrictData): 10 minutes
  - Analytics and trends: 5 minutes
- **Retry:** 2 attempts for failed requests
- **Refetch on Window Focus:** Disabled (configured globally)
- **Background Refetching:** Enabled for backfill status polling

## Query Keys

Query keys are structured for optimal cache invalidation:

- `['districtData', districtId, date]` - District data by date
- `['district-cached-dates', districtId]` - Cached dates list
- `['districtAnalytics', districtId, startDate, endDate]` - District analytics
- `['clubTrends', districtId, clubId]` - Club trends
- `['atRiskClubs', districtId]` - At-risk clubs
- `['backfillStatus', backfillId]` - Global backfill status
- `['districtBackfillStatus', districtId, backfillId]` - District-specific backfill status

## Error Handling

All hooks return standard React Query error objects. Common error scenarios:

- **404 Not Found:** No cached data available for the requested date/district
- **400 Bad Request:** Invalid parameters (e.g., malformed date)
- **500 Server Error:** Backend processing error

Handle errors using the `error` property:

```typescript
const { data, error, isLoading } = useDistrictData('46', '2025-11-22')

if (error) {
  // Handle error - show message to user
  console.error('Failed to fetch district data:', error.message)
}
```

## Requirements Mapping

These hooks fulfill the following requirements from the archived district-level-data spec (now implemented):

- **Requirement 1.4:** Cache district data retrieval (useDistrictData, useDistrictCachedDates)
- **Requirement 2.2:** Backfill progress tracking (useBackfillStatus)
- **Requirement 3.1:** Display club performance (useDistrictAnalytics)
- **Requirement 4.4:** At-risk club identification (useAtRiskClubs)

The backfill hooks also fulfill requirements from the codebase-cleanup spec:

- **Requirement 3.1-3.6:** Consolidated backfill hooks (useBackfill, useInitiateBackfill, useBackfillStatus, useCancelBackfill)
