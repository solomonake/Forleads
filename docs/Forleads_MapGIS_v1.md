# 07 · Forleads — The Living Map & GIS Spec (v1)

> The map is the product's home and its soul. This doc specifies the cinematic behavior, the layers, and the GIS plumbing so any engineer reproduces the exact feel and the exact correctness.

## 1. The cinematic arrival (the signature moment)
**Sequence on address select:**
1. Photon autocomplete resolves → cached geocode returns `{lng, lat, bbox}`.
2. `map.flyTo({ center, zoom: 17.5, pitch: 45, bearing: small, duration: 1800, easing: ease-fly })` — a *descend-onto-the-house* move (zoom + tilt together).
3. On `moveend`: drop the **target pin**, emit one **arrival pulse** (aqua ring), highlight the **active footprint** (OSM building polygon) at 12% aqua fill + 1px stroke.
4. The **Scout Beacon** (breathing aqua glow) is already active from step 1 — because `/dispatch` fired the instant the address resolved. **The 1.8 s flight is the scout loading window.** Cards begin streaming as the camera lands.

**Honesty rule (Lena's mandate):** the beacon breathes only while real scouts are running and stops the instant they settle. We never animate "discovery" that already happened from cache; a cache hit lands instantly and the beacon simply doesn't appear.

**Reduced motion:** replace the flight with a 250 ms cross-fade to the target; everything else identical.

## 2. Layer stack (bottom → top)
| Z | Layer | Source | Notes / attribution |
|---|---|---|---|
| 0 | Basemap (ink) | Protomaps PMTiles (CC0) | Self-hosted single file; dark theme tuned to `--bg` |
| 1 | Aerial (toggle) | Esri World Imagery | ~1 m many regions; **"Imagery © Esri"** required |
| 2 | Building extrude | OSM buildings | Subtle 3D at zoom ≥ 16 |
| 3 | Active footprint | OSM polygon | Aqua highlight for the tapped surface |
| 4 | Territory heat (farm) | H3 aggregation of leads/signals | Optional; pan-time ambient signals |
| 5 | Lead pins | lead_surface | Colored by pipeline status |
| 6 | Scout beacon + pulses | runtime | Aqua; agent-activity only |
| 7 | Street-imagery markers | Mapillary coverage | Tap → street view sheet; **CC-BY-SA attribution** |

**Attribution bar** (always visible, small, bottom-left): "© OpenStreetMap · Imagery © Esri · Street imagery © Mapillary (CC-BY-SA)". Non-negotiable per licenses.

## 3. Imagery behavior ("high-res images of the address")
- Tapping the imagery marker opens a **Street sheet**: Mapillary image at the nearest point, swipe along the sequence, and an Esri aerial inset. Faces/plates are pre-blurred by Mapillary.
- The **Imagery Scout** also pulls the best street + aerial frame and runs a vision caption → grade-graded condition/style cards.
- **Graceful degradation:** no Mapillary coverage → show aerial + "No street imagery here yet — be the first to add it" (link to Mapillary capture). Never a broken tile.

## 4. GIS plumbing (correctness)
- **Projection:** Web Mercator (EPSG:3857) for rendering; store geometry as `geography` (EPSG:4326) in PostGIS for true distance.
- **Spatial index:** PostGIS GIST on `lead_surface.geom`; **H3** (`h3_index`, res ~9–11) for territory aggregation, ambient-scout batching, and cache keys.
- **Geocoding:** self-hosted **Photon** (autocomplete, typo-tolerant) + **Nominatim** (structured + reverse). All results cached by normalized address and by H3 cell to respect limits and cut cost.
- **Reverse geocode on map tap:** tap empty map → Nominatim reverse → create/lookup a Lead Surface at that point.
- **Coverage honesty:** a per-region data-density indicator; in thin regions the UI says so rather than faking richness.

## 5. Territory / farming view
- Zoom out → pins cluster; an optional **H3 heat layer** shows lead density and (if enabled) lawful "likely-to-sell" signal density.
- Lasso/polygon select → bulk-create a Watcher or queue ambient scouting over the area (cheap-only, budget-capped).

## 6. Performance
- PMTiles served from CDN/object storage → no tile server, instant cold start.
- Cache-first everything (geocode, imagery, OSM attributes) keyed by H3.
- Ambient scouts run only on idle + within budget; panning never triggers paid calls.
- Target: basemap interactive < 1 s on 4G; fly-to a steady 60 fps (GPU vector tiles).

## 7. Platform parity (one style, two renderers)
- A **single `style.json`** (Protomaps + our overrides) is consumed by **MapLibre GL JS** (web) and **MapLibre React Native** (native). The `<Map>` adapter exposes one API: `flyTo`, `setLayer`, `onTap`, `addBeacon`. Pixel-consistent across web/iOS/Android.

## 8. What "global from day one" really means here
- **Always works globally:** basemap, geocoding (coverage-varying), aerial, street imagery where it exists, OSM building/land-use facts.
- **Varies by market:** comps/price depth (provider-adapter), parcel/owner records (lawful availability differs).
- The map **never breaks** in a thin region; it just grades lower and says so. That honesty is the brand.
