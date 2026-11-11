// The "Talk to Minty" cat in Petty Cash: drawn by @minty/shared/contact inside the sidebar shell,
// it sends through THIS app's reach into Flask (`mintyFetch`, `ACCOUNTS_API_URL`) and confirms with
// the app's toast. The public share page carries no cat, as it carries no sidebar.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

import { ToastProvider } from "@/components/flask/Toasts";
import { SidebarShell } from "@/components/ui/SidebarShell";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const TOKEN = "h.eyJ1c2VyX2lkIjoidTEifQ.s";
const PROFILE = { user: { id: "u1", name: "John Birmingha", initials: "JB" } };

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

function show() {
  render(
    <ToastProvider>
      <SidebarShell>
        <p>The page</p>
      </SidebarShell>
    </ToastProvider>,
  );
}

beforeEach(() => {
  // a fresh browser: the cat starts tucked (a test that brings it back stores "0")
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) =>
    String(input).includes("/api/me/contact")
      ? json({ sent: true, reply_to: "john@example.com" })
      : json(PROFILE),
  );
  _resetHandoffForTests(vi.fn());
  setAuth(TOKEN, ENTITY, "Olive & Vine");
  window.history.replaceState({}, "", "/entity/360812e1/olive-and-vine/petty-cash");
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetHandoffForTests();
});

describe("the Minty cat in Petty Cash", () => {
  it("sends the chat's message to Flask with the bearer and this company, then toasts", async () => {
    show();
    // the cat starts tucked; its tab brings it back with the pop-up open (@minty/shared v0.18)
    await userEvent.click(await screen.findByRole("button", { name: "Bring Minty back" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Talk to Minty" }));
    const chat = within(screen.getByRole("dialog", { name: "Talk to Minty" }));
    expect(chat.getByText("Hi John! What can I help you with?")).toBeInTheDocument();
    await userEvent.click(chat.getByRole("button", { name: "Contact Support" }));
    // the chat asks one thing at a time; each is sent as its own answer
    for (const [label, value] of [
      ["Your name", "Olive Vine"],
      ["Your email", "olive@test.com"],
      ["Your company", "Olive Tree Cafe"],
    ]) {
      await userEvent.type(chat.getByLabelText(label), value);
      await userEvent.click(chat.getByRole("button", { name: "Send answer" }));
    }
    await userEvent.click(chat.getByRole("button", { name: "Xero / integrations" }));
    await userEvent.type(chat.getByLabelText("Your message"), "Publishing failed.");
    await userEvent.click(chat.getByRole("button", { name: "Send answer" }));
    await userEvent.click(chat.getByRole("button", { name: "Send" }));

    expect(await chat.findByText(/Sent! We'll reply to john@example.com/)).toBeInTheDocument();
    expect(await screen.findByText("Message sent. We'll reply by email.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/api/me/contact"))!;
    expect(String(call[0])).toBe(`${env.ACCOUNTS_API_URL}/api/me/contact`);
    expect(call[1]?.method).toBe("POST");
    expect(new Headers(call[1]?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      name: "Olive Vine",
      email: "olive@test.com",
      company: "Olive Tree Cafe",
      topic: "Xero / integrations",
      message: "Publishing failed.",
      app: "minty-petty-cash-web",
      entity: ENTITY,
    });
  });

  it("is not drawn on the public share page", async () => {
    window.history.replaceState({}, "", "/share/OV/2026-11-05/secret");
    show();
    expect(await screen.findByText("The page")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: "Talk to Minty" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bring Minty back" })).toBeNull();
  });
});
