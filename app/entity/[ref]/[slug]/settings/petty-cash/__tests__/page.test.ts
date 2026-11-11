// The old address of Petty Cash Settings (this app's page until 2026-11-10, when the owner moved it
// into the hub): it only sends the person on, to the same path on accounts-api, whose gated
// hand-off (permission, module) mints the hub's token for the company and opens its tab.

import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import Page from "@/app/entity/[ref]/[slug]/settings/petty-cash/page";
import { env } from "@/lib/env";

describe("the old Petty Cash Settings address", () => {
  it("goes to accounts-api's address for it, which hands over to the hub's tab", async () => {
    await expect(
      Page({ params: Promise.resolve({ ref: "360812e1", slug: "olive-and-vine" }) }),
    ).rejects.toThrow(
      `redirect:${env.ACCOUNTS_API_URL}/entity/360812e1/olive-and-vine/settings/petty-cash`,
    );
  });

  it("escapes what the address holds", async () => {
    await expect(Page({ params: Promise.resolve({ ref: "a/b", slug: "c?d" }) })).rejects.toThrow(
      `redirect:${env.ACCOUNTS_API_URL}/entity/a%2Fb/c%3Fd/settings/petty-cash`,
    );
  });
});
