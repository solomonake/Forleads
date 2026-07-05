"use client";

// First-run activation checklist. Walks a new agent from Connect Google →
// ground an address → add a contact → approve the first draft. State is
// derived live from the same APIs the surfaces use — no demo data, no fake
// progress. Dismissal persists per browser; the card never renders for a
// workspace that has already completed every step.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Artifact, LeadSurface } from "@/lib/core/types";
import { apiGet } from "./ui";

type View = "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline";

interface SessionUser {
  name: string;
  gmailConnected: boolean;
}

const DISMISS_KEY = "forleads.getstart.dismissed";
const COLLAPSE_KEY = "forleads.getstart.collapsed";

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode / storage disabled — the card just reappears next load.
  }
}

export function GettingStarted({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [leads, setLeads] = useState<LeadSurface[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setDismissed(readFlag(DISMISS_KEY));
    setCollapsed(readFlag(COLLAPSE_KEY));
  }, []);

  const refresh = useCallback(async () => {
    const [session, leadData, inboxData] = await Promise.all([
      apiGet<{ user: SessionUser | null }>("/api/auth/session").catch(() => ({ user: null })),
      apiGet<{ leads: LeadSurface[] }>("/api/leads").catch(() => ({ leads: [] as LeadSurface[] })),
      apiGet<{ items: { artifact: Artifact }[] }>("/api/inbox").catch(() => ({
        items: [] as { artifact: Artifact }[],
      })),
    ]);
    setUser(session.user);
    setLeads(leadData.leads);
    setArtifacts(inboxData.items.map((item) => item.artifact));
    setLoaded(true);
  }, []);

  // Re-derive progress whenever the operator switches surfaces — completing a
  // step on one surface should tick the box without a manual reload.
  useEffect(() => {
    refresh();
  }, [refresh, view]);

  const firstLead = leads[0];
  const steps = useMemo(() => {
    const signedIn = Boolean(user);
    const hasLead = leads.length > 0;
    const hasContact = leads.some((lead) => lead.contact);
    const hasApproved = artifacts.some(
      (artifact) => artifact.status === "approved" || artifact.status === "sent"
    );
    return [
      {
        key: "google",
        title: "Connect Google",
        done: signedIn,
        hint: signedIn
          ? user?.gmailConnected
            ? "Signed in — Gmail drafts are ready."
            : "Signed in. Gmail draft permission is granted on sign-in."
          : "Sign in so drafts, approvals, and leads belong to your workspace.",
        cta: signedIn ? null : { label: "Continue with Google", href: "/api/auth/google/login" },
      },
      {
        key: "ground",
        title: "Ground your first address",
        done: hasLead,
        hint: hasLead
          ? `${leads.length} lead${leads.length === 1 ? "" : "s"} on the map.`
          : "Type any real address on the map — the scout pass builds the first brief.",
        cta: hasLead
          ? null
          : {
              label: "Open the map",
              action: () => {
                onNavigate("map");
                window.setTimeout(() => document.getElementById("search-input")?.focus(), 50);
              },
            },
      },
      {
        key: "contact",
        title: "Add a contact",
        done: hasContact,
        hint: hasContact
          ? "Contact captured — outreach drafts can address a real person."
          : hasLead
            ? "Open a lead and attach the owner or prospect's name and channel."
            : "Ground an address first, then attach who you're talking to.",
        cta:
          hasContact || !firstLead
            ? null
            : {
                label: "Open lead",
                action: () => {
                  window.dispatchEvent(
                    new CustomEvent("forleads:open-lead", {
                      detail: {
                        address: firstLead.address,
                        locality: firstLead.locality,
                        lng: firstLead.lng,
                        lat: firstLead.lat,
                      },
                    })
                  );
                  onNavigate("map");
                },
              },
      },
      {
        key: "approve",
        title: "Approve your first draft",
        done: hasApproved,
        hint: hasApproved
          ? "First draft approved — the full loop is live."
          : artifacts.length > 0
            ? "A draft is waiting in the Action Inbox."
            : "Log a field note on a lead; the agent prepares the draft for your approval.",
        cta: hasApproved
          ? null
          : {
              label: "Open Action Inbox",
              action: () => onNavigate("inbox"),
            },
      },
    ];
  }, [artifacts, firstLead, leads, onNavigate, user]);

  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  // A workspace that has already completed setup never sees the card.
  useEffect(() => {
    if (loaded && allDone && !dismissed) {
      setDismissed(true);
      writeFlag(DISMISS_KEY, true);
    }
  }, [allDone, dismissed, loaded]);

  if (!loaded || dismissed) return null;

  if (collapsed) {
    return (
      <button
        className="getstart-chip"
        onClick={() => {
          setCollapsed(false);
          writeFlag(COLLAPSE_KEY, false);
          refresh();
        }}
      >
        Setup · {doneCount}/{steps.length}
      </button>
    );
  }

  return (
    <div className="getstart" role="region" aria-label="Getting started checklist">
      <div className="getstart-head">
        <div>
          <div className="getstart-kicker">Getting started</div>
          <div className="getstart-title">
            {doneCount}/{steps.length} — first approved draft is the finish line
          </div>
        </div>
        <div className="getstart-headbtns">
          <button
            className="getstart-min"
            title="Minimize"
            onClick={() => {
              setCollapsed(true);
              writeFlag(COLLAPSE_KEY, true);
            }}
          >
            —
          </button>
          <button
            className="getstart-min"
            title="Dismiss for good"
            onClick={() => {
              setDismissed(true);
              writeFlag(DISMISS_KEY, true);
            }}
          >
            ✕
          </button>
        </div>
      </div>
      {steps.map((step) => (
        <div className={`getstart-step ${step.done ? "done" : ""}`} key={step.key}>
          <span className="getstart-mark">{step.done ? "✓" : "○"}</span>
          <div className="getstart-body">
            <div className="getstart-step-title">{step.title}</div>
            <div className="getstart-step-hint">{step.hint}</div>
          </div>
          {step.cta &&
            ("href" in step.cta && step.cta.href ? (
              <a className="minibtn primary getstart-cta" href={step.cta.href}>
                {step.cta.label}
              </a>
            ) : (
              <button
                className="minibtn primary getstart-cta"
                onClick={"action" in step.cta ? step.cta.action : undefined}
              >
                {step.cta.label}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
