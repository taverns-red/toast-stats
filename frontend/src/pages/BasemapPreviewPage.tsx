import { useDocumentTitle } from '../hooks/useDocumentTitle'
import LazyBasemapMap from '../components/map/LazyBasemapMap'

/* Basemap preview (#1786, ADR-016). An unlisted page that renders the
   self-hosted Protomaps basemap on its own, so the basemap can be checked on
   a PR preview (light, dark, 375 px) before any map page exists. The district
   map (#1784) is the real consumer. When it lands, the basemap smoke moves to
   /district/:id/map and this route is deleted. Nothing links here. */

export default function BasemapPreviewPage() {
  useDocumentTitle('Basemap preview')
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="font-tm-headline text-2xl font-bold text-gray-900">
        Basemap preview
      </h1>
      <p className="mt-2 text-base text-gray-700">
        The self-hosted world basemap the club maps will draw on. Pins are added
        by the district map.
      </p>
      <div
        className="mt-4 overflow-hidden rounded-lg border border-gray-200"
        style={{ height: 'min(70dvh, 640px)', minHeight: 320 }}
        data-testid="basemap-preview-frame"
      >
        <LazyBasemapMap ariaLabel="World basemap" />
      </div>
    </div>
  )
}
