// Public terms of service — linked from the signed-out home surface and the
// privacy policy. Server-rendered, no auth, no client JS.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Forleads",
  description: "The terms that govern your use of Forleads.",
};

const EFFECTIVE_DATE = "July 4, 2026";
const CONTACT_EMAIL = "solomonriting@gmail.com";

export default function TermsPage() {
  return (
    <main className="legal">
      <div className="legal-inner">
        <Link href="/" className="legal-back">
          ← Back to Forleads
        </Link>
        <h1>Terms of Service</h1>
        <p className="legal-date">Effective: {EFFECTIVE_DATE}</p>

        <p>
          These terms govern your use of Forleads, a lead-management workspace for real-estate
          professionals. By creating an account or using the product you agree to them.
        </p>

        <h2>The service</h2>
        <p>
          Forleads grounds property addresses, gathers publicly available evidence, and prepares
          outreach drafts, tasks, and follow-up loops. Every outbound action — email drafts,
          calendar events, CRM writes, SMS — requires your explicit approval before anything
          leaves the product. You are the sender of record for anything you approve.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>
            You are responsible for the content you approve and send, including compliance with
            applicable real-estate advertising rules, fair-housing laws, and communication-consent
            laws (e.g. TCPA, CAN-SPAM) in your jurisdiction.
          </li>
          <li>
            You will only connect accounts and credentials you are authorized to use, and you will
            keep your sign-in credentials secure.
          </li>
          <li>You will not use Forleads to harass, spam, or contact people who have opted out.</li>
        </ul>

        <h2>Evidence and accuracy</h2>
        <p>
          Forleads grades every claim it surfaces and shows its sources. Evidence marked as sparse
          or unverified is exactly that — verify independently before relying on it for a
          transaction. Forleads is a workflow tool, not a source of legal, financial, or licensed
          professional advice.
        </p>

        <h2>Your data</h2>
        <p>
          You own your workspace content. How we handle data, including Google user data, is
          described in the <Link href="/privacy">Privacy Policy</Link>. You can disconnect
          providers at any time and request full deletion by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Availability and changes</h2>
        <p>
          The service is provided &quot;as is&quot; without warranty of uninterrupted availability.
          We may add, change, or remove features. If we make material changes to these terms we
          will post them here and update the effective date.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Forleads is not liable for indirect, incidental,
          or consequential damages arising from use of the service, including outcomes of
          communications you approve and send.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using Forleads at any time. We may suspend accounts that violate these
          terms or abuse the service, with notice where practical.
        </p>

        <h2>Contact</h2>
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <div className="legal-foot">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/">Home</Link>
        </div>
      </div>
    </main>
  );
}
