import { describe, it, expect } from "vitest";
import { base64Url, buildMimeMessage, buildGmailRaw } from "./mime";

describe("Gmail MIME / base64url", () => {
  it("builds a valid RFC 2822 message", () => {
    const msg = buildMimeMessage({
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      body: "Hello world",
    });
    expect(msg).toMatch(/^From: a@x\.com/m);
    expect(msg).toMatch(/^To: b@y\.com/m);
    expect(msg).toMatch(/^Subject: Hi/m);
    expect(msg).toContain("\r\n\r\nHello world");
  });

  it("base64url has no +, /, or padding", () => {
    const encoded = base64Url("subjects??>>with++//chars and padding****");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips base64url back to the original", () => {
    const original = buildMimeMessage({ from: "a@x.com", to: "b@y.com", subject: "T", body: "Body" });
    const raw = buildGmailRaw({ from: "a@x.com", to: "b@y.com", subject: "T", body: "Body" });
    const back = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    expect(back).toBe(original);
  });

  it("encodes non-ASCII subjects (RFC 2047)", () => {
    const msg = buildMimeMessage({ from: "a@x.com", to: "b@y.com", subject: "Café ☕", body: "x" });
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});
