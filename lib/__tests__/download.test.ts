import { afterEach, describe, expect, it, vi } from "vitest";

import { attachmentName, saveBlob } from "@/lib/download";

describe("the server's file name", () => {
  it.each([
    ["attachment; filename=reports_2026-10-01_to_2026-10-13.csv", "reports_2026-10-01_to_2026-10-13.csv"],
    ['attachment; filename="reports 1.csv"', "reports 1.csv"],
    ["attachment; filename*=UTF-8''caf%C3%A9.csv; filename=cafe.csv", "café.csv"],
    ["attachment; filename=../../etc/passwd", "passwd"],
  ])("reads %s as %s", (header, name) => {
    expect(attachmentName(header)).toBe(name);
  });

  it.each([null, undefined, "", "attachment", 'attachment; filename=""'])("finds none in %s", (header) => {
    expect(attachmentName(header)).toBeNull();
  });
});

describe("saving a file", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a temporary <a download> over an object URL, then removes it", () => {
    const created = vi.fn(() => "blob:x");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    saveBlob(new Blob(["a,b"], { type: "text/csv" }), "reports.csv");
    expect(created).toHaveBeenCalledOnce();
    expect(clicked).toHaveBeenCalledOnce();
    const link = clicked.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("reports.csv");
    expect(link.getAttribute("href")).toBe("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
