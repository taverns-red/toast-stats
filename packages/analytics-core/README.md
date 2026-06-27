# @taverns-red/analytics-core

Shared analytics computation logic for Toastmasters statistics.

## Overview

This package contains the core analytics computation algorithms extracted from the backend, making them usable by both `collector-cli` (for pre-computing analytics) and `backend` (for validation and serving).

The package ensures that analytics computed by the CLI pipeline are identical to what the backend would compute, maintaining consistency across the system.

## Installation

This is a private package within the monorepo. It's automatically available to other workspace packages.

```bash
# From the monorepo root
npm install
```

## Usage

### ESM (recommended)

```typescript
import {
  // Version management
  ANALYTICS_SCHEMA_VERSION,
  COMPUTATION_VERSION,
  isCompatibleVersion,

  // Analytics computation
  AnalyticsComputer,
  type IAnalyticsComputer,

  // Data transformation
  DataTransformer,
  type IDataTransformer,

  // Types
  type DistrictAnalytics,
  type MembershipTrendData,
  type ClubHealthData,
  type PreComputedAnalyticsFile,
  type AnalyticsManifest,
} from '@taverns-red/analytics-core'
```

### CommonJS

```javascript
const {
  ANALYTICS_SCHEMA_VERSION,
  COMPUTATION_VERSION,
  isCompatibleVersion,
  AnalyticsComputer,
  DataTransformer,
} = require('@taverns-red/analytics-core')
```

## Exports

### Version Management

| Export                         | Type       | Description                                                |
| ------------------------------ | ---------- | ---------------------------------------------------------- |
| `ANALYTICS_SCHEMA_VERSION`     | `string`   | Current schema version for analytics files (e.g., "1.0.0") |
| `COMPUTATION_VERSION`          | `string`   | Current computation algorithm version                      |
| `isCompatibleVersion(version)` | `function` | Check if a file version is compatible with current version |

### Analytics Computation

| Export               | Type        | Description                               |
| -------------------- | ----------- | ----------------------------------------- |
| `AnalyticsComputer`  | `class`     | Main analytics computation implementation |
| `IAnalyticsComputer` | `interface` | Interface for analytics computation       |

**AnalyticsComputer Methods:**

```typescript
interface IAnalyticsComputer {
  computeDistrictAnalytics(snapshot: DistrictSnapshot): DistrictAnalytics
  computeMembershipTrends(snapshot: DistrictSnapshot): MembershipTrendData
  computeClubHealth(snapshot: DistrictSnapshot): ClubHealthData
  computeDistinguishedClubs(snapshot: DistrictSnapshot): DistinguishedClubData
  computeDivisionAreaAnalytics(
    snapshot: DistrictSnapshot
  ): DivisionAreaAnalytics
}
```

### Data Transformation

| Export             | Type        | Description                                   |
| ------------------ | ----------- | --------------------------------------------- |
| `DataTransformer`  | `class`     | CSV-to-snapshot transformation implementation |
| `IDataTransformer` | `interface` | Interface for data transformation             |

**DataTransformer Methods:**

```typescript
interface IDataTransformer {
  transformCSVToSnapshot(csvData: RawCSVData): DistrictSnapshot
  parseCSVRecord(record: Record<string, string>): ParsedRecord
  normalizeDistrictData(data: RawDistrictData): NormalizedDistrictData
}
```

### Types

| Type                          | Description                                  |
| ----------------------------- | -------------------------------------------- |
| `DistrictAnalytics`           | Complete district analytics structure        |
| `MembershipTrendData`         | Membership trend time series data            |
| `ClubHealthData`              | Club health classifications and scores       |
| `DistinguishedClubData`       | Distinguished club tracking data             |
| `DivisionAreaAnalytics`       | Division and area performance metrics        |
| `PreComputedAnalyticsFile<T>` | Wrapper for pre-computed files with metadata |
| `AnalyticsManifest`           | Manifest of generated analytics files        |
| `DistrictSnapshot`            | Snapshot data for a single district          |

### Pre-Computed Analytics File Structure

```typescript
interface PreComputedAnalyticsFile<T> {
  schemaVersion: string // e.g., "1.0.0"
  computedAt: string // ISO timestamp
  checksum: string // SHA256 checksum of data
  data: T // The actual analytics data
}
```

### Analytics Manifest Structure

```typescript
interface AnalyticsManifest {
  schemaVersion: string
  generatedAt: string
  snapshotDate: string
  files: Array<{
    filename: string
    districtId: string
    checksum: string
    size: number
  }>
}
```

## Architecture

This package is part of the pre-computed analytics pipeline:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Pre-Computed Analytics Pipeline                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Raw CSV ──▶ DataTransformer ──▶ Snapshot ──▶ AnalyticsComputer     │
│                    │                               │                 │
│                    │                               │                 │
│                    ▼                               ▼                 │
│              Snapshot Files                 Analytics Files          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Package Consumers

| Consumer        | Usage                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| `collector-cli` | Uses `DataTransformer` and `AnalyticsComputer` to pre-compute analytics |
| `backend`       | Uses types for validation and `isCompatibleVersion` for schema checking |

### Version Compatibility

The package uses semantic versioning for analytics files:

- **Major version change**: Breaking schema changes, requires re-computation
- **Minor version change**: New fields added, backward compatible
- **Patch version change**: Bug fixes, no schema changes

```typescript
// Check if a file is compatible with current version
import {
  isCompatibleVersion,
  ANALYTICS_SCHEMA_VERSION,
} from '@taverns-red/analytics-core'

const fileVersion = analyticsFile.schemaVersion
if (!isCompatibleVersion(fileVersion)) {
  throw new Error(
    `Incompatible version: ${fileVersion}, expected ${ANALYTICS_SCHEMA_VERSION}`
  )
}
```

## Development

```bash
# Build the package
npm run build

# Run tests
npm test

# Run property-based tests
npm test -- --run

# Type check
npm run typecheck

# Lint
npm run lint
```

## Testing

The package includes comprehensive tests:

- **Unit tests**: Core logic validation
- **Property-based tests**: Universal correctness properties using fast-check
  - Analytics computation equivalence
  - JSON serialization round-trip
  - Version compatibility

## License

Private - Internal use only
