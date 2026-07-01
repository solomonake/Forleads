import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function authNotice(
  auth: string | null,
  reason: string | null,
): { tone: "warn" | "danger"; text: string } | null {
  if (auth === "not_configured") {
    return {
      tone: "warn",
      text: "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable real user onboarding.",
    };
  }
  if (auth === "error") {
    return {
      tone: "danger",
      text: `Sign-in error: ${reason ?? "unknown"}`,
    };
  }
  return null;
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await getSession();
  if (session) redirect("/app");

  const params = (await searchParams) ?? {};
  const auth = readParam(params, "auth");
  const reason = readParam(params, "reason");
  const notice = authNotice(auth, reason);

  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Forleads</p>
          <h1>The map that does the homework before you call.</h1>
          <p className="landing-sub">
            Every address becomes a lead with grounded property facts, draft-ready
            outreach, and a human approval gate before anything leaves your name.
          </p>

          <div className="landing-actions">
            <form action="/api/auth/google/login" method="get">
              <button className="landing-cta" type="submit">
                Continue with Google
              </button>
            </form>
            <Link className="landing-link" href="/app">
              Already signed in
            </Link>
          </div>

          <div className="landing-metrics" aria-label="Product proof">
            <div>
              <strong>Map-first</strong>
              <span>Scout a neighborhood, not a spreadsheet.</span>
            </div>
            <div>
              <strong>Grounded</strong>
              <span>Evidence cards cite the facts behind every draft.</span>
            </div>
            <div>
              <strong>Human-gated</strong>
              <span>Nothing sends until the agent approves it.</span>
            </div>
          </div>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="landing-preview-rail">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="landing-preview-stage">
            <div className="landing-preview-command">
              <b>For</b>leads
              <span>Scout 18 Maple Ave</span>
            </div>
            <div className="landing-preview-map">
              <div className="landing-preview-grid" />
              <div className="landing-preview-pin landing-preview-pin-a" />
              <div className="landing-preview-pin landing-preview-pin-b" />
              <div className="landing-preview-pin landing-preview-pin-c" />
            </div>
            <div className="landing-preview-card">
              <div className="landing-preview-row">
                <strong>Flood zone</strong>
                <span>AE - high-risk SFHA</span>
              </div>
              <div className="landing-preview-row">
                <strong>Draft status</strong>
                <span>Ready for approval</span>
              </div>
              <div className="landing-preview-row">
                <strong>Next action</strong>
                <span>Open Gmail draft</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band">
        <div>
          <strong>Grounded evidence in the loop</strong>
          <p>Property, risk, notes, drafts, and approvals stay visible in one workflow.</p>
        </div>
        <div>
          <strong>Built for real client work</strong>
          <p>Graceful degradation, quota guardrails, and inspectable traces are standard.</p>
        </div>
      </section>

      {notice ? (
        <aside className={`landing-notice ${notice.tone}`}>{notice.text}</aside>
      ) : null}
    </main>
  );
}
