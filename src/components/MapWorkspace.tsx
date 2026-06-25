"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
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
import { apiGet, apiPost, ApiError, ConfidenceLegend, GradeChip } from "./ui";

// Toast model: success path is a green pill; failure path is a red, actionable
// pill that exposes the server's request id (so the user can paste it in a
// support reply) and a Retry CTA closure. Honest failures over silent ones.
type ToastValue =
  | { kind: "ok"; text: string }
  | { kind: "err"; text: string; requestId?: string; retry?: () => void };
import { ReviewTray } from "./ReviewTray";

const SCOUT_GROUPS: { key: ScoutType; label: string }[] = [
  { key: "property", label: "Property" },
  { key: "imagery", label: "Imagery" },
  { key: "people", label: "People" },
  { key: "market", label: "Market" },
  { key: "risk", label: "Risk" },
];

const QUICK_NOTES = [
  { label: "Knocked, no answer", text: "Knocked, no answer. Nice yard, well kept, kids' bikes out front." },
  { label: "Interested seller", text: "Owner home — said the house feels too big since the kids moved out." },
  { label: "Objection: timing", text: "Seller worried it's the wrong time to sell." },
];

const SAMPLE_SEARCHES = [
  "22125 Clarksburg Rd, Maryland",
  "Kampala, Uganda",
  "Karen Road, Nairobi",
];

export function MapWorkspace({
  onOpenTrace,
  onNavigate,
}: {
  onOpenTrace: (ref: string) => void;
  onNavigate: (view: "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline") => void;
}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const beaconRef = useRef<maplibregl.Marker | null>(null);
  const mlRef = useRef<typeof maplibregl | null>(null);
  const mapDiv = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<GeoResult[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "empty" | "error"
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

  // ---- Map init -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (cancelled || !mapDiv.current) return;
      mlRef.current = ml;
      const map = new ml.Map({
        container: mapDiv.current,
        center: [10, 30],
        zoom: 2.2,
        pitch: 0,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tileSize: 256,
              tiles: [
                "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              ],
              attribution:
                "© OpenStreetMap · © CARTO · Imagery © Esri · Street © Mapillary (CC-BY-SA)",
            },
            sat: {
              type: "raster",
              tileSize: 256,
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              attribution: "Imagery © Esri",
            },
          },
          layers: [
            { id: "carto", type: "raster", source: "carto" },
            { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
          ],
        },
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Geocode autocomplete ----------------------------------------------
  useEffect(() => {
    let active = true;
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSuggest([]);
      setSearchState("idle");
      return () => {
        active = false;
      };
    }
    setSearchState("loading");
    const t = setTimeout(async () => {
      try {
        const d = await apiGet<{ results: GeoResult[] }>(
          `/api/geocode?q=${encodeURIComponent(query)}`
        );
        if (active) {
          setSuggest(d.results);
          setSearchState(d.results.length > 0 ? "idle" : "empty");
        }
      } catch {
        if (active) {
          setSuggest([]);
          setSearchState("error");
        }
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(t);
    };
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
      setQuery(target.address);
      setSuggestOpen(false);
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
        setLead(null); // clear the optimistic placeholder so the UI isn't stuck
        setLeadOpen(false);
        const requestId = error instanceof ApiError ? error.requestId : undefined;
        const status = error instanceof ApiError ? error.status : 0;
        const auth = status === 401 || /authentication required|unauthor/i.test(message);
        if (auth) {
          setToast({ kind: "err", text: "Sign in to research this address" });
          setTimeout(() => setToast(null), 3500);
        } else {
          setToast({
            kind: "err",
            text: `Couldn't load this address — ${message}`,
            requestId,
            retry: () => goTo(target),
          });
          // Failure toast sticks until the user clicks Retry or dismisses
          // (auto-hide hides the retry CTA before they can use it).
        }
      }
    },
    [makeBeacon, pulseToast, reduceMotion]
  );

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

      {!leadOpen && (
        <div className="launchpad">
          <div className="launch-kicker">Operator launchpad</div>
          <div className="launch-title">Type any address and Forleads should open the pipeline immediately.</div>
          <div className="launch-copy">
            This isn&apos;t a passive map. It should ground the lead, show the scout pass, ask for
            the field signal, and tee up the next outreach without losing operator control.
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggest[0]) void goTo(suggest[0]);
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
              No address matches. Try a street, city, and country.
            </div>
          )}
          {searchState === "error" && (
            <div className="suggest-state error">
              Address search is unavailable. Check your connection and retry.
            </div>
          )}
          {suggest.map((p, i) => (
            <div
              className={`sug ${i === 0 ? "active" : ""}`}
              key={`${p.address}-${i}`}
              onClick={() => void goTo(p)}
              role="option"
              aria-selected={i === 0}
            >
              <span className="ico">⌖</span>
              <div>
                <div className="t">{p.address}</div>
                <div className="s">{p.locality}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="tools">
        <div
          className={`tool ${sat ? "on" : ""}`}
          title="Aerial toggle"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const next = !sat;
            setSat(next);
            map.setLayoutProperty("sat", "visibility", next ? "visible" : "none");
          }}
        >
          🛰
        </div>
        <div
          className="tool"
          title="Recenter"
          onClick={() => {
            if (lead && mapRef.current) {
              mapRef.current.flyTo({ center: [lead.lng, lead.lat], zoom: 16.4, pitch: 45, duration: 1000 });
            }
          }}
        >
          ⌖
        </div>
      </div>

      <div id="lead" className={leadOpen ? "open" : ""}>
        <div className="lead-head">
          <div className="lead-addr">{lead?.address ?? "—"}</div>
          <div className="lead-sub">
            <span className="status-dot" />
            <span>{working ? "Launching pipeline…" : "Grounded"}</span>
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
          <div className="ops-strip">
            <div className="ops-kicker">Next actions</div>
            <div className="ops-title">
              {working
                ? "Pipeline is launching now."
                : classification
                  ? "Operator signal captured. Draft the next touch."
                  : "Ground it, add the field note, then push the lead forward."}
            </div>
            <div className="ops-copy">
              The UI should always tell the operator what to do next instead of leaving them with
              a dead-end data panel.
            </div>
            <div className="ops-actions">
              <button className="minibtn primary" onClick={focusComposer} disabled={!lead || lead.id === "pending"}>
                Add field note
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

          {grouped.map((group) => (
            <div key={group.key}>
              <div className="scout-group-label">{group.label}</div>
              {group.cards.map((card, index) => {
                const globalIdx = cards.indexOf(card);
                const isOpen = expanded.has(globalIdx);
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
              Break-out ({summary.breakout.kind}): {summary.breakout.reason}
              {summary.breakout.question ? ` — "${summary.breakout.question}"` : ""}
            </div>
          )}
        </div>

        <div className="lead-foot">
          <div className="note-box">
            <textarea
              id="lead-note"
              value={note}
              placeholder="Add a note… e.g. 'knocked, no answer, nice yard'"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submitNote(note);
              }}
            />
            <button
              className="mic"
              title="Voice note (typed fallback)"
              onClick={() => void submitNote(note)}
              disabled={!lead || lead.id === "pending"}
            >
              🎤
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
