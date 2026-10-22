import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DepositModal, SetupRequiredModal } from "@/components/dashboard/DepositModals";

// "Deposit to Bank" on @minty/shared/money (owner 2026-10-21: one money rule): the amount field's
// keystrokes, its currency, and the amount it hands on.

function open(currencyCode: string | null, onProceed = vi.fn()) {
  render(<DepositModal open onBack={() => undefined} previousAmount={300} currencyCode={currencyCode} busy={false} problem={null} onProceed={onProceed} />);
  return { field: screen.getByRole("textbox", { name: /Deposit Amount/ }) as HTMLInputElement, onProceed };
}

const type = (field: HTMLInputElement, value: string) => fireEvent.change(field, { target: { value } });

describe("Deposit to Bank", () => {
  it("refuses a keystroke that is not digits and one point, or past two decimals", () => {
    const { field } = open("HKD");
    type(field, "250.55");
    type(field, "250.555");
    expect(field.value).toBe("250.55");
    type(field, "25a0");
    expect(field.value).toBe("250.55");
  });

  it("names the amount allowed in the spaced form, and hands on the typed amount", () => {
    const { field, onProceed } = open("HKD");
    type(field, "400");
    expect(screen.getByRole("dialog")).toHaveTextContent("Enter HKD 300.00 or less.");
    type(field, "250.5");
    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(onProceed).toHaveBeenCalledWith(250.5);
  });

  it("shows the company's currency before the amount", () => {
    const { field } = open("HKD");
    expect(field.previousElementSibling?.textContent).toBe("HKD");
    expect(field.className).toContain("pl-14");
  });

  it("shows no prefix at all without a currency - never $", () => {
    const { field } = open(null);
    expect(field.previousElementSibling).toBeNull();
    expect(field.className).not.toContain("pl-14");
  });
});

describe("Setup Required", () => {
  // owner 2026-10-22: no currency is no silent fallback - the gate names it and links to where it is chosen
  const COUNTRY = "/entity/360812e1/olive/settings/petty-cash#country";
  const XERO = "/entity/360812e1/olive/settings/petty-cash#xero";

  it("links each missing setting to where it is set, and Set Up Settings to the first", () => {
    render(
      <SetupRequiredModal
        open
        items={[
          { text: "Choose your company's currency", href: COUNTRY },
          { text: "Main Bank Account", href: XERO },
        ]}
        fallbackHref={XERO}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Setup Required" });
    expect(within(dialog).getByRole("link", { name: "Choose your company's currency" })).toHaveAttribute("href", COUNTRY);
    expect(within(dialog).getByRole("link", { name: "Main Bank Account" })).toHaveAttribute("href", XERO);
    expect(within(dialog).getByRole("link", { name: "Set Up Settings" })).toHaveAttribute("href", COUNTRY);
  });

  it("says settings are missing when none is named, and opens the Xero cards", () => {
    render(<SetupRequiredModal open items={[]} fallbackHref={XERO} />);
    const dialog = screen.getByRole("alertdialog", { name: "Setup Required" });
    expect(dialog).toHaveTextContent("One or more required settings are missing");
    expect(within(dialog).getByRole("link", { name: "Set Up Settings" })).toHaveAttribute("href", XERO);
  });
});
