// Petty Cash Settings' mapping card for a company keeping its books in Minty (Xero optional,
// 2026-11-10): the API sends `minty: true` and its own five accounts, and the card draws them -
// not the "Xero isn't connected" notice - with lines that don't say "from Xero".

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountCodesCard, XeroMappingCard } from "@/components/settings/XeroCards";
import { mappingProblems, type XeroRead } from "@/lib/xeroSettings";

const account = (id: string, name: string, code: string) => ({ id, name, code });

function read(over: Partial<XeroRead> = {}): XeroRead {
  return {
    live: false,
    minty: true,
    organisation: null,
    mapping: [
      {
        key: "main_bank",
        label: "Petty Cash Account",
        kind: "account",
        options: [account("a1", "Petty Cash", "090")],
        selected: "a1",
      },
      {
        key: "deposit_bank",
        label: "Deposit Bank Account",
        kind: "account",
        options: [account("a2", "Bank", "091")],
        selected: null,
      },
      {
        key: "cashsale_account",
        label: "Cash Sales account code",
        kind: "account",
        options: [],
        selected: null,
      },
      {
        key: "owners_account",
        label: "Director Personal Account code",
        kind: "account",
        options: [],
        selected: null,
      },
      {
        key: "discrepancy_account",
        label: "Discrepancy account code",
        kind: "account",
        options: [],
        selected: null,
      },
    ],
    mapping_saved: true,
    account_codes: [{ code: "405", name: "Rent", selected: true }],
    permissions: { edit_mapping: true, edit_account_codes: true },
    ...over,
  };
}

const props = { busy: false, call: vi.fn(), connectHref: "/x", onRetry: vi.fn(), onSaved: vi.fn() };

describe("Minty on its own", () => {
  it("the mapping card draws its own accounts, with no contacts and no Xero wording", () => {
    render(<XeroMappingCard {...props} onAdded={vi.fn()} load={{ kind: "ready", read: read() }} />);
    expect(screen.getByText("Account mapping")).toBeInTheDocument();
    expect(screen.queryByText(/Xero isn.t connected/)).not.toBeInTheDocument();
    expect(screen.getByText("Select Petty Cash bank account")).toBeInTheDocument();
    expect(screen.queryByText(/Select the Customer contact/)).not.toBeInTheDocument();
  });

  it("the account codes card draws its own codes", () => {
    render(<AccountCodesCard {...props} load={{ kind: "ready", read: read() }} />);
    expect(screen.getByText(/405/)).toBeInTheDocument();
    expect(screen.queryByText(/Xero isn.t connected/)).not.toBeInTheDocument();
  });

  it("a Xero company with no connection still says so", () => {
    render(
      <XeroMappingCard
        {...props}
        onAdded={vi.fn()}
        load={{ kind: "ready", read: read({ minty: false, mapping: null, account_codes: null }) }}
      />,
    );
    expect(screen.getByText("Xero account mapping")).toBeInTheDocument();
    expect(screen.getByText(/Xero isn.t connected/)).toBeInTheDocument();
  });
});

describe("a company that banks all its sales (2026-11-10)", () => {
  it("labels the cash-sale account optional and never asks for it", () => {
    const base = read();
    const mapping = base.mapping!.map((f) =>
      f.key === "cashsale_account" ? { ...f, optional: true } : f,
    );
    render(
      <XeroMappingCard
        {...props}
        onAdded={vi.fn()}
        load={{ kind: "ready", read: read({ mapping }) }}
      />,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    const picked = {
      main_bank: "a1",
      deposit_bank: "a2",
      cashsale_account: "",
      cashsale_contact: "",
      owners_account: "x",
      owners_contact: "",
      discrepancy_account: "y",
      discrepancy_contact: "",
    };
    expect(mappingProblems(mapping, picked, true)).toEqual({});
    expect(mappingProblems(base.mapping!, picked, true)).toEqual({
      cashsale_account: "Choose the Cash Sales account code.",
    });
  });
});
