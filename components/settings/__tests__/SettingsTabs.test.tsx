// The settings pill row on Petty Cash settings: the same sections, order and names as minty-web's
// and the payments app's, this page the current one.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsTabs } from "@/components/settings/SettingsTabs";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

function nav() {
  return screen.getByRole("navigation", { name: "Settings sections" });
}

describe("the settings pills", () => {
  it("lists every section in the order the other apps use, Petty Cash Settings the current one", () => {
    render(<SettingsTabs entityId={ENTITY} entityName="Olive & Vine" billing />);
    const pills = within(nav()).getAllByText(/./);
    expect(pills.map((p) => p.textContent)).toEqual([
      "Users",
      "Entity & Integration",
      "Petty Cash Settings",
      "Payment Request Settings",
      "Modules",
    ]);
    const current = within(nav()).getByText("Petty Cash Settings");
    expect(current.tagName).toBe("SPAN");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(nav()).queryByRole("link", { name: "Petty Cash Settings" })).toBeNull();
  });

  it("links each other section through its hand-off, never with a token", () => {
    render(<SettingsTabs entityId={ENTITY} entityName="Olive & Vine" billing />);
    const href = (name: string) => within(nav()).getByRole("link", { name }).getAttribute("href") ?? "";
    expect(new URL(href("Users")).searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/settings/users");
    expect(new URL(href("Entity & Integration")).searchParams.get("next")).toBe(
      "/entity/360812e1/olive-and-vine/settings/integration",
    );
    expect(new URL(href("Modules")).searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/settings/modules");
    expect(new URL(href("Payment Request Settings")).pathname).toBe(`/entity/${ENTITY}/settings/payment-request`);
    for (const link of within(nav()).getAllByRole("link")) {
      expect(new URL(link.getAttribute("href") ?? "").searchParams.has("token")).toBe(false);
    }
  });

  it("leaves Payment Request Settings out when the company doesn't have that module", () => {
    render(<SettingsTabs entityId={ENTITY} entityName="Olive & Vine" billing={false} />);
    expect(within(nav()).queryByText("Payment Request Settings")).toBeNull();
    expect(within(nav()).getAllByText(/./).map((p) => p.textContent)).toEqual([
      "Users",
      "Entity & Integration",
      "Petty Cash Settings",
      "Modules",
    ]);
  });
});
