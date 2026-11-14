import { describe, expect, it } from "vitest";
import { parseViolations, POST } from "./route";

function post(body: string, type = "application/csp-report") {
  return new Request("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": type, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/csp-report", () => {
  it("parses report-uri bodies and drops query strings", () => {
    const v = parseViolations({
      "csp-report": {
        "document-uri": "https://forleads.vercel.app/?q=12+Oak",
        "effective-directive": "img-src",
        "blocked-uri": "https://evil.example/pixel.gif?addr=secret",
        disposition: "report",
      },
    });
    expect(v).toEqual([
      {
        directive: "img-src",
        blocked: "https://evil.example/pixel.gif",
        document: "https://forleads.vercel.app/",
        disposition: "report",
      },
    ]);
  });

  it("parses Reporting API bodies and ignores other report types", () => {
    const v = parseViolations([
      { type: "deprecation", body: {} },
      {
        type: "csp-violation",
        body: { effectiveDirective: "script-src-elem", blockedURL: "inline", documentURL: "https://a.test/x?y" },
      },
    ]);
    expect(v).toEqual([
      { directive: "script-src-elem", blocked: "inline", document: "https://a.test/x", disposition: "" },
    ]);
  });

  it("answers 204, and rejects oversized or malformed bodies", async () => {
    expect((await POST(post(JSON.stringify({ "csp-report": {} })))).status).toBe(204);
    expect((await POST(post("x".repeat(20_000)))).status).toBe(413);
    expect((await POST(post("{nope"))).status).toBe(400);
  });
});
