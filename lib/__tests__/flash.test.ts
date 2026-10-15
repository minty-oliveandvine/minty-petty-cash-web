// A message that survives one navigation (../flash.ts): the wizard's refusal, read once on the dashboard.

import { describe, expect, it } from "vitest";

import { setFlash, takeFlash } from "@/lib/flash";
import { reportStatus } from "@/lib/reportStatus";

describe("the flash", () => {
  it("is read exactly once", () => {
    setFlash("That day is taken.");
    expect(takeFlash()).toEqual({ message: "That day is taken.", kind: "error" });
    expect(takeFlash()).toBeNull();
  });

  it("keeps a known kind and reads anything else as an error", () => {
    setFlash("Saved", "success");
    expect(takeFlash()).toEqual({ message: "Saved", kind: "success" });
    sessionStorage.setItem("petty_cash_flash", JSON.stringify({ message: "m", kind: "loud" }));
    expect(takeFlash()).toEqual({ message: "m", kind: "error" });
  });

  it("ignores what it cannot read", () => {
    sessionStorage.setItem("petty_cash_flash", "{not json");
    expect(takeFlash()).toBeNull();
    sessionStorage.setItem("petty_cash_flash", JSON.stringify({ kind: "error" }));
    expect(takeFlash()).toBeNull();
  });
});

describe("a report's status pill", () => {
  const draft = { id: "d", status: "draft", current_section: "opening", completed_sections: [], xero_integrated: false, publishing_status: null };

  it("is Draft (Neutral) for a new report and for a draft", () => {
    expect(reportStatus(null)).toEqual({ label: "Draft", tone: "neutral" });
    expect(reportStatus(draft)).toEqual({ label: "Draft", tone: "neutral" });
  });

  it("is Published, Publish failed or Submitted (Info) otherwise", () => {
    expect(reportStatus({ ...draft, status: "submitted", xero_integrated: true })).toEqual({ label: "Published", tone: "success" });
    expect(reportStatus({ ...draft, status: "submitted", publishing_status: "failed" })).toEqual({ label: "Publish failed", tone: "danger" });
    expect(reportStatus({ ...draft, status: "submitted" })).toEqual({ label: "Submitted", tone: "info" });
  });
});
