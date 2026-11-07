"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type {
  Artifact,
  Confidence,
  EvidenceCard,
  LeadSurface,
  NoteClassification,
  RecalledHit,
  ReduceSummary,
  ScoutType,
  SuggestedAction,
} from "@/lib/core/types";
import type { GeoResult } from "@/lib/providers/types";
import { cardFreshness } from "@/lib/evidence/freshness";
import { apiGet, apiPost, ApiError, ConfidenceLegend, GradeChip } from "./ui";
import { CrosshairIcon, SatelliteIcon, SendIcon } from "./icons";
import {
  BASEMAP_STYLE_URL,
  MAP_CUSTOM_ATTRIBUTION,
  SATELLITE_LAYER_ID,
  withSatelliteLayer,
} from "@/lib/map/basemap";
import { attachBasemapErrorHandling } from "@/lib/map/basemapErrors";
import {
  clearPendingAddress,
  readPendingAddress,
  savePendingAddress,
} from "@/lib/map/pendingAddress";
import { Typeahead } from "@/lib/geocode/typeahead";
import { normalizeGeocodeQuery, MIN_GEOCODE_QUERY } from "@/lib/geocode/query";

// Toast model: success path is a green pill; failure path is a red, actionable
// pill that exposes the server's request id (so the user can paste it in a
// support reply) and a Retry CTA closure. Honest failures over silent ones.
type ToastValue =
  | { kind: "ok"; text: string }
  | { kind: "err"; text: string; requestId?: string; retry?: () => void };
import { ReviewTray } from "./ReviewTray";
import { ContactEditor } from "./ContactEditor";

type MapLibreModule = typeof import("maplibre-gl");

// MapLibre v6 is ESM-only. The main module is bundled by Next through this
// dynamic import (kept out of the initial chunk); its CSS is imported in
// app/layout.tsx. The web worker is resolved at runtime from import.meta.url,
// which a bundler cannot follow, so scripts/sync-maplibre-assets.mjs copies
// the worker module to public/vendor/maplibre and we point MapLibre at it.
const MAPLIBRE_WORKER_PATH = "/vendor/maplibre/maplibre-gl-worker.mjs";
let maplibreLoad: Promise<MapLibreModule> | null = null;

function loadMapLibre(): Promise<MapLibreModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("MapLibre requires a browser"));
  if (maplibreLoad) return maplibreLoad;

  maplibreLoad = import("maplibre-gl")
    .then((ml) => {
      // Version query busts caches whenever the installed MapLibre changes.
      ml.setWorkerUrl(`${MAPLIBRE_WORKER_PATH}?v=${ml.getVersion()}`);
      return ml;
    })
    .catch((error: unknown) => {
      maplibreLoad = null;
      throw error instanceof Error ? error : new Error("MapLibre failed to load");
    });

  return maplibreLoad;
}

const SCOUT_GROUPS: { key: ScoutType; label: string }[] = [
  { key: "property", label: "Property" },
  { key: "imagery", label: "Imagery" },
  { key: "people", label: "People" },
  { key: "market", label: "Market" },
  { key: "risk", label: "Risk" },
];

const QUICK_NOTES = [
  { label: "Tall grass", text: "Tall grass and mail piled up. Vacant-looking from the street. No photo yet." },
  { label: "Knocked, no answer", text: "Knocked, no answer. Yard is maintained, no visible repair distress." },
  { label: "Interested seller", text: "Owner said the house feels too big since the kids moved out." },
  { label: "Objection: timing", text: "Seller said timing is the main concern." },
];

const SAMPLE_SEARCHES = [
  "22125 Clarksburg Rd, Maryland",
  "Kampala, Uganda",
  "Karen Road, Nairobi",
];

export function MapWorkspace({
  onOpenTrace,
  onNavigate,
  showLaunchpad = true,
  onLeadOpenChange,
}: {
  onOpenTrace: (ref: string) => void;
  onNavigate: (view: "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline") => void;
  /** False while another onboarding surface (the setup checklist) is open. */
  showLaunchpad?: boolean;
  onLeadOpenChange?: (open: boolean) => void;
}) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const beaconRef = useRef<MapLibreMarker | null>(null);
  const mlRef = useRef<MapLibreModule | null>(null);
  const mapDiv = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<GeoResult[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "empty" | "error" | "limited" | "resolving"
  >("idle");
  const [lead, setLead] = useState<LeadSurface | null>(null);
  const [summary, setSummary] = useState<ReduceSummary | null>(null);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [working, setWorking] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [note, setNote] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [classification, setClassification] = useState<NoteClassification | null>(null);
  const [selectedAction, setSelectedAction] = useState<number>(0);

  const [draft, setDraft] = useState<Artifact | null>(null);
  const [sat, setSat] = useState(false);
  const [toast, setToast] = useState<ToastValue | null>(null);
  // Set when the scout pass needs a session (POST /api/lead → 401). The rail
  // stays open on the chosen address and explains how to continue.
  const [authNeeded, setAuthNeeded] = useState<GeoResult | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onLeadOpenChange?.(leadOpen);
  }, [leadOpen, onLeadOpenChange]);

  // ---- Map init -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await loadMapLibre();
      if (cancelled || !mapDiv.current) return;
      mlRef.current = ml;
      const map = new ml.Map({
        container: mapDiv.current,
        center: [10, 30],
        zoom: 2.2,
        // Esri imagery tops out at z19; without a cap the aerial layer renders
        // blank "data not yet available" squares past it.
        maxZoom: 19.4,
        pitch: 0,
        attributionControl: { compact: true, customAttribution: MAP_CUSTOM_ATTRIBUTION },
        style: BASEMAP_STYLE_URL,
        transformStyle: withSatelliteLayer,
      });
      mapRef.current = map;
      setMapReady(true);
      const container = mapDiv.current;
      container.dataset.basemap = "loading";
      attachBasemapErrorHandling(map, {
        onStatus: (status) => {
          container.dataset.basemap = status;
        },
        onAerialForced: () => setSat(true),
        onNotice: (notice) => {
          if (cancelled) return;
          if (notice.sticky) {
            setToast({ kind: "err", text: notice.text, retry: notice.retry });
            return;
          }
          // Brief tile notices never displace a toast already on screen.
          setToast((current) => current ?? { kind: "err", text: notice.text });
          setTimeout(() => {
            setToast((current) => (current?.text === notice.text ? null : current));
          }, 5000);
        },
      });
    })().catch((error) => {
      if (!cancelled) {
        setToast({
          kind: "err",
          text: error instanceof Error ? error.message : "The map failed to load.",
        });
      }
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Geocode autocomplete ----------------------------------------------
  // Typeahead decides when /api/geocode is called: after a 350 ms pause, from
  // 3 characters, capped per minute, never again for a picked suggestion.
  const typeaheadRef = useRef<Typeahead | null>(null);
  if (typeaheadRef.current === null && typeof window !== "undefined") {
    typeaheadRef.current = new Typeahead({
      fetchSuggestions: async (q, signal) => {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
        if (!res.ok) throw new Error(`geocode ${res.status}`);
        return ((await res.json()) as { results: GeoResult[] }).results;
      },
      onState: (state) => {
        setSuggest(state.results);
        setActiveSuggest(0);
        setSearchState(state.status === "ready" ? "idle" : state.status);
      },
    });
  }
  useEffect(() => () => typeaheadRef.current?.dispose(), []);
  useEffect(() => {
    typeaheadRef.current?.input(query);
  }, [query]);

  // ⌘K focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
        setSuggestOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const makeBeacon = useCallback((lng: number, lat: number, active: boolean) => {
    const ml = mlRef.current;
    const map = mapRef.current;
    if (!ml || !map) return;
    beaconRef.current?.remove();
    const el = document.createElement("div");
    el.className = "beacon";
    el.innerHTML = active
      ? '<div class="ring"></div><div class="core"></div>'
      : '<div class="core"></div>';
    beaconRef.current = new ml.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  }, []);

  const focusComposer = useCallback(() => {
    document.getElementById("lead-note")?.focus();
  }, []);

  const pulseToast = useCallback((message: string, ms = 3200) => {
    setToast({ kind: "ok", text: message });
    setTimeout(() => setToast(null), ms);
  }, []);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---- The magic loop -----------------------------------------------------
  const goTo = useCallback(
    async (target: GeoResult) => {
      typeaheadRef.current?.select(target.address);
      setQuery(target.address);
      setSuggestOpen(false);
      setAuthNeeded(null);
      setLeadOpen(true);
      setWorking(true);
      setCards([]);
      setSummary(null);
      setClassification(null);
      setDraft(null);
      setNote("");
      setExpanded(new Set());
      setLead({
        id: "pending",
        agent_id: "",
        address: target.address,
        locality: target.locality,
        lng: target.lng,
        lat: target.lat,
        h3_index: "",
        status: "researching",
        first_seen_at: "",
        last_worked_at: "",
      });

      const map = mapRef.current;
      if (map) {
        makeBeacon(target.lng, target.lat, true);
        if (reduceMotion) {
          map.jumpTo({ center: [target.lng, target.lat], zoom: 16.4 });
        } else {
          map.flyTo({
            center: [target.lng, target.lat],
            zoom: 16.4,
            pitch: 45,
            bearing: -17,
            duration: 1800,
            essential: true,
          });
        }
      }

      try {
        const d = await apiPost<{ lead: LeadSurface; summary: ReduceSummary; degraded?: boolean }>(
          "/api/lead",
          {
            address: target.address,
            lng: target.lng,
            lat: target.lat,
            locality: target.locality,
          }
        );
        setLead(d.lead);
        const all = d.summary.cards;
        for (let i = 0; i < all.length; i++) {
          const idx = i;
          setTimeout(() => setCards((prev) => [...prev, all[idx]!]), reduceMotion ? 0 : i * 90);
        }
        setTimeout(
          () => {
            setSummary(d.summary);
            setWorking(false);
            makeBeacon(target.lng, target.lat, false);
            pulseToast(
              d.degraded
                ? "Lead opened — scouts degraded, but the pipeline is still live."
                : "Pipeline started — scouts grounded the address."
            );
          },
          reduceMotion ? 0 : all.length * 90 + 100
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "The scout pass paused.";
        setWorking(false);
        makeBeacon(target.lng, target.lat, false);
        const requestId = error instanceof ApiError ? error.requestId : undefined;
        const status = error instanceof ApiError ? error.status : 0;
        const auth = status === 401 || /authentication required|unauthor/i.test(message);
        if (auth) {
          // Keep the rail open on this address and say what to do next. The
          // choice is remembered for this tab so it resumes after sign-in.
          savePendingAddress(target);
          setAuthNeeded(target);
          return;
        }
        setLead(null); // clear the optimistic placeholder so the UI isn't stuck
        setLeadOpen(false);
        // Failure toast sticks until the user clicks Retry or dismisses
        // (auto-hide hides the retry CTA before they can use it).
        setToast({
          kind: "err",
          text: `Couldn't load this address — ${message}`,
          requestId,
          retry: () => goTo(target),
        });
      }
    },
    [makeBeacon, pulseToast, reduceMotion]
  );

  // Enter with nothing suggested: one explicit lookup (Nominatim in production).
  const resolveTyped = useCallback(async () => {
    const q = normalizeGeocodeQuery(query);
    if (q.length < MIN_GEOCODE_QUERY) return;
    setSearchState("resolving");
    try {
      const d = await apiGet<{ result: GeoResult | null }>(
        `/api/geocode?q=${encodeURIComponent(q)}&resolve=1`
      );
      if (d.result) void goTo(d.result);
      else setSearchState("empty");
    } catch (error) {
      setSearchState(error instanceof ApiError && error.status === 429 ? "limited" : "error");
    }
  }, [goTo, query]);

  // Resume an address picked before the Google sign-in round trip. Signed in:
  // run the scout pass. Still signed out (cancelled or failed sign-in): show
  // the same sign-in panel on that address instead of dropping it.
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (!mapReady || resumeChecked.current) return;
    resumeChecked.current = true;
    const pending = readPendingAddress();
    if (!pending) return;
    let cancelled = false;
    apiGet<{ user: unknown | null }>("/api/auth/session")
      .catch(() => ({ user: null }))
      .then((session) => {
        if (cancelled) return;
        if (session.user) {
          clearPendingAddress();
          void goTo(pending);
          return;
        }
        typeaheadRef.current?.select(pending.address);
        setQuery(pending.address);
        setLead({
          id: "pending",
          agent_id: "",
          address: pending.address,
          locality: pending.locality,
          lng: pending.lng,
          lat: pending.lat,
          h3_index: "",
          status: "researching",
          first_seen_at: "",
          last_worked_at: "",
        });
        setLeadOpen(true);
        setAuthNeeded(pending);
        makeBeacon(pending.lng, pending.lat, false);
        mapRef.current?.jumpTo({ center: [pending.lng, pending.lat], zoom: 16.4 });
      });
    return () => {
      cancelled = true;
    };
  }, [goTo, makeBeacon, mapReady]);

  const dismissAuthPanel = useCallback(() => {
    clearPendingAddress();
    setAuthNeeded(null);
    setLead(null);
    setLeadOpen(false);
    beaconRef.current?.remove();
    beaconRef.current = null;
  }, []);

  // Other surfaces (Pipeline cards, the getting-started checklist) can ask
  // the always-mounted map to open a lead via a window event.
  useEffect(() => {
    const onOpenLead = (event: Event) => {
      const detail = (event as CustomEvent<Partial<GeoResult>>).detail;
      if (
        !detail ||
        typeof detail.address !== "string" ||
        !Number.isFinite(detail.lng) ||
        !Number.isFinite(detail.lat)
      )
        return;
      goTo({
        address: detail.address,
        locality: detail.locality,
        lng: detail.lng as number,
        lat: detail.lat as number,
      });
    };
    window.addEventListener("forleads:open-lead", onOpenLead);
    return () => window.removeEventListener("forleads:open-lead", onOpenLead);
  }, [goTo]);

  // ---- Note → next-best-action -------------------------------------------
  const submitNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !lead || lead.id === "pending") return;
      setNote(text);
      setClassification(null);
      setThinking("Reading your note…");
      setTimeout(() => setThinking("Classifying the situation…"), 500);
      setTimeout(() => setThinking("Choosing the next best action…"), 1000);
      try {
        const d = await apiPost<{ classification: NoteClassification }>("/api/notes", {
          leadId: lead.id,
          body: text,
        });
        setTimeout(() => {
          setThinking(null);
          setClassification(d.classification);
          setSelectedAction(0);
          pulseToast("Next-best action ready — review it below.");
        }, 1300);
      } catch (e) {
        setThinking(null);
        const msg = e instanceof Error ? e.message : String(e);
        const requestId = e instanceof ApiError ? e.requestId : undefined;
        const status = e instanceof ApiError ? e.status : 0;
        const auth = status === 401 || /authentication required|unauthor/i.test(msg);
        if (auth) {
          setToast({ kind: "err", text: "Sign in to add notes" });
          setTimeout(() => setToast(null), 3500);
        } else {
          setToast({
            kind: "err",
            text: `Couldn't classify the note — ${msg}`,
            requestId,
            retry: () => submitNote(text),
          });
        }
      }
    },
    [lead, pulseToast]
  );

  const draftIt = useCallback(
    async (action: SuggestedAction) => {
      if (!lead || !classification) return;
      try {
        const d = await apiPost<{ artifact: Artifact }>("/api/draft", {
          leadId: lead.id,
          situation: classification.situation,
          actionType: action.type,
          situationConfidence: classification.confidence,
        });
        setDraft(d.artifact);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const requestId = e instanceof ApiError ? e.requestId : undefined;
        setToast({
          kind: "err",
          text: `Couldn't draft this action — ${msg}`,
          requestId,
          retry: () => draftIt(action),
        });
      }
    },
    [classification, lead]
  );

  const grouped = SCOUT_GROUPS.map((group) => ({
    ...group,
    cards: cards.filter((card) => card.scout === group.key),
  })).filter((group) => group.cards.length > 0);

  const hasContactChannel = Boolean(lead?.contact?.email || lead?.contact?.phone);
  const needsContact = Boolean(lead && lead.id !== "pending" && !hasContactChannel);
  const focusContactEditor = useCallback(() => {
    document
      .querySelector('[data-testid="contact-editor"]')
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("contact-name")?.focus({ preventScroll: true });
  }, []);

  const pipelineSteps = [
    {
      label: "Ground lead",
      state: summary ? "Done" : working ? "Live" : leadOpen ? "Queued" : "Next",
      detail: summary
        ? `Overall grade ${summary.grade}${summary.scoutCount ? ` · ${summary.scoutCount} scouts` : ""}`
        : "Resolve the address and launch the scout pass.",
      action: () => {
        if (lead && mapRef.current) {
          mapRef.current.flyTo({ center: [lead.lng, lead.lat], zoom: 16.4, pitch: 45, duration: 1000 });
        }
      },
      disabled: !lead,
    },
    {
      label: "Add known contact",
      state: hasContactChannel ? "Done" : lead && lead.id !== "pending" ? "Next" : "Locked",
      detail: hasContactChannel
        ? "Contact on file — approved drafts can reach a real person."
        : "Attach who you're talking to. Approvals can't send without an email or phone.",
      action: focusContactEditor,
      disabled: !lead || lead.id === "pending",
    },
    {
      label: "Capture note",
      state: classification ? "Done" : thinking ? "Live" : lead && lead.id !== "pending" ? "Next" : "Locked",
      detail: "Log the field note that tells the system what happened on the ground.",
      action: focusComposer,
      disabled: !lead || lead.id === "pending",
    },
    {
      label: "Draft outreach",
      state: draft ? "Done" : classification ? "Next" : "Locked",
      detail: "Let the agent prepare the next compliant touch without auto-sending it.",
      action: () => onNavigate("inbox"),
      disabled: !classification,
    },
    {
      label: "Track pipeline",
      state: lead && lead.id !== "pending" ? "Ready" : "Locked",
      detail: "Keep the next commitment visible in Pipeline, Inbox, and Loop Studio.",
      action: () => onNavigate("pipeline"),
      disabled: !lead || lead.id === "pending",
    },
  ];

  return (
    <>
      <div id="map" ref={mapDiv} />

      {!leadOpen && showLaunchpad && (
        <div className="launchpad">
          <div className="launch-kicker">Operator launchpad</div>
          <div className="launch-title">Type an address to open its lead brief.</div>
          <div className="launch-copy">
            After you sign in with Google, Forleads grounds the lead, runs the scout pass, asks
            for the field signal, and drafts the next outreach for your approval.
          </div>
          <div className="launch-actions">
            {SAMPLE_SEARCHES.map((sample) => (
              <button
                key={sample}
                className="launch-chip"
                onClick={() => {
                  setQuery(sample);
                  setSuggestOpen(true);
                  document.getElementById("search-input")?.focus();
                }}
              >
                {sample}
              </button>
            ))}
          </div>
          <div className="launch-nav">
            <button className="minibtn" onClick={() => onNavigate("pipeline")}>
              View pipeline board
            </button>
            <button className="minibtn" onClick={() => onNavigate("inbox")}>
              Review drafted work
            </button>
            <button className="minibtn" onClick={() => onNavigate("loops")}>
              Inspect follow-up loops
            </button>
          </div>
          <div className="launch-steps">
            <div className="launch-step">
              <div className="launch-step-num">1</div>
              <div>
                <div className="launch-step-title">Ground the address</div>
                <div className="launch-step-copy">Search a street, city, or typed property address.</div>
              </div>
            </div>
            <div className="launch-step">
              <div className="launch-step-num">2</div>
              <div>
                <div className="launch-step-title">Launch the scout pass</div>
                <div className="launch-step-copy">Property, imagery, people, market, and risk should appear fast.</div>
              </div>
            </div>
            <div className="launch-step">
              <div className="launch-step-num">3</div>
              <div>
                <div className="launch-step-title">Log the field signal</div>
                <div className="launch-step-copy">Use a note to drive the next-best action instead of guessing.</div>
              </div>
            </div>
            <div className="launch-step">
              <div className="launch-step-num">4</div>
              <div>
                <div className="launch-step-title">Approve the next touch</div>
                <div className="launch-step-copy">Draft first, review second, then move the lead through pipeline.</div>
              </div>
            </div>
          </div>
          <div className="launch-legal">
            <a href="/privacy">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/terms">Terms of Service</a>
          </div>
        </div>
      )}

      <div id="cmd">
        <div className="pill">
          <span className="logo">
            For<b>leads</b>
          </span>
          <input
            id="search-input"
            value={query}
            placeholder="Search an address, anywhere on Earth…"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            role="combobox"
            aria-expanded={suggestOpen && suggest.length > 0}
            aria-controls="suggest"
            aria-activedescendant={suggest.length > 0 ? `sug-${activeSuggest}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggest.length > 0) {
                e.preventDefault();
                setSuggestOpen(true);
                setActiveSuggest((i) => (i + 1) % suggest.length);
              }
              if (e.key === "ArrowUp" && suggest.length > 0) {
                e.preventDefault();
                setActiveSuggest((i) => (i - 1 + suggest.length) % suggest.length);
              }
              if (e.key === "Enter" && suggest[activeSuggest]) void goTo(suggest[activeSuggest]);
              else if (e.key === "Enter" && searchState === "empty") void resolveTyped();
              if (e.key === "Escape") setSuggestOpen(false);
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
        <div
          className={`${
            suggestOpen && (suggest.length > 0 || searchState !== "idle") ? "open" : ""
          }`}
          id="suggest"
          role="listbox"
          aria-label="Address suggestions"
        >
          {searchState === "loading" && (
            <div className="suggest-state">Searching the live address index…</div>
          )}
          {searchState === "empty" && (
            <div className="suggest-state">
              No suggestions. Add the city and country, or press Enter to look up this exact
              address.
            </div>
          )}
          {searchState === "error" && (
            <div className="suggest-state error">
              Address search is unavailable. Check your connection and retry.
            </div>
          )}
          {searchState === "limited" && (
            <div className="suggest-state">
              That&apos;s a lot of searches in a minute. Pause a moment, then keep typing.
            </div>
          )}
          {searchState === "resolving" && (
            <div className="suggest-state">Looking up that exact address…</div>
          )}
          {suggest.map((p, i) => (
            <div
              className={`sug ${i === activeSuggest ? "active" : ""}`}
              key={`${p.address}-${i}`}
              id={`sug-${i}`}
              onClick={() => void goTo(p)}
              onMouseEnter={() => setActiveSuggest(i)}
              role="option"
              aria-selected={i === activeSuggest}
            >
              <span className="ico">
                <CrosshairIcon size={14} />
              </span>
              <div>
                <div className="t">{p.address}</div>
                <div className="s">{p.locality}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="tools">
        <button
          type="button"
          className={`tool ${sat ? "on" : ""}`}
          title="Aerial toggle"
          aria-label="Toggle aerial imagery"
          aria-pressed={sat}
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            // The basemap style loads over the network; until it has, there is
            // no aerial layer to flip, so leave the toggle state unchanged.
            if (!map.getLayer(SATELLITE_LAYER_ID)) return;
            const next = !sat;
            setSat(next);
            map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", next ? "visible" : "none");
          }}
        >
          <SatelliteIcon />
        </button>
        <button
          type="button"
          className="tool"
          title="Recenter on lead"
          aria-label="Recenter on lead"
          onClick={() => {
            if (lead && mapRef.current) {
              mapRef.current.flyTo({ center: [lead.lng, lead.lat], zoom: 16.4, pitch: 45, duration: 1000 });
            }
          }}
        >
          <CrosshairIcon />
        </button>
      </div>

      <div id="lead" className={leadOpen ? "open" : ""}>
        <div className="lead-head">
          <div className="lead-addr">{lead?.address ?? "—"}</div>
          <div className="lead-sub">
            <span className="status-dot" />
            <span>
              {authNeeded ? "Sign-in needed" : working ? "Launching pipeline…" : "Grounded"}
            </span>
            <span className="grade-overall">
              {summary ? `overall grade ${summary.grade} · ${summary.scoutCount} scouts` : ""}
            </span>
          </div>
          {summary?.recallNote ? (
            <div className="recall-note" data-testid="recall-note">{summary.recallNote}</div>
          ) : null}
          {summary?.neighborhoodNote ? (
            <div
              className="neighborhood-note"
              data-testid="neighborhood-note"
              title="Cross-lead area priors from grounded market sources; parcel and personal facts stay lead-scoped"
            >
              ⌖ {summary.neighborhoodNote}
            </div>
          ) : null}
          {summary?.recalledHits && summary.recalledHits.length > 0 ? (
            <RecalledMemoriesChip
              hits={summary.recalledHits}
              onJumpToCard={(ref) => {
                // Scroll the matching evidence card into view if it exists in
                // the current rail. Best-effort; not all recalled hits map to
                // currently rendered cards (e.g. older grounded facts).
                const idx = cards.findIndex((c) => c.id === ref);
                if (idx < 0) return;
                document
                  .getElementById(`card-${idx}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          ) : null}
          <ConfidenceLegend />
        </div>

        <div className="lead-body">
          {authNeeded ? (
            <section
              className="auth-gate"
              role="region"
              aria-labelledby="auth-gate-title"
              data-testid="auth-gate"
            >
              <div className="ops-kicker">Sign in to continue</div>
              <h2 className="auth-gate-title" id="auth-gate-title">
                Research needs a Forleads workspace
              </h2>
              <p className="auth-gate-copy">
                The scout pass saves this address, its evidence and your notes to your own
                workspace, so it runs after you sign in with Google. Nothing is researched or
                saved until then.
              </p>
              <p className="auth-gate-copy">
                We&apos;ll keep <b>{authNeeded.address}</b> selected and pick it up when you come
                back.
              </p>
              <div className="auth-gate-actions">
                <a
                  className="minibtn primary auth-gate-cta"
                  href="/api/auth/google/login"
                  onClick={() => savePendingAddress(authNeeded)}
                >
                  <span className="g" aria-hidden="true">G</span> Continue with Google
                </a>
                <button type="button" className="minibtn" onClick={dismissAuthPanel}>
                  Not now
                </button>
              </div>
              <p className="auth-gate-fine">
                Google asks for Gmail draft and Calendar access so approved follow-ups land in
                your own account. Forleads never sends without your approval.{" "}
                <a href="/privacy">Privacy</a>
              </p>
            </section>
          ) : null}

          {!authNeeded && lead && lead.id !== "pending" ? (
            <ContactEditor
              lead={lead}
              onSaved={(updated) => {
                setLead(updated);
                setToast({ kind: "ok", text: "Contactability passport updated." });
              }}
              onError={(text) => setToast({ kind: "err", text })}
            />
          ) : null}

          {!authNeeded && (
          <div className="ops-strip">
            <div className="ops-kicker">Next actions</div>
            <div className="ops-title">
              {working
                ? "Pipeline is launching now."
                : classification
                  ? "Operator signal captured. Draft the next touch."
                  : "Ground it, capture the field signal, then push the lead forward."}
            </div>
            <div className="ops-copy">
              Next fastest free move: import an open feed, capture field evidence, approve a draft,
              or run a follow-up loop.
            </div>
            <div className="ops-actions">
              {needsContact && (
                <button className="minibtn primary" onClick={focusContactEditor}>
                  Add known contact
                </button>
              )}
              <button
                className={`minibtn ${needsContact ? "" : "primary"}`}
                onClick={focusComposer}
                disabled={!lead || lead.id === "pending"}
              >
                Capture field signal
              </button>
              <button className="minibtn" onClick={() => onNavigate("inbox")} disabled={!classification}>
                Review inbox
              </button>
              <button className="minibtn" onClick={() => onNavigate("loops")} disabled={!lead || lead.id === "pending"}>
                Run loops
              </button>
              <button className="minibtn" onClick={() => onNavigate("pipeline")} disabled={!lead || lead.id === "pending"}>
                Open pipeline
              </button>
            </div>
            <div className="ops-steps">
              {pipelineSteps.map((step) => (
                <button
                  key={step.label}
                  className="ops-step"
                  onClick={step.action}
                  disabled={step.disabled}
                >
                  <div className="ops-step-top">
                    <span>{step.label}</span>
                    <span className="ops-step-state">{step.state}</span>
                  </div>
                  <div className="ops-step-copy">{step.detail}</div>
                </button>
              ))}
            </div>
          </div>
          )}

          {grouped.map((group) => (
            <div key={group.key}>
              <div className="scout-group-label">{group.label}</div>
              {group.cards.map((card, index) => {
                const globalIdx = cards.indexOf(card);
                const isOpen = expanded.has(globalIdx);
                const freshness = cardFreshness(card);
                return (
                  <div
                    id={`card-${globalIdx}`}
                    className={`card ${card.confidence === "D" ? "gradeD" : ""}`}
                    key={`${group.key}-${index}`}
                  >
                    <div className="row1">
                      <span className="claim">{card.claim}</span>
                      <span
                        className="val"
                        style={card.value === null ? { color: "var(--grade-d)" } : undefined}
                      >
                        {card.value === null ? "unverified" : String(card.value)}
                      </span>
                    </div>
                    <div className="meta">
                      <GradeChip grade={card.confidence as Confidence} />
                      <span className="src">
                        {card.sources.length
                          ? `© ${card.sources.map((source) => source.name).join(" · ")}`
                          : "no source"}
                      </span>
                      <span className={`source-freshness ${freshness.status}`}>{freshness.label}</span>
                      {card.reasoning && (
                        <button
                          className="why"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              next.has(globalIdx) ? next.delete(globalIdx) : next.add(globalIdx);
                              return next;
                            })
                          }
                        >
                          {isOpen ? "hide" : "why?"}
                        </button>
                      )}
                    </div>
                    {card.confidence === "D" && card.reasoning && <div className="gap-note">{card.reasoning}</div>}
                    {card.media?.length ? (
                      <div className="evidence-media">
                        {card.media.map((media, mediaIndex) => (
                          <figure key={`${media.url}-${mediaIndex}`}>
                            <img src={media.url} alt={media.alt} loading="lazy" />
                            <figcaption>
                              {media.captured_at ? `${media.captured_at} · ` : ""}
                              {media.attribution ?? media.source}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    {isOpen && card.confidence !== "D" && card.reasoning && (
                      <div className="reasoning">{card.reasoning}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {summary?.breakout && (
            <div className="gap-note" style={{ margin: "12px 6px" }}>
              Break-out ({summary.breakout.kind === "deeper_scout" ? "deeper scout pass" : "needs your input"}): {summary.breakout.reason}
              {summary.breakout.question ? ` — "${summary.breakout.question}"` : ""}
            </div>
          )}
        </div>

        <div className="lead-foot" hidden={Boolean(authNeeded)}>
          <div className="note-box">
            <textarea
              id="lead-note"
              value={note}
              placeholder="Capture field signal… e.g. 'tall grass, vacant-looking, neighbor says owner moved'"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submitNote(note);
              }}
            />
            <button
              className="mic"
              title="Log this field note (⌘⏎)"
              aria-label="Log field note"
              onClick={() => void submitNote(note)}
              disabled={!lead || lead.id === "pending" || !note.trim()}
            >
              <SendIcon size={16} />
            </button>
          </div>
          <div className="quick">
            {QUICK_NOTES.map((quickNote) => (
              <button
                key={quickNote.label}
                onClick={() => void submitNote(quickNote.text)}
                disabled={!lead || lead.id === "pending"}
              >
                {quickNote.label}
              </button>
            ))}
          </div>

          {thinking && (
            <div className="thinking">
              <span className="orb" />
              <span>{thinking}</span>
            </div>
          )}

          {classification && (
            <div className="nba">
              <div className="h">Situation · confidence {classification.confidence.toFixed(2)}</div>
              <div className="situ">{classification.situation.replace(/[_:]/g, " ")}</div>
              {classification.suggested_actions.map((action, index) => (
                <div
                  className={`opt ${selectedAction === index ? "sel" : ""}`}
                  key={index}
                  onClick={() => setSelectedAction(index)}
                >
                  <span className="r" />
                  {action.label}
                  {action.recommended ? "  (recommended)" : ""}
                </div>
              ))}
              <button
                className="draftbtn"
                onClick={() => draftIt(classification.suggested_actions[selectedAction]!)}
              >
                Draft it →
              </button>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <ReviewTray
          artifact={draft}
          onClose={() => setDraft(null)}
          onOpenTrace={onOpenTrace}
          onApproved={(message) => {
            setDraft(null);
            pulseToast(message);
            if (lead) setLead({ ...lead, status: "contacted" });
          }}
        />
      )}

      <div
        id="toast"
        className={`${toast ? "show " : ""}${toast?.kind === "err" ? "err" : ""}`}
        role={toast?.kind === "err" ? "alert" : undefined}
      >
        {toast?.kind === "err" ? (
          <>
            <span>⚠</span>
            <span>{toast.text}</span>
            {toast.requestId ? (
              <span className="req" title="request id — paste in support replies">
                {toast.requestId.slice(0, 8)}
              </span>
            ) : null}
            {toast.retry ? (
              <button
                type="button"
                className="retry"
                onClick={() => {
                  const r = toast.retry!;
                  setToast(null);
                  r();
                }}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="retry"
              aria-label="dismiss"
              onClick={() => setToast(null)}
              style={{ background: "transparent", padding: "4px 6px" }}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            ✓ <span>{toast?.text}</span>
          </>
        )}
      </div>
    </>
  );
}

// Expandable chip rendered under the FOMO recall note. Default = collapsed
// (just the "▸ 8 prior signals" pill). Click → expands the list so the agent
// can SEE what shortcut was taken. Clicking an evidence-kind hit jumps to the
// matching card in the current rail (when it's currently rendered).
function RecalledMemoriesChip({
  hits,
  onJumpToCard,
}: {
  hits: RecalledHit[];
  onJumpToCard: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };
  return (
    <div className="recalled-chip" data-testid="recalled-chip">
      <button
        type="button"
        className="recalled-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span>
          {hits.length} prior signal{hits.length === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <ul className="recalled-list">
          {hits.map((h) => {
            const isClickable = h.kind === "evidence" && !!h.ref;
            return (
              <li
                key={h.memoryId}
                className={`recalled-row ${isClickable ? "clickable" : ""}`}
                onClick={isClickable ? () => onJumpToCard(h.ref!) : undefined}
                onKeyDown={
                  isClickable
                    ? (event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onJumpToCard(h.ref!);
                      }
                    : undefined
                }
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
              >
                {h.kind === "evidence" && h.confidence ? (
                  <span className={`mini-chip g${h.confidence}`}>{h.confidence}</span>
                ) : (
                  <span className="mini-chip note">note</span>
                )}
                <span className="recalled-text" title={h.text}>
                  {h.text}
                </span>
                <span className="recalled-date">{fmtDate(h.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
