import { describe, expect, it } from "vitest";
import { num, oneOf, optNum, optStr, parseJsonBody, str, validateBody, ValidationError } from "./index";

const rec = (o: unknown) => o as Record<string, unknown>;

describe("field validators", () => {
  it("str requires a non-empty string and enforces max length", () => {
    expect(str(rec({ a: "hi" }), "a")).toBe("hi");
    expect(() => str(rec({ a: "" }), "a")).toThrow(ValidationError);
    expect(() => str(rec({ a: 5 }), "a")).toThrow(/must be a non-empty string/);
    expect(() => str(rec({ a: "toolong" }), "a", { max: 3 })).toThrow(/exceeds max length/);
  });

  it("num requires a finite number", () => {
    expect(num(rec({ n: 1.5 }), "n")).toBe(1.5);
    expect(() => num(rec({ n: "1" }), "n")).toThrow(ValidationError);
    expect(() => num(rec({ n: NaN }), "n")).toThrow(ValidationError);
  });

  it("oneOf restricts to the allowed set", () => {
    expect(oneOf(rec({ k: "a" }), "k", ["a", "b"] as const)).toBe("a");
    expect(() => oneOf(rec({ k: "z" }), "k", ["a", "b"] as const)).toThrow(/must be one of/);
  });

  it("optStr / optNum pass through undefined but validate when present", () => {
    expect(optStr(rec({}), "x")).toBeUndefined();
    expect(optNum(rec({}), "x")).toBeUndefined();
    expect(() => optNum(rec({ x: 2 }), "x", { max: 1 })).toThrow(/must be <= 1/);
    expect(optStr(rec({ x: "text" }), "x", { allowed: ["text", "voice"] as const })).toBe("text");
  });
});

describe("parseJsonBody / validateBody", () => {
  const body = (s: string) => new Request("http://x", { method: "POST", body: s });

  it("rejects an oversized body", async () => {
    await expect(parseJsonBody(body("x".repeat(20)), 10)).rejects.toThrow(/too large/);
  });

  it("rejects empty and malformed JSON", async () => {
    await expect(parseJsonBody(body(""))).rejects.toThrow(/body required/);
    await expect(parseJsonBody(body("{not json"))).rejects.toThrow(/invalid JSON/);
  });

  it("ValidationError carries a 400 status (mapped by withRoute)", () => {
    expect(new ValidationError("x").status).toBe(400);
  });

  it("validateBody runs the field reader on a parsed object", async () => {
    const out = await validateBody(body(JSON.stringify({ a: "hi", n: 2 })), (b) => ({
      a: str(b, "a"),
      n: num(b, "n"),
    }));
    expect(out).toEqual({ a: "hi", n: 2 });
  });

  it("validateBody rejects a non-object body", async () => {
    await expect(validateBody(body("[1,2]"), (b) => b)).rejects.toThrow(/must be a JSON object/);
  });
});
