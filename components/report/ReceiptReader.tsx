"use client";

/**
 * The receipt reader in Add New Expense, drawn as Flask's classic page drew it
 * (`static/js/expense_ai.js`, Minty `351e942`): the read itself (`POST /reports/expenses/extract`)
 * and the pieces the card draws around its fields - the teal "Reading the receipt…" box under the
 * drop zone, the line under a suggested field with Clear, and the grey note offering the receipt's
 * different reading. The rules are lib/expenseAi.ts.
 *
 * Every failure is silent, by design (Flask: "unavailable means invisible"): no toast, no banner,
 * the card exactly as it is without the reader. The API logs its own failures. A `disabled`
 * answer switches the reader off for the session.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { pettyCashFetch } from "@/lib/apiClient";
import {
  CLEAR_LABEL,
  noteAnswer,
  readerOff,
  readingCopy,
  suggestedText,
  suggestionsOf,
  USE_LABEL,
  type Band,
  type ExtractAnswer,
  type SuggestedField,
  type Suggestions,
} from "@/lib/expenseAi";

export const EXTRACT_PATH = "/reports/expenses/extract";

/** The ring on a field holding an untouched suggestion (Flask: `ring-2 ring-[#54D3DA] ring-offset-1`). */
export const SUGGESTED_RING = "ring-2 ring-flask-teal ring-offset-1";

/**
 * One read at a time: a new receipt, Cancel, Add or closing the card cancels the one in flight,
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

  // Closing the card drops whatever is in flight.
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
      const answer = await pettyCashFetch<ExtractAnswer>(EXTRACT_PATH, {
        method: "POST",
        form: body,
        signal: abort.signal,
        onUnauthorized: "reject",
      });
      noteAnswer(answer);
      if (mine !== token.current) return;
      const suggestions = suggestionsOf(answer);
      if (suggestions) onSuggestions(suggestions);
    } catch {
      // Silent by design (see above): a refusal, a cut connection or an abort leaves the card as it is.
    } finally {
      if (mine === token.current) {
        controller.current = null;
        setReading(false);
      }
    }
  }

  return { reading, read, cancel };
}

/** While the receipt is read: Flask's teal box (QA found 12px grey text was missed; the wait is seconds). */
export function ReadingNotice() {
  return (
    <div
      role="status"
      className="mb-1 mt-3 flex items-center gap-3 rounded-flask-xl border border-flask-teal bg-flask-teal/10 px-4 py-3"
    >
      <svg
        className="h-5 w-5 shrink-0 animate-spin text-flask-teal-pill"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-flask-teal-pill">Reading the receipt…</p>
        <p className="text-xs text-flask-gray-500">
          This can take a few seconds. You can start typing now if you prefer.
        </p>
      </div>
    </div>
  );
}

/**
 * Under a suggested field: the sparkle, "<Field> suggested" (and "— please check" for the medium
 * band) and Clear. Its id goes in the field's aria-describedby, so the line is read with the field.
 */
export function SuggestedLine({
  id,
  field,
  band,
  onClear,
}: {
  id: string;
  field: SuggestedField;
  band: Band;
  onClear: () => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-flask-teal-pill">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.4 6.2L21 10l-6.6 1.8L12 18l-2.4-6.2L3 10l6.6-1.8L12 2z" />
      </svg>
      <span id={id}>{suggestedText(field, band)}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={CLEAR_LABEL}
        className="min-h-11 min-w-11 cursor-pointer font-medium underline hover:no-underline"
      >
        Clear
      </button>
    </div>
  );
}

/**
 * Flask's grey note with one action: the receipt reads something else, or names a supplier that is
 * not on the list. The text came off a receipt image: drawn as text, never as markup.
 */
export function ReceiptNote({
  text,
  action = USE_LABEL,
  onAction,
}: {
  text: string;
  action?: string;
  onAction: () => void;
}) {
  return (
    <div className="mt-2 rounded-flask-lg border border-flask-gray-200 bg-flask-gray-50 px-3 py-2.5 text-sm">
      <p className="break-words text-flask-gray-600">{text}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-1 min-h-11 cursor-pointer break-words text-left font-medium text-flask-teal-pill underline hover:no-underline"
      >
        {action}
      </button>
    </div>
  );
}
