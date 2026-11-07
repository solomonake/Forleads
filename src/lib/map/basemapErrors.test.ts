import { describe, expect, it, vi } from "vitest";
import { BASEMAP_STYLE_URL, SATELLITE_LAYER_ID, withSatelliteLayer } from "./basemap";
import {
  BASEMAP_NOTICE_TEXT,
  attachBasemapErrorHandling,
  classifyMapError,
  type BasemapMapLike,
  type BasemapNotice,
  type BasemapStatus,
  type MapErrorEventLike,
} from "./basemapErrors";

type Listener = (event: MapErrorEventLike) => void;

/** Stand-in for MapLibre's Map: records calls and lets a test fire events. */
function fakeMap(options: { hasSatLayer?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const map = {
    on: vi.fn((type: string, listener: Listener) => {
      (listeners[type] ??= []).push(listener);
    }),
    setStyle: vi.fn(),
    getLayer: vi.fn((id: string) => (options.hasSatLayer !== false && id === SATELLITE_LAYER_ID ? {} : undefined)),
    setLayoutProperty: vi.fn(),
  };
  const fire = (type: string, event: MapErrorEventLike = {}) =>
    (listeners[type] ?? []).forEach((listener) => listener({ type, ...event }));
  return { map: map as typeof map & BasemapMapLike, fire };
}

function setup(options: { hasSatLayer?: boolean } = {}) {
  const { map, fire } = fakeMap(options);
  const notices: BasemapNotice[] = [];
  const statuses: BasemapStatus[] = [];
  const onAerialForced = vi.fn();
  const log = { warn: vi.fn(), error: vi.fn() };
  const handle = attachBasemapErrorHandling(map, {
    onNotice: (notice) => notices.push(notice),
    onAerialForced,
    onStatus: (status) => statuses.push(status),
    log,
  });
  return { map, fire, notices, statuses, onAerialForced, log, handle };
}

const ajaxError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe("classifyMapError", () => {
  it("treats a source-less error before style.load as the style failing", () => {
    expect(classifyMapError({ error: ajaxError(503) }, false)).toBe("style");
  });

  it("does not blame the style for source-less errors after it loaded (sprite, glyphs)", () => {
    expect(classifyMapError({ error: new Error("sprite") }, true)).toBe("other");
  });

  it("separates whole-source failures, single tiles and the aerial source", () => {
    expect(classifyMapError({ sourceId: "openmaptiles" }, true)).toBe("basemap-source");
    expect(classifyMapError({ sourceId: "openmaptiles", tile: {} }, true)).toBe("basemap-tile");
    expect(classifyMapError({ sourceId: SATELLITE_LAYER_ID, tile: {} }, true)).toBe("aerial");
    expect(classifyMapError({ sourceId: SATELLITE_LAYER_ID }, true)).toBe("aerial");
  });
});

describe("attachBasemapErrorHandling", () => {
  it("reports ready once the basemap style loads", () => {
    const { fire, statuses, notices } = setup();
    fire("style.load");
    expect(statuses).toEqual(["ready"]);
    expect(notices).toEqual([]);
  });

  it("swaps to the aerial-only fallback when the style URL fails, and says so once", () => {
    const { map, fire, notices, statuses, onAerialForced } = setup();
    fire("error", { error: ajaxError(503) });

    expect(map.setStyle).toHaveBeenCalledTimes(1);
    const [style, options] = map.setStyle.mock.calls[0] ?? [];
    expect(style).toMatchObject({
      layers: [{ id: "background" }, { id: SATELLITE_LAYER_ID, layout: { visibility: "visible" } }],
    });
    // transformStyle must be cleared or MapLibre waits for the failed style forever.
    expect(options).toEqual({ diff: false, transformStyle: undefined });
    expect(onAerialForced).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "style", sticky: true, text: BASEMAP_NOTICE_TEXT.style });
    expect(notices[0]?.retry).toBeTypeOf("function");

    fire("style.load");
    expect(statuses).toEqual(["fallback"]);
  });

  it("retry reloads the real style, keeping the aerial choice, and can notify again", () => {
    const { map, fire, notices, statuses } = setup();
    fire("error", { error: ajaxError(503) });
    fire("style.load");
    notices[0]?.retry?.();

    expect(map.setStyle).toHaveBeenLastCalledWith(BASEMAP_STYLE_URL, {
      diff: false,
      transformStyle: withSatelliteLayer,
    });
    expect(statuses).toEqual(["fallback", "loading"]);

    // The retry fails too: fall back again and tell the operator again.
    fire("error", { error: ajaxError(503) });
    expect(map.setStyle).toHaveBeenCalledTimes(3);
    expect(notices.map((notice) => notice.kind)).toEqual(["style", "style"]);

    // The retry succeeds.
    notices[1]?.retry?.();
    fire("style.load");
    expect(statuses.at(-1)).toBe("ready");
  });

  it("shows aerial imagery when a basemap source fails after the style loaded", () => {
    const { map, fire, notices, statuses, onAerialForced } = setup();
    fire("style.load");
    fire("error", { sourceId: "openmaptiles", error: ajaxError(500) });

    expect(map.setStyle).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).toHaveBeenCalledWith(SATELLITE_LAYER_ID, "visibility", "visible");
    expect(onAerialForced).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["ready", "fallback"]);
    expect(notices).toEqual([
      expect.objectContaining({ kind: "basemap-source", sticky: true, retry: expect.any(Function) }),
    ]);
  });

  it("still notifies about a failed source when there is no aerial layer to switch on", () => {
    const { map, fire, notices, onAerialForced } = setup({ hasSatLayer: false });
    fire("style.load");
    fire("error", { sourceId: "openmaptiles" });
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
    expect(onAerialForced).not.toHaveBeenCalled();
    expect(notices.map((notice) => notice.kind)).toEqual(["basemap-source"]);
  });

  it("collapses a storm of tile errors into one brief notice per kind", () => {
    const { map, fire, notices, log } = setup();
    fire("style.load");
    for (let i = 0; i < 25; i += 1) {
      fire("error", { sourceId: "openmaptiles", tile: { i }, error: ajaxError(502) });
      fire("error", { sourceId: SATELLITE_LAYER_ID, tile: { i }, error: ajaxError(502) });
    }
    expect(notices).toEqual([
      { kind: "basemap-tile", text: BASEMAP_NOTICE_TEXT["basemap-tile"], sticky: false },
      { kind: "aerial", text: BASEMAP_NOTICE_TEXT.aerial, sticky: false },
    ]);
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(50);
  });

  it("logs errors it does not handle instead of swallowing them", () => {
    const { map, fire, notices, log } = setup();
    fire("style.load");
    const sprite = new Error("sprite failed");
    fire("error", { error: sprite });
    expect(log.error).toHaveBeenCalledWith(sprite);
    expect(notices).toEqual([]);
    expect(map.setStyle).not.toHaveBeenCalled();
  });
});
