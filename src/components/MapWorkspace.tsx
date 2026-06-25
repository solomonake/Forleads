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
import { apiGet, apiPost, ApiError, ConfidenceLegend, GradeChip } from "./ui";

// Toast model: success path is a green pill; failure path is a red, actionable
// pill that exposes the server's request id (so the user can paste it in a
// support reply) and a Retry CTA closure. Honest failures over silent ones.
type ToastValue =
  | { kind: "ok"; text: string }
  | { kind: "err"; text: string; requestId?: string; retry?: () => void };
import { ReviewTray } from "./ReviewTray";

interface GeoResult {
  address: string;
  locality?: string;
  lng: number;
  lat: number;
}

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

export function MapWorkspace({ onOpenTrace }: { onOpenTrace: (ref: string) => void }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const beaconRef = useRef<maplibregl.Marker | null>(null);
  const mlRef = useRef<typeof maplibregl | null>(null);
  const mapDiv = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<GeoResult[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
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
    const t = setTimeout(async () => {
      try {
        const d = await apiGet<{ results: GeoResult[] }>(
          `/api/geocode?q=${encodeURIComponent(query)}`
        );
        if (active) setSuggest(d.results);
      } catch {
        /* ignore */
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

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---- The magic loop -----------------------------------------------------
  const goTo = useCallback(
    async (p: GeoResult) => {
      setQuery(p.address);
      setSuggestOpen(false);
      setLeadOpen(true);
      setWorking(true);
      setCards([]);
      setSummary(null);
      setClassification(null);
      setNote("");
      setExpanded(new Set());
      setLead({
        id: "pending",
        agent_id: "",
        address: p.address,
        locality: p.locality,
        lng: p.lng,
        lat: p.lat,
        h3_index: "",
        status: "researching",
        first_seen_at: "",
        last_worked_at: "",
      });

      // The fly-to IS the loading window.
      const map = mapRef.current;
      if (map) {
        makeBeacon(p.lng, p.lat, true);
        if (reduceMotion) {
          map.jumpTo({ center: [p.lng, p.lat], zoom: 16.4 });
        } else {
          map.flyTo({
            center: [p.lng, p.lat],
            zoom: 16.4,
            pitch: 45,
            bearing: -17,
            duration: 1800,
            essential: true,
          });
        }
      }

      try {
        const d = await apiPost<{ lead: LeadSurface; summary: ReduceSummary }>("/api/lead", {
          address: p.address,
          lng: p.lng,
          lat: p.lat,
          locality: p.locality,
        });
        // Stagger the reveal so cards stream in (honest: data is already here).
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
            makeBeacon(p.lng, p.lat, false); // stop breathing the instant work settles
          },
          reduceMotion ? 0 : all.length * 90 + 100
        );
      } catch (e) {
        setWorking(false);
        setLead(null); // clear the optimistic placeholder so the UI isn't stuck
        const msg = e instanceof Error ? e.message : String(e);
        const requestId = e instanceof ApiError ? e.requestId : undefined;
        const status = e instanceof ApiError ? e.status : 0;
        const auth = status === 401 || /authentication required|unauthor/i.test(msg);
        if (auth) {
          setToast({ kind: "err", text: "Sign in to research this address" });
          setTimeout(() => setToast(null), 3500);
        } else {
          setToast({
            kind: "err",
            text: `Couldn't load this address — ${msg}`,
            requestId,
            retry: () => goTo(p),
          });
          // Failure toast sticks until the user clicks Retry or dismisses
          // (auto-hide hides the retry CTA before they can use it).
        }
      }
    },
    [makeBeacon, reduceMotion]
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
    [lead]
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
    [lead, classification]
  );

  const grouped = SCOUT_GROUPS.map((g) => ({
    ...g,
    cards: cards.filter((c) => c.scout === g.key),
  })).filter((g) => g.cards.length > 0);

  return (
    <>
      <div id="map" ref={mapDiv} />

      {/* Command bar */}
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
              if (e.key === "Enter" && suggest[0]) goTo(suggest[0]);
              if (e.key === "Escape") setSuggestOpen(false);
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
        <div className={`${suggestOpen && suggest.length ? "open" : ""}`} id="suggest">
          {suggest.map((p, i) => (
            <div
              className={`sug ${i === 0 ? "active" : ""}`}
              key={`${p.address}-${i}`}
              onClick={() => goTo(p)}
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

      {/* Tools rail */}
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
            if (lead && mapRef.current)
              mapRef.current.flyTo({ center: [lead.lng, lead.lat], zoom: 16.4, pitch: 45, duration: 1000 });
          }}
        >
          ⌖
        </div>
      </div>

      {/* Lead rail */}
      <div id="lead" className={leadOpen ? "open" : ""}>
        <div className="lead-head">
          <div className="lead-addr">{lead?.address ?? "—"}</div>
          <div className="lead-sub">
            <span className="status-dot" />
            <span>{working ? "Researching…" : "Grounded"}</span>
            <span className="grade-overall">
              {summary ? `overall grade ${summary.grade} · ${summary.scoutCount} scouts` : ""}
            </span>
          </div>
          {summary?.recallNote ? (
            <div className="recall-note" data-testid="recall-note">{summary.recallNote}</div>
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
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="scout-group-label">{g.label}</div>
              {g.cards.map((c, ci) => {
                const globalIdx = cards.indexOf(c);
                const isOpen = expanded.has(globalIdx);
                return (
                  <div
                    id={`card-${globalIdx}`}
                    className={`card ${c.confidence === "D" ? "gradeD" : ""}`}
                    key={`${g.key}-${ci}`}
                  >
                    <div className="row1">
                      <span className="claim">{c.claim}</span>
                      <span
                        className="val"
                        style={c.value === null ? { color: "var(--grade-d)" } : undefined}
                      >
                        {c.value === null ? "unverified" : String(c.value)}
                      </span>
                    </div>
                    <div className="meta">
                      <GradeChip grade={c.confidence as Confidence} />
                      <span className="src">
                        {c.sources.length
                          ? `© ${c.sources.map((s) => s.name).join(" · ")}`
                          : "no source"}
                      </span>
                      {c.reasoning && (
                        <button
                          className="why"
                          onClick={() =>
                            setExpanded((prev) => {
                              const n = new Set(prev);
                              n.has(globalIdx) ? n.delete(globalIdx) : n.add(globalIdx);
                              return n;
                            })
                          }
                        >
                          {isOpen ? "hide" : "why?"}
                        </button>
                      )}
                    </div>
                    {c.confidence === "D" && c.reasoning && (
                      <div className="gap-note">{c.reasoning}</div>
                    )}
                    {isOpen && c.confidence !== "D" && c.reasoning && (
                      <div className="reasoning">{c.reasoning}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {summary?.breakout && (
            <div className="gap-note" style={{ margin: "12px 6px" }}>
              ⚠ Break-out ({summary.breakout.kind}): {summary.breakout.reason}
              {summary.breakout.question ? ` — “${summary.breakout.question}”` : ""}
            </div>
          )}
        </div>

        <div className="lead-foot">
          <div className="note-box">
            <textarea
              value={note}
              placeholder="Add a note… e.g. 'knocked, no answer, nice yard'"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitNote(note);
              }}
            />
            <button className="mic" title="Voice note (typed fallback)" onClick={() => submitNote(note)}>
              🎤
            </button>
          </div>
          <div className="quick">
            {QUICK_NOTES.map((q) => (
              <button key={q.label} onClick={() => submitNote(q.text)}>
                {q.label}
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
              {classification.suggested_actions.map((a, i) => (
                <div
                  className={`opt ${selectedAction === i ? "sel" : ""}`}
                  key={i}
                  onClick={() => setSelectedAction(i)}
                >
                  <span className="r" />
                  {a.label}
                  {a.recommended ? "  (recommended)" : ""}
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
          onApproved={(msg) => {
            setDraft(null);
            setToast({ kind: "ok", text: msg });
            setTimeout(() => setToast(null), 2800);
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
