/**
 * Import for its side effect from a test that mounts DistrictsPage (#2689).
 *
 * The rankings table is a lazy chunk. In a test the first dynamic import is a
 * cold module transform, which took 1155 ms in CI under load against findBy's
 * 1000 ms. Awaiting it here, at collection, moves that cost out of the test
 * body (and its timeout); React.lazy then resolves from the module cache.
 */
import { importDistrictRankingsTable } from '../components/lazy/districtRankingsTableChunk'

await importDistrictRankingsTable()
