// Public privacy policy — required for Google OAuth verification and linked
// from the signed-out home surface. Server-rendered, no auth, no client JS.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Forleads",
  description: "How Forleads collects, uses, and protects your data.",
};

const EFFECTIVE_DATE = "July 4, 2026";
const CONTACT_EMAIL = "solomonriting@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="legal-inner">
        <Link href="/" className="legal-back">
          ← Back to Forleads
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-date">Effective: {EFFECTIVE_DATE}</p>

        <p>
          Forleads is a lead-management workspace for real-estate professionals. It grounds
          property addresses on a map, gathers publicly available evidence about them, and prepares
          outreach drafts that you explicitly review and approve. This policy explains what data
          Forleads handles and how.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <b>Account information.</b> When you sign in with Google we receive your name, email
            address, and profile picture to create and identify your workspace. You may optionally
            add a phone number.
          </li>
          <li>
            <b>Workspace content.</b> Addresses you ground, field notes you write, contacts you
            attach to leads, and the drafts and tasks the system prepares for your approval.
          </li>
          <li>
            <b>Connector credentials.</b> If you connect a CRM, SMS, or email provider, the
            credentials you supply are encrypted at rest and scoped to your workspace only.
          </li>
          <li>
            <b>Operational logs.</b> Request logs and agent traces used to explain and debug what
            the system did. Traces are inspectable by you inside the product.
          </li>
        </ul>

        <h2>How we use Google user data</h2>
        <p>
          Forleads requests the minimum Google scopes needed for its features: your basic profile
          (sign-in), <code>gmail.compose</code>, and <code>calendar.events</code>.
        </p>
        <ul>
          <li>
            <b>Gmail.</b> Forleads creates email <em>drafts</em> in your Gmail account only when
            you explicitly approve a prepared draft. Forleads never sends email on its own, never
            reads your inbox, and never accesses messages it did not create.
          </li>
          <li>
            <b>Calendar.</b> Forleads creates calendar events only when you explicitly approve a
            prepared follow-up or appointment. It does not read or modify other events.
          </li>
        </ul>
        <p>
          Forleads&apos; use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically: Google user data is used only to
          provide the user-facing features described above, is never sold, is never used for
          advertising, and is never transferred to third parties except as necessary to provide
          those features, comply with law, or as part of a merger or acquisition with prior notice.
          No humans read your Google data except with your explicit consent, for security purposes,
          or to comply with law. Google user data is not used to train machine-learning models.
        </p>

        <h2>What we do not do</h2>
        <ul>
          <li>We do not sell your data or share it with advertisers.</li>
          <li>We do not send any outbound communication without your explicit approval.</li>
          <li>We do not use demo or fabricated data in your workspace.</li>
        </ul>

        <h2>Storage and security</h2>
        <p>
          Data is stored with our hosting providers (Vercel and Supabase). OAuth tokens and
          connector credentials are encrypted at rest. Access is isolated per workspace: one
          agent&apos;s leads, drafts, and credentials are never visible to another.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          Your data is retained while your account is active. You can disconnect Google or any
          connector at any time from the Connector Hub, which invalidates stored tokens. To delete
          your account and all associated data, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will complete the deletion
          within 30 days. You can also revoke Forleads&apos; access at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2>Third-party services</h2>
        <p>
          Forleads sends only what each service needs to provide the product. No account data
          (your name, email, or Google tokens) is shared with the mapping, search, or public-data
          services below.
        </p>
        <ul>
          <li>
            <b>Anthropic (Claude).</b> When AI drafting is on, a lead&apos;s address and graded
            evidence, the field notes you write, your name, and the recipient&apos;s name or label
            are sent to Anthropic&apos;s API to classify the situation and write the draft you
            review. For seller updates, the showing-feedback themes and the prepared base draft,
            which includes your email address and the seller&apos;s, are sent too.
          </li>
          <li>
            <b>Address search: Photon (komoot) and Nominatim (OpenStreetMap Foundation).</b> What
            you type in the search box is sent to Photon for suggestions. If you press Enter with
            no suggestion, that one query is sent to Nominatim. Queries go from our servers, not
            your browser, and are cached.
          </li>
          <li>
            <b>Maps: OpenFreeMap and Esri.</b> Your browser loads map tiles from OpenFreeMap
            (street map) and Esri (aerial imagery), which see the map area you view and your IP
            address.
          </li>
          <li>
            <b>Street imagery: Mapillary.</b> The coordinates of a lead you research are sent to
            Mapillary to find nearby street-level photos, and your browser loads those photos
            from Mapillary&apos;s image servers.
          </li>
          <li>
            <b>Public property data.</b> A lead&apos;s address and coordinates are sent to
            OpenStreetMap (Overpass) and to the government open-data portals that cover that
            area to look up public property, sales, and hazard records.
          </li>
          <li>
            <b>Hosting: Vercel and Supabase</b>, as described under Storage and security.
          </li>
        </ul>

        <h2>Changes</h2>
        <p>
          We will post any changes to this policy on this page and update the effective date. For
          material changes affecting Google user data, we will notify you in the product.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <div className="legal-foot">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/">Home</Link>
        </div>
      </div>
    </main>
  );
}
