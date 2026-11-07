import { describe, expect, it } from "vitest";
import {
  AERIAL_BENEATH_LABELS,
  BASEMAP_STYLE_URL,
  MAP_CUSTOM_ATTRIBUTION,
  SATELLITE_LAYER_ID,
  SATELLITE_SOURCE,
  fallbackBasemapStyle,
  withSatelliteLayer,
} from "./basemap";

type Style = Parameters<typeof withSatelliteLayer>[1];

const fetchedStyle = (): Style => ({
  version: 8,
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#000" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
  ],
});

describe("basemap", () => {
  it("uses a keyless provider and never the retired CARTO raster host", () => {
    expect(BASEMAP_STYLE_URL).toMatch(/^https:\/\//);
    expect(BASEMAP_STYLE_URL).not.toMatch(/cartocdn|api[_-]?key|token=/i);
    expect(SATELLITE_SOURCE.tiles.join(" ")).not.toMatch(/api[_-]?key|token=/i);
  });

  it("adds a hidden aerial layer on top and keeps the basemap layers and sources", () => {
    const style = withSatelliteLayer(undefined, fetchedStyle());
    expect(style.layers.map((layer) => layer.id)).toEqual(["background", "water", SATELLITE_LAYER_ID]);
    expect(style.layers.at(-1)).toMatchObject({
      type: "raster",
      source: SATELLITE_LAYER_ID,
      layout: { visibility: "none" },
    });
    expect(Object.keys(style.sources)).toEqual(["openmaptiles", SATELLITE_LAYER_ID]);
    expect(style.sources[SATELLITE_LAYER_ID]).toMatchObject({
      type: "raster",
      maxzoom: 19,
      attribution: "Imagery © Esri",
    });
  });

  it("does not duplicate the aerial layer and carries its visibility across a style swap", () => {
    const first = withSatelliteLayer(undefined, fetchedStyle());
    const shown: Style = {
      ...first,
      layers: first.layers.map((layer) =>
        layer.id === SATELLITE_LAYER_ID ? { ...layer, layout: { visibility: "visible" } } : layer
      ),
    };
    const swapped = withSatelliteLayer(shown, shown);
    const satLayers = swapped.layers.filter((layer) => layer.id === SATELLITE_LAYER_ID);
    expect(satLayers).toHaveLength(1);
    expect(satLayers[0]).toMatchObject({ layout: { visibility: "visible" } });
  });

  it("credits the street imagery the style does not carry", () => {
    expect(MAP_CUSTOM_ATTRIBUTION).toContain("Mapillary");
  });

  it("keeps the aerial layer on top by default and can slot it beneath the labels", () => {
    expect(AERIAL_BENEATH_LABELS).toBe(false);
    const labelled: Style = {
      ...fetchedStyle(),
      layers: [
        ...fetchedStyle().layers,
        { id: "place", type: "symbol", source: "openmaptiles", "source-layer": "place" },
        { id: "poi", type: "symbol", source: "openmaptiles", "source-layer": "poi" },
      ],
    };
    const onTop = withSatelliteLayer(undefined, labelled);
    expect(onTop.layers.map((layer) => layer.id)).toEqual([
      "background",
      "water",
      "place",
      "poi",
      SATELLITE_LAYER_ID,
    ]);
    const hybrid = withSatelliteLayer(undefined, labelled, true);
    expect(hybrid.layers.map((layer) => layer.id)).toEqual([
      "background",
      "water",
      SATELLITE_LAYER_ID,
      "place",
      "poi",
    ]);
    // A style with no labels puts it on top either way.
    expect(withSatelliteLayer(undefined, fetchedStyle(), true).layers.at(-1)?.id).toBe(SATELLITE_LAYER_ID);
  });

  it("falls back to an inline, network-free style that shows aerial imagery", () => {
    const style = fallbackBasemapStyle();
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual([SATELLITE_LAYER_ID]);
    expect(style.layers.map((layer) => layer.id)).toEqual(["background", SATELLITE_LAYER_ID]);
    expect(style.layers.at(-1)).toMatchObject({ layout: { visibility: "visible" } });
    // No labels, so no glyph or sprite requests that could also fail.
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(style.layers.some((layer) => layer.type === "symbol")).toBe(false);
    // Each call is a fresh object MapLibre may keep.
    expect(fallbackBasemapStyle()).not.toBe(style);
  });
});
