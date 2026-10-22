// Export CSV's save (components/history/ReportHistory.tsx) and its file name (lib/apiClient.ts
// pettyCashDownload): @minty/shared/download's saveBlob and filenameFromDisposition since the
// shared-code refactor (2026-10-21) - pinned here for what this app relies on.

import { filenameFromDisposition as attachmentName, saveBlob } from "@minty/shared/download";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("the server's file name", () => {
  it.each([
    [
      "attachment; filename=reports_2026-10-01_to_2026-10-13.csv",
      "reports_2026-10-01_to_2026-10-13.csv",
    ],
    ['attachment; filename="reports 1.csv"', "reports 1.csv"],
    ["attachment; filename*=UTF-8''caf%C3%A9.csv; filename=cafe.csv", "café.csv"],
    ["attachment; filename=../../etc/passwd", "passwd"],
  ])("reads %s as %s", (header, name) => {
    expect(attachmentName(header)).toBe(name);
  });

  it.each([null, undefined, "", "attachment", 'attachment; filename=""'])(
    "finds none in %s",
    (header) => {
      expect(attachmentName(header)).toBeNull();
    },
  );
});

describe("saving a file", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a temporary <a download> over an object URL, then removes it", () => {
    const created = vi.fn(() => "blob:x");
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    saveBlob(new Blob(["a,b"], { type: "text/csv" }), "reports.csv");
    expect(created).toHaveBeenCalledOnce();
    expect(clicked).toHaveBeenCalledOnce();
    const link = clicked.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("reports.csv");
    expect(link.getAttribute("href")).toBe("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("the file name and the save, at the edges", () => {
  // saveBlob(blob, name) - blob FIRST - and the name rules.

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    // owner 2026-10-21: one shared module (@minty/shared/download) - "\\" separates segments too
    // (a backslash was kept as part of the name: "dir\\sub\\x.csv")
    ["attachment; filename=dir\\sub\\x.csv", "x.csv"],
    ["attachment; filename=dir/", null],
    ["attachment; filename=  spaced.csv  ", "spaced.csv"],
    ["attachment; filename*=utf-8''a%20b.csv", "a b.csv"],
    ["attachment; filename*=UTF-8''%E0%A4%A; filename=plain.csv", "plain.csv"],
    ["attachment; filename*=UTF-8''%E0%A4%A", null],
    ["attachment; filename*=ISO-8859-1''x.csv; filename=y.csv", "y.csv"],
    ['attachment; filename="a;b.csv"', "a;b.csv"],
    ["inline; filename=x.pdf", "x.pdf"],
  ])("reads %s as %s", (header, name) => {
    expect(attachmentName(header)).toBe(name);
  });

  it("takes the blob first and the name second, hides the link, and revokes the URL after the click", () => {
    vi.useFakeTimers();
    const created = vi.fn<(obj: Blob | MediaSource) => string>(() => "blob:y");
    const revoked = vi.fn();
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
    let inBody = false;
    let hidden = "";
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      inBody = document.body.contains(this);
      hidden = this.style.display;
    });
    const blob = new Blob(["x"]);
    saveBlob(blob, "file.csv");
    expect(created).toHaveBeenCalledWith(blob);
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).download).toBe("file.csv");
    expect(inBody).toBe(true);
    expect(hidden).toBe("none");
    expect(revoked).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoked).toHaveBeenCalledWith("blob:y");
  });

  it("removes the link even when the click throws", () => {
    URL.createObjectURL = vi.fn(() => "blob:z");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveBlob(new Blob(["x"]), "f.csv")).toThrow("blocked");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
