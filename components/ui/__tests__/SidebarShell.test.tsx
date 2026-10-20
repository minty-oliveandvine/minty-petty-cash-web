// My Profile opens as the sidebar's sheet, over the page - never minty-web's page through Flask
// (the owner, 2026-10-20). The panel is the package's (`@minty/shared/profile`); what this app owns
// is the wiring: its Flask fetch (lib/profileApi.ts) and its toast.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

import { PROFILE_LOOK } from "@minty/shared/profile";
import { ViewerBadge } from "@minty/shared/sidebar";

import { PhoneCard } from "@/components/flask/PhoneCard";
import { ToastProvider } from "@/components/flask/Toasts";
import { SidebarShell } from "@/components/ui/SidebarShell";
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
  entities: [{ entity_id: ENTITY, modules: [{ status: "active", date_iso: "2026-11-20" }] }],
  page: 1,
  pages: 1,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // Flask's profile; subscription-api's list (one company paying, one page)
  fetchMock.mockImplementation((input) => {
    const body = String(input).includes("/api/me/subscriptions") ? SUBSCRIPTIONS : PROFILE;
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  });
  _resetHandoffForTests(vi.fn());
  setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ENTITY, "Olive & Vine");
  window.history.replaceState({}, "", "/entity/360812e1/olive-and-vine/petty-cash");
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetHandoffForTests();
});

describe("My Profile in Petty Cash", () => {
  it("opens as the sidebar's sheet over the page, reading Flask's profile for this company", async () => {
    render(
      <ToastProvider>
        <SidebarShell>
          <ViewerBadge />
        </SidebarShell>
      </ToastProvider>,
    );
    const badge = await screen.findByRole("button", { name: "John Birmingha, My Profile" });
    await userEvent.click(badge);

    const sheet = within(await screen.findByRole("region", { name: "My Profile" }));
    expect(await sheet.findByRole("heading", { level: 2, name: "John Birmingha" })).toBeInTheDocument();
    expect(sheet.getByText("Olive & Vine")).toBeInTheDocument();
    expect(sheet.getByText("john@example.com")).toBeInTheDocument();
    expect(sheet.queryByText(/password/i)).toBeNull();
    // main draws the original design (the owner, 2026-10-20)
    expect(screen.getByRole("region", { name: "My Profile" }).firstElementChild).toHaveClass(...PROFILE_LOOK.classic.panel.split(" "));
    // the Subscriptions Overview, from subscription-api, with Manage Subscription into minty-web's portal
    const overview = within(await sheet.findByRole("region", { name: "Subscriptions Overview" }));
    expect(await overview.findByText("Active subscriptions")).toBeInTheDocument();
    const manage = new URL(overview.getByRole("link", { name: "Manage Subscription" }).getAttribute("href")!);
    expect(manage.pathname).toBe("/handoff/minty-web");
    expect(manage.searchParams.get("next")).toBe("/subscription");

    const urls = fetchMock.mock.calls.map(([u]) => new URL(String(u)));
    const read = urls.find((u) => u.pathname === "/api/me/profile" && u.searchParams.get("entity") === ENTITY);
    expect(read?.origin).toBe("http://localhost:8000");
    // over the page: nothing navigated, and no hand-off to minty-web's /profile
    expect(window.location.pathname).toBe("/entity/360812e1/olive-and-vine/petty-cash");
    expect(urls.some((u) => u.pathname.startsWith("/handoff/"))).toBe(false);
  });

  it("Flask's header initials open the same sheet - a button now, not a link to minty-web's page", async () => {
    render(
      <ToastProvider>
        <SidebarShell>
          <PhoneCard acronym="OV" backHref="/entities">
            <p>The dashboard</p>
          </PhoneCard>
        </SidebarShell>
      </ToastProvider>,
    );
    expect(screen.queryByRole("link", { name: "My Profile" })).toBeNull();
    const initials = await screen.findByRole("button", { name: "My Profile" });
    await waitFor(() => expect(initials).toHaveTextContent("JB"));
    await userEvent.click(initials);

    const sheet = within(await screen.findByRole("region", { name: "My Profile" }));
    expect(await sheet.findByRole("heading", { level: 2, name: "John Birmingha" })).toBeInTheDocument();
    expect(initials).toHaveAttribute("aria-expanded", "true");
    expect(window.location.pathname).toBe("/entity/360812e1/olive-and-vine/petty-cash");
  });
});
