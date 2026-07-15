import { describe, expect, it } from "vitest";
import { addressFingerprint, sameContactIdentity } from "./address-match";

describe("addressFingerprint", () => {
  it("normalizes an Oklahoma address without weakening unit identity", () => {
    expect(addressFingerprint("2209 Colchester Terrace, Edmond, Oklahoma 73034, USA"))
      .toBe(addressFingerprint("2209 Colchester Ter Edmond OK 73034"));
    expect(addressFingerprint("2209 Colchester Ter Unit 2, Edmond, OK 73034"))
      .not.toBe(addressFingerprint("2209 Colchester Ter Unit 3, Edmond, OK 73034"));
  });

  it("fails closed without a house number and state", () => {
    expect(addressFingerprint("Colchester Terrace, Edmond")).toBeNull();
  });
});

describe("sameContactIdentity", () => {
  it("matches normalized email or phone and rejects unrelated people", () => {
    expect(sameContactIdentity(
      { email: "ALEX@EXAMPLE.COM" },
      { email: "alex@example.com" },
    )).toBe(true);
    expect(sameContactIdentity(
      { phone: "+1 (405) 555-0100" },
      { phone: "4055550100" },
    )).toBe(true);
    expect(sameContactIdentity(
      { email: "one@example.com" },
      { email: "two@example.com" },
    )).toBe(false);
    expect(sameContactIdentity(
      { phone: "123" },
      { phone: "123" },
    )).toBe(false);
  });
});
