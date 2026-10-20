// My Profile opens as the sidebar's sheet, over the page - never minty-web's page through Flask
// (the owner, 2026-10-20) - in the redesign's look on this branch. The panel and its
// Subscriptions Overview are the package's (`@minty/shared/profile`); what this app owns is the
// wiring: its Flask and subscription-api reads and its toast.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

import { PROFILE_LOOK } from "@minty/shared/profile";
import { ViewerBadge } from "@minty/shared/sidebar";

import { AppSidebar } from "@/components/ui/AppSidebar";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const PROFILE = {
  user: {
    id: "u1",
    first_name: "John",
    last_name: "Birmingha",
    name: "John Birmingha",
    initials: "JB",
    email: "john@example.com",
  },
  entity: {
    id: ENTITY,
    name: "Olive & Vine",
    role: "admin",
    role_label: "Admin",
    modules: ["PETTY_CASH"],
  },
};
const SUBSCRIPTIONS = {
  entities: [{ modules: [{ status: "active", date_iso: "2026-11-20" }] }],
  page: 1,
  pages: 1,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          String(input).includes("/api/me/subscriptions")
            ? SUBSCRIPTIONS
            : PROFILE,
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
  );
  _resetHandoffForTests(vi.fn());
  setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ENTITY, "Olive & Vine");
  window.history.replaceState(
    {},
    "",
    "/entity/360812e1/olive-and-vine/petty-cash",
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetHandoffForTests();
});

describe("My Profile in Petty Cash (development)", () => {
  it("the badge opens the sheet over the page, in the redesign, with no password row", async () => {
    render(
      <AppSidebar>
        <ViewerBadge />
      </AppSidebar>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "John Birmingha, My Profile" }),
    );

    const region = await screen.findByRole("region", { name: "My Profile" });
    const sheet = within(region);
    expect(
      await sheet.findByRole("heading", { level: 2, name: "John Birmingha" }),
    ).toBeInTheDocument();
    expect(sheet.queryByText(/password/i)).toBeNull();
    expect(
      await sheet.findByRole("link", { name: "Manage Subscription" }),
    ).toBeInTheDocument();
    expect(region.firstElementChild).toHaveClass(
      ...PROFILE_LOOK.v2.panel.split(" "),
    );

    // the panel's read names this company (the badge's own viewer read does not)
    const reads = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .filter((u) => u.pathname === "/api/me/profile");
    expect(reads.some((u) => u.searchParams.get("entity") === ENTITY)).toBe(
      true,
    );
    expect(window.location.pathname).toBe(
      "/entity/360812e1/olive-and-vine/petty-cash",
    );
  });
});
