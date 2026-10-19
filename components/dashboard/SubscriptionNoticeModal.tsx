"use client";

import { Button, InlineAlert, Modal, buttonClass } from "@minty/shared/ui";

import { noticeTitle, noticeTone, payerLine, type SubscriptionNotice } from "@/lib/subscriptionNotice";

/**
 * The launch page's subscription notice (Flask's `subscriptionNoticeModal` in
 * `petty_cash/launch.html`; minty-payment-request-web's `SubscriptionNoticeModal`), on this app's
 * Part 14 Modal: "Action needed" or "Your subscription", one alert per item (a company can be past
 * due on one module and winding down another), who the payer is for anyone else, then Dismiss and,
 * for the payer only, "Go to subscription settings" - minty-web's Module page (`settingsHref`).
 * It sits over Setup Required (answered first; dismissing it reveals what sits beneath).
 */
export function SubscriptionNoticeModal({
  notice,
  settingsHref,
  onClose,
}: {
  notice: SubscriptionNotice | null;
  settingsHref: string;
  onClose: () => void;
}) {
  const open = Boolean(notice && notice.items.length);
  const payer = notice ? payerLine(notice) : null;
  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      title={notice ? noticeTitle(notice) : ""}
      zIndex={320}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            Dismiss
          </Button>
          {notice?.can_manage ? (
            <a href={settingsHref} className={buttonClass("primary")}>
              Go to subscription settings
            </a>
          ) : null}
        </>
      }
    >
      {notice ? (
        <>
          <ul className="flex flex-col gap-3">
            {notice.items.map((item) => (
              <li key={`${item.module_code}-${item.kind}`}>
                <InlineAlert tone={noticeTone(item.severity)} title={item.title}>
                  {item.detail}
                </InlineAlert>
              </li>
            ))}
          </ul>
          {payer ? <p className="mt-4 text-body-s text-text-secondary">{payer}</p> : null}
        </>
      ) : null}
    </Modal>
  );
}
