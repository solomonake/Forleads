import type { TransformStyleFunction } from "maplibre-gl";

type StyleSpecification = ReturnType<TransformStyleFunction>;

/**
 * Basemap style. Swapping providers is this one line.
 *
 * OpenFreeMap's public instance needs no API key, account or cookie, and has
 * no view caps (openfreemap.org, ToS dated 2026-10-14, checked 2026-11-06).
 * Its style carries the required "© OpenMapTiles · Data from OpenStreetMap"
 * attribution on its vector source, which MapLibre's attribution control shows.
 *
 * CARTO's keyless `basemaps.cartocdn.com` raster tiles were retired: every tile
 * now returns HTTP 200 with the same "API KEY REQUIRED" watermark image.
 */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Layer and source id the aerial toggle flips. */
export const SATELLITE_LAYER_ID = "sat";

/** Esri World Imagery: keyless raster tiles, z0-19. */
export const SATELLITE_SOURCE = {
  type: "raster",
  tileSize: 256,
  maxzoom: 19,
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  attribution: "Imagery © Esri",
} as const;

/**
 * Credits the basemap style does not carry. Mapillary street imagery appears in
 * the lead panel, not as a map source, so it is credited here rather than on a
 * source. OSM/OpenMapTiles come from the style; Esri comes from the satellite
 * source and shows while that layer is visible.
 */
export const MAP_CUSTOM_ATTRIBUTION = "Street © Mapillary (CC-BY-SA)";

/**
 * Adds the aerial imagery layer, hidden, on top of the fetched basemap style.
 * Passed to MapLibre as `transformStyle`, so the layer exists as soon as the
 * style loads and survives any later `setStyle` call.
 */
export function withSatelliteLayer(
  previous: StyleSpecification | undefined,
  next: StyleSpecification
): StyleSpecification {
  // Carry the operator's aerial choice over a style swap; default hidden.
  const previousSat = previous?.layers?.find((layer) => layer.id === SATELLITE_LAYER_ID);
  const visibility = previousSat?.layout?.visibility === "visible" ? "visible" : "none";
  return {
    ...next,
    sources: {
      ...next.sources,
      [SATELLITE_LAYER_ID]: { ...SATELLITE_SOURCE, tiles: [...SATELLITE_SOURCE.tiles] },
    },
    layers: [
      ...next.layers.filter((layer) => layer.id !== SATELLITE_LAYER_ID),
      {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_LAYER_ID,
        layout: { visibility },
      },
    ],
  };
}
