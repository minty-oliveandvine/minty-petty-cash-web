"use client";

import type { ReactNode } from "react";

import { Button } from "@minty/shared/ui";

/** Flask's page, word for word: the reason beside a Save this person may not press. */
export const NO_RIGHT = "Only Accountants and Admins can change these.";
export const NOTHING_YET = "No changes to save yet.";
export const NOT_SAVED = "We couldn't reach Petty Cash, so this wasn't saved. Check your connection, then try again.";

/** A settings card (15.20b): a Section header (h2 + why), its fields, then its own Save. */
export function Card({ id, title, sub, children }: { id: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border-subtle bg-surface-card p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-title-l text-text-primary">
          {title}
        </h2>
        <p className="text-body-m text-text-secondary">{sub}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * A card's Save (Part 14 Button, Primary): first and full width on a phone, at the right from 640.
 * Disabled with its reason beside it while the person may not change the card, a rule holds it
 * (`blocked`), or nothing changed.
 */
export function CardSave({
  id,
  may,
  dirty,
  saving,
  blocked = null,
  onSave,
}: {
  id: string;
  may: boolean;
  dirty: boolean;
  saving: boolean;
  blocked?: string | null;
  onSave: () => void;
}) {
  const reason = !may ? NO_RIGHT : blocked ? blocked : !dirty && !saving ? NOTHING_YET : null;
  const reasonId = `${id}-save-reason`;
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row-reverse sm:items-center sm:justify-start sm:gap-3">
      <Button
        kind="primary"
        className="w-full sm:w-auto"
        onClick={onSave}
        disabled={reason !== null}
        processing={saving}
        processingLabel="Saving…"
        aria-describedby={reason ? reasonId : undefined}
      >
        Save
      </Button>
      {reason ? (
        <p id={reasonId} className="text-body-s text-text-secondary">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
