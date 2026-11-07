import {
  BASEMAP_STYLE_URL,
  SATELLITE_LAYER_ID,
  fallbackBasemapStyle,
  withSatelliteLayer,
} from "./basemap";

type StyleSpecification = ReturnType<typeof fallbackBasemapStyle>;

/**
 * What went wrong, from MapLibre's `error` event:
 * - `style`: the style JSON never loaded (network, HTTP or validation failure).
 *   An error with no `sourceId` before `style.load` can only be that, because
 *   sprite and glyph requests start after the style has loaded.
 * - `basemap-source`: a basemap source failed as a whole, e.g. its TileJSON.
 * - `basemap-tile`: one basemap tile failed.
 * - `aerial`: the Esri imagery source or one of its tiles failed.
 * - `other`: anything else (sprite, glyphs, runtime API misuse).
 */
export type MapErrorKind = "style" | "basemap-source" | "basemap-tile" | "aerial" | "other";

/** The fields of MapLibre's ErrorEvent this module reads. */
export interface MapErrorEventLike {
  type?: string;
  error?: unknown;
  sourceId?: string;
  tile?: unknown;
}

export function classifyMapError(event: MapErrorEventLike, styleLoaded: boolean): MapErrorKind {
  if (event.sourceId === SATELLITE_LAYER_ID) return "aerial";
  if (event.sourceId) return event.tile ? "basemap-tile" : "basemap-source";
  return styleLoaded ? "other" : "style";
}

/** `fallback` means the vector basemap is out and aerial imagery is standing in. */
export type BasemapStatus = "loading" | "ready" | "fallback";

export interface BasemapNotice {
  kind: Exclude<MapErrorKind, "other">;
  text: string;
  /** Sticky notices stay until dismissed and offer a retry; the rest are brief. */
  sticky: boolean;
  retry?: () => void;
}

export const BASEMAP_NOTICE_TEXT: Record<BasemapNotice["kind"], string> = {
  style: "The street map didn't load. Showing aerial imagery instead.",
  "basemap-source": "The street map's tiles didn't load. Showing aerial imagery instead.",
  "basemap-tile": "Some street map tiles didn't load. Pan or zoom to try again.",
  aerial: "Some aerial imagery didn't load. Pan or zoom to try again.",
};

/** The slice of MapLibre's Map this module drives, so tests can pass a fake. */
export interface BasemapMapLike {
  on(type: "error" | "style.load", listener: (event: MapErrorEventLike) => void): unknown;
  setStyle(
    style: StyleSpecification | string,
    options?: { diff?: boolean; transformStyle?: typeof withSatelliteLayer }
  ): unknown;
  getLayer(id: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
}

export interface BasemapErrorHandlers {
  /** Called at most once per kind until a retry, so tile storms make one notice. */
  onNotice: (notice: BasemapNotice) => void;
  /** The aerial layer was switched on to stand in for the basemap. */
  onAerialForced: () => void;
  onStatus?: (status: BasemapStatus) => void;
  log?: Pick<Console, "warn" | "error">;
}

/**
 * Wires MapLibre's `error` and `style.load` events so a basemap outage is
 * explained instead of leaving a blank canvas:
 * - style URL fails: swap to the inline aerial-only style and say so, with Retry;
 * - a basemap source fails: turn the aerial layer on and say so, with Retry;
 * - tiles fail: one brief notice per kind, never one per tile.
 * Attaching an `error` listener silences MapLibre's own console reporting, so
 * errors this module does not handle are still logged with `console.error`.
 */
export function attachBasemapErrorHandling(
  map: BasemapMapLike,
  handlers: BasemapErrorHandlers
): { retry: () => void } {
  const log = handlers.log ?? console;
  const notified = new Set<BasemapNotice["kind"]>();
  let styleLoaded = false;
  let pending: "url" | "fallback" = "url";

  const setStatus = (status: BasemapStatus) => handlers.onStatus?.(status);

  const retry = () => {
    notified.delete("style");
    notified.delete("basemap-source");
    styleLoaded = false;
    pending = "url";
    setStatus("loading");
    // Not diffed: a failed style has nothing to diff against. The aerial
    // layer's visibility carries over from the fallback via transformStyle.
    map.setStyle(BASEMAP_STYLE_URL, { diff: false, transformStyle: withSatelliteLayer });
  };

  const notify = (kind: BasemapNotice["kind"]) => {
    if (notified.has(kind)) return;
    notified.add(kind);
    const sticky = kind === "style" || kind === "basemap-source";
    handlers.onNotice({
      kind,
      text: BASEMAP_NOTICE_TEXT[kind],
      sticky,
      ...(sticky ? { retry } : {}),
    });
  };

  map.on("style.load", () => {
    styleLoaded = true;
    setStatus(pending === "fallback" ? "fallback" : "ready");
  });

  map.on("error", (event) => {
    const kind = classifyMapError(event, styleLoaded);
    if (kind === "other") {
      log.error(event.error ?? event);
      return;
    }
    log.warn(`[basemap] ${kind} error`, event.error ?? event);

    if (kind === "style") {
      pending = "fallback";
      // transformStyle must be cleared: MapLibre defers a transformed swap until
      // the previous style loads, and the failed one never will. The fallback
      // already contains the aerial layer, switched on.
      map.setStyle(fallbackBasemapStyle(), { diff: false, transformStyle: undefined });
      handlers.onAerialForced();
    } else if (kind === "basemap-source" && map.getLayer(SATELLITE_LAYER_ID)) {
      map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", "visible");
      handlers.onAerialForced();
      setStatus("fallback");
    }
    notify(kind);
  });

  return { retry };
}
