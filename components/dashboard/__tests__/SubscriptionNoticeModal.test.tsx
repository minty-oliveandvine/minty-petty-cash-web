import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SubscriptionNoticeModal } from "@/components/dashboard/SubscriptionNoticeModal";
import type { SubscriptionNotice } from "@/lib/subscriptionNotice";

const notice = (over: Partial<SubscriptionNotice> = {}): SubscriptionNotice => ({
  items: [
    { kind: "past_due", severity: "critical", module: "Petty Cash", module_code: "petty_cash", title: "Petty Cash is past due", detail: "Pay by 20 Oct.", deadline: "2026-10-20" },
    { kind: "pending_cancel", severity: "warning", module: "Bills", module_code: "billing", title: "Bills ends on 31 Oct", detail: "Undo the cancellation to keep it.", deadline: null },
  ],
  can_manage: true,
  payer: { name: "Olive", email: "olive@example.com" },
  severity: "critical",
  settings_path: null,
  ...over,
});

const HREF = "http://localhost:8000/handoff/minty-web?next=%2Fentity%2Fabcd1234%2Folive%2Fsettings%2Fmodules&entity_id=e1";

describe("the subscription notice on the launch page", () => {
  it("shows every item, and the payer's way to the subscription settings in minty-web", () => {
    render(<SubscriptionNoticeModal notice={notice()} settingsHref={HREF} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Action needed" });
    expect(dialog).toHaveTextContent("Petty Cash is past due");
    expect(dialog).toHaveTextContent("Bills ends on 31 Oct");
    expect(screen.getByRole("link", { name: "Go to subscription settings" })).toHaveAttribute("href", HREF);
    expect(dialog).not.toHaveTextContent("managed by");
  });

  it("tells anyone else who the payer is, with no settings button", () => {
    render(<SubscriptionNoticeModal notice={notice({ can_manage: false, severity: "warning" })} settingsHref={HREF} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Your subscription" });
    expect(dialog).toHaveTextContent("Billing for this company is managed by Olive (olive@example.com). Only they can change its subscription.");
    expect(screen.queryByRole("link", { name: "Go to subscription settings" })).toBeNull();
  });

  it("closes with Dismiss and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SubscriptionNoticeModal notice={notice()} settingsHref={HREF} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows nothing without a notice", () => {
    render(<SubscriptionNoticeModal notice={null} settingsHref={HREF} onClose={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
