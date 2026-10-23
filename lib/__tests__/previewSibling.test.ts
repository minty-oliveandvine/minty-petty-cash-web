// Preview sets (lib/previewSibling.ts): this app's label is `pettycash` - `pr-<slug>-pettycash.dailyminty.com`.

import { describe, expect, it } from "vitest";

import { previewSetSlug, siblingUrl } from "@/lib/previewSibling";

describe("previewSetSlug", () => {
  it.each([
    ["pr-development-pettycash.dailyminty.com", "development"],
    ["pr-step5-hosts-pettycash.dailyminty.com", "step5-hosts"],
    ["pr-x-my.dailyminty.com", "x"],
    ["pr-x-payment-request.dailyminty.com", "x"],
  ])("%s is set %s", (host, slug) => {
    expect(previewSetSlug(host)).toBe(slug);
  });

  it.each([
    "pr-x-petty-cash.dailyminty.com",
    "pettycash.dailyminty.com",
    "dev-pettycash.dailyminty.com",
    "localhost:3010",
    null,
  ])("%s is no set host", (host) => {
    expect(previewSetSlug(host)).toBeNull();
  });
});

describe("siblingUrl", () => {
  it("moves a configured URL onto the same set's host for that app", () => {
    expect(
      siblingUrl(
        "https://dev-payment-request.dailyminty.com",
        "payment-request",
        "pr-x-pettycash.dailyminty.com",
      ),
    ).toBe("https://pr-x-payment-request.dailyminty.com");
    expect(
      siblingUrl("https://pettycash.dailyminty.com/a", "pettycash", "pr-x-my.dailyminty.com"),
    ).toBe("https://pr-x-pettycash.dailyminty.com/a");
  });

  it("leaves it alone off a set host", () => {
    expect(siblingUrl("http://localhost:3020", "payment-request", "localhost:3010")).toBe(
      "http://localhost:3020",
    );
  });
});
