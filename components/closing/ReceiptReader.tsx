"use client";

/**
 * The receipt reader in the expense form (Part 15.14 AI-assisted, Part 14 AI field; Flask's
 * `static/js/expense_ai.js`): the read itself (`POST /reports/expenses/extract`) and the pieces
 * the form draws around its fields - the calm Reading notice, the source line under a suggested
 * field with Clear, and the note offering the receipt's different reading. The rules are
 * lib/expenseAi.ts.
 *
 * Every failure is silent, by design (15.14 "failed: enter manually"; Flask: "unavailable means
 * invisible"): no toast, no banner, the form exactly as it is without the reader. The API logs
 * its own failures. A `disabled` answer switches the reader off for the session.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Icon, InlineAlert } from "@minty/shared/ui";

import { pettyCashFetch } from "@/lib/apiClient";
import { clearLabel, noteAnswer, readerOff, readingCopy, suggestedText, suggestionsOf, type Band, type ExtractAnswer, type ReadNote, type SuggestedField, type Suggestions } from "@/lib/expenseAi";

export const EXTRACT_PATH = "/reports/expenses/extract";

/**
 * One read at a time: a new receipt, Remove, Add or closing the form cancels the one in flight,
 * and an answer for a receipt no longer there is dropped (a token, as Flask's `requestToken`).
 */
export function useReceiptReader(onSuggestions: (suggestions: Suggestions) => void) {
  const token = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [reading, setReading] = useState(false);

  const cancel = useCallback(() => {
    token.current += 1;
    controller.current?.abort();
    controller.current = null;
    setReading(false);
  }, []);

  // Closing the form drops whatever is in flight.
  useEffect(
    () => () => {
      token.current += 1;
      controller.current?.abort();
    },
    [],
  );

  async function read(file: File) {
    cancel();
    if (readerOff()) return;
    const mine = token.current;
    const abort = new AbortController();
    controller.current = abort;
    setReading(true);
    try {
      const copy = await readingCopy(file);
      if (mine !== token.current) return;
      const body = new FormData();
      // The bytes are the reading copy; the name stays the receipt's own.
      body.set("receipt", copy, file.name);
      const answer = await pettyCashFetch<ExtractAnswer>(EXTRACT_PATH, { method: "POST", form: body, signal: abort.signal, onUnauthorized: "reject" });
      noteAnswer(answer);
      if (mine !== token.current) return;
      const suggestions = suggestionsOf(answer);
      if (suggestions) onSuggestions(suggestions);
    } catch {
      // Silent by design (see above): a refusal, a cut connection or an abort leaves the form as it is.
    } finally {
      if (mine === token.current) {
        controller.current = null;
        setReading(false);
      }
    }
  }

  return { reading, read, cancel };
}

/** While the receipt is read: Part 14 Inline alert, Info - no character in an active form (13.11). */
export function ReadingNotice() {
  return (
    <InlineAlert tone="info" title="Minty is reading the receipt…">
      This can take a few seconds. You can start typing now if you prefer.
    </InlineAlert>
  );
}

/** The source line (Part 14 AI field), used as the field's helper so it is in its aria-describedby. */
export function SuggestedHelper({ band }: { band: Band }) {
  return (
    <span className="inline-flex items-start gap-1">
      <Icon name="auto_awesome" size="sm" className="mt-px" />
      <span>{suggestedText(band)}</span>
    </span>
  );
}

/** Under a suggested field: Clear (the value goes with its marking) - or the receipt's other reading, offered. */
export function SuggestionExtras({
  field,
  marked,
  note,
  disabled,
  onClear,
  onUse,
}: {
  field: SuggestedField;
  marked: boolean;
  note: ReadNote | undefined;
  disabled: boolean;
  onClear: () => void;
  onUse: () => void;
}) {
  if (!marked && !note) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {marked ? (
        <div className="flex">
          <Button kind="link" onClick={onClear} disabled={disabled} aria-label={clearLabel(field)}>
            Clear
          </Button>
        </div>
      ) : null}
      {note ? (
        <ReceiptNote text={note.text} action={`Use the ${field} from the receipt`} disabled={disabled} onAction={onUse} />
      ) : null}
    </div>
  );
}

/** A quiet note with one action: the receipt reads something else, or names an unknown supplier. Untrusted text, drawn as text. */
export function ReceiptNote({ text, action, disabled, onAction }: { text: string; action: string | null; disabled: boolean; onAction: () => void }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-lg bg-surface-sunk px-3 py-2">
      <p className="min-w-0 break-words text-body-s text-text-secondary">{text}</p>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="min-h-11 min-w-0 cursor-pointer break-words text-left text-body-s font-medium text-text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:text-text-disabled"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
