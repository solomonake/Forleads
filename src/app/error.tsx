"use client";

// App-wide error boundary: reports render errors through the tracker seam and
// gives the visitor a way forward instead of a blank screen.
import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/observability/report";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { where: "app.error-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="legal">
      <div className="legal-inner">
        <h1>Something went wrong</h1>
        <p>
          This screen hit an unexpected error. Nothing was sent or saved because of it.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
        <p>
          <button type="button" className="minibtn primary" onClick={reset}>
            Try again
          </button>{" "}
          <Link href="/">Back to the map</Link>
        </p>
      </div>
    </main>
  );
}
