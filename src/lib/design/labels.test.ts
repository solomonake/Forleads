import { describe, expect, it } from "vitest";
import { actionTypeLabel, humanizeToken, loopRunStatusLabel } from "./labels";

describe("labels", () => {
  it("maps every artifact action type to copy with no underscores", () => {
    for (const type of ["email", "sms", "task", "calendar", "crm_note"]) {
      expect(actionTypeLabel(type)).not.toMatch(/_/);
    }
    expect(actionTypeLabel("crm_note")).toBe("CRM note");
  });

  it("maps every loop run status to copy with no underscores", () => {
    for (const status of [
      "started",
      "skipped_condition",
      "produced_artifact",
      "blocked_compliance",
      "completed",
      "error",
    ]) {
      expect(loopRunStatusLabel(status)).not.toMatch(/_/);
    }
    expect(loopRunStatusLabel("produced_artifact")).toBe("Prepared work");
  });

  it("humanizes unknown tokens instead of leaking raw identifiers", () => {
    expect(humanizeToken("no_contact")).toBe("no contact");
    expect(humanizeToken("loop.run.started")).toBe("loop run started");
    expect(humanizeToken("condition:has_contact_channel")).toBe(
      "condition · has contact channel"
    );
  });
});
