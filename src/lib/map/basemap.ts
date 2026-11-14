import type { TransformStyleFunction } from "maplibre-gl";

type StyleSpecification = ReturnType<TransformStyleFunction>;

/**
 * Basemap style. Swapping providers is this one line.
 *
 * OpenFreeMap's public instance needs no API key, account or cookie, and has
 * no view caps (openfreemap.org, ToS dated 2026-10-14, checked 2026-11-06).
 * The style itself carries no attribution: its `openmaptiles` vector source is
 * a `url` pointing at the TileJSON at https://tiles.openfreemap.org/planet, and
 * that TileJSON supplies the required "OpenFreeMap © OpenMapTiles · Data from
 * OpenStreetMap" credit. MapLibre's attribution control shows it once that
 * TileJSON has loaded.
 *
 * CARTO's keyless `basemaps.cartocdn.com` raster tiles were retired: every tile
 * now returns HTTP 200 with the same "API KEY REQUIRED" watermark image.
 */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Layer and source id the aerial toggle flips. */
export const SATELLITE_LAYER_ID = "sat";

/**
 * Where the aerial layer sits. `false` (current look) draws it above every
 * basemap layer, so aerial mode is imagery only. `true` slots it beneath the
 * first label (symbol) layer for a hybrid look: imagery with street and place
 * names on top. Visual choice, kept off until Solo decides.
 */
export const AERIAL_BENEATH_LABELS = false;

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
 * Adds the aerial imagery layer, hidden, to the fetched basemap style: on top
 * by default, or beneath the first label layer when `beneathLabels` is set.
 * Passed to MapLibre as `transformStyle`, so the layer exists as soon as the
 * style loads and survives any later `setStyle` call.
 */
export function withSatelliteLayer(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
  beneathLabels: boolean = AERIAL_BENEATH_LABELS
): StyleSpecification {
  // Carry the operator's aerial choice over a style swap; default hidden.
  const previousSat = previous?.layers?.find((layer) => layer.id === SATELLITE_LAYER_ID);
  const visibility = previousSat?.layout?.visibility === "visible" ? "visible" : "none";
  const layers = next.layers.filter((layer) => layer.id !== SATELLITE_LAYER_ID);
  const firstLabel = beneathLabels ? layers.findIndex((layer) => layer.type === "symbol") : -1;
  const at = firstLabel === -1 ? layers.length : firstLabel;
  return {
    ...next,
    sources: {
      ...next.sources,
      [SATELLITE_LAYER_ID]: { ...SATELLITE_SOURCE, tiles: [...SATELLITE_SOURCE.tiles] },
    },
    layers: [
      ...layers.slice(0, at),
      {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_LAYER_ID,
        layout: { visibility },
      },
      ...layers.slice(at),
    ],
  };
}

/** Background colour of the OpenFreeMap dark style, reused by the fallback. */
const FALLBACK_BACKGROUND = "rgb(12,12,12)";

/**
 * Inline style used when the basemap style URL cannot be loaded. It needs no
 * network for itself and shows the Esri aerial layer, so the map is never a
 * blank canvas. No symbol layers, so no glyphs or sprite are required.
 */
export function fallbackBasemapStyle(): StyleSpecification {
  const style = withSatelliteLayer(
    undefined,
    {
      version: 8,
      name: "Forleads fallback (aerial only)",
      sources: {},
      layers: [
        { id: "background", type: "background", paint: { "background-color": FALLBACK_BACKGROUND } },
      ],
    },
    false
  );
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.id === SATELLITE_LAYER_ID ? { ...layer, layout: { visibility: "visible" } } : layer
    ),
  };
}
