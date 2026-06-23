"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./ui";

interface User {
  sub: string;
  name: string;
  email: string;
  picture?: string;
  phone: string | null;
  brandVoice: string;
  gmailConnected: boolean;
}

export function AccountBar() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [onboardPhone, setOnboardPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiGet<{ user: User | null }>("/api/auth/session");
    setUser(d.user);
    setLoaded(true);
    if (d.user && !d.user.phone) {
      // Prompt for phone if onboarding flag is present in the URL.
      const params = new URLSearchParams(window.location.search);
      if (params.get("onboard") === "phone") setOnboardPhone(true);
    }
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "not_configured")
      setNotice("Google sign-in isn't configured yet — add GOOGLE_CLIENT_ID/SECRET (see docs/SETUP.md §4).");
    else if (auth === "error")
      setNotice(`Sign-in error: ${params.get("reason") ?? "unknown"}`);
    if (auth) window.history.replaceState({}, "", window.location.pathname);
  }, [load]);

  const savePhone = async () => {
    await fetch("/api/auth/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setOnboardPhone(false);
    await load();
  };

  const logout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setUser(null);
    setOpen(false);
  };

  if (!loaded) return null;

  return (
    <>
      <div className="account">
        {user ? (
          <button className="account-chip" onClick={() => setOpen((v) => !v)}>
            {user.picture ? (
              <img src={user.picture} alt="" className="account-avatar" />
            ) : (
              <span className="account-avatar fallback">{user.name[0]}</span>
            )}
            <span className="account-name">{user.name.split(" ")[0]}</span>
            {user.gmailConnected && <span className="account-dot" title="Gmail connected" />}
          </button>
        ) : (
          <a className="account-signin" href="/api/auth/google/login">
            <span className="g">G</span> Continue with Google
          </a>
        )}
      </div>

      {open && user && (
        <div className="account-pop" onMouseLeave={() => setOpen(false)}>
          <div className="ap-head">
            <div className="ap-name">{user.name}</div>
            <div className="ap-email">{user.email}</div>
          </div>
          <div className="ap-row">
            <span>Gmail drafts</span>
            <span className={user.gmailConnected ? "ap-on" : "ap-off"}>
              {user.gmailConnected ? "connected" : "not connected"}
            </span>
          </div>
          <div className="ap-row">
            <span>Phone</span>
            <span>{user.phone ?? "—"}</span>
          </div>
          <button className="ap-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      )}

      {notice && (
        <div className="account-notice" onClick={() => setNotice(null)}>
          {notice} <b>✕</b>
        </div>
      )}

      {onboardPhone && (
        <div className="overlay" onClick={() => setOnboardPhone(false)}>
          <div className="trace" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>👋 One quick thing</h3>
            <p style={{ color: "var(--text-2)", fontSize: 13.5, marginBottom: 14 }}>
              We collected your name and email from Google. Add a phone number so Forleads can
              prepare SMS follow-ups too (optional — used only on your behalf, never shared).
            </p>
            <input
              className="phone-input"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={() => setOnboardPhone(false)}>
                Skip
              </button>
              <button className="btn primary" onClick={savePhone}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
