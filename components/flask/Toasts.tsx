"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Flask's toasts (`templates/components/flash_messages.html`), exactly: a stack top-right, 320px
 * wide; each a white card with a 1px grey border and a 4px radius, its kind as a bold label
 * ("Success", "Error", "Warning", "Information"), the message in grey, a "×" to dismiss, gone
 * after 4 seconds. Errors are announced as alerts, the rest as status.
 */

export type ToastKind = "success" | "error" | "warning" | "info";
const LABEL: Record<ToastKind, string> = { success: "Success", error: "Error", warning: "Warning", info: "Information" };
const SHOW_MS = 4000;

type Toast = { id: number; kind: ToastKind; message: string };
type Show = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<Show | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<Show>(
    (message, kind = "error") => {
      const id = nextId++;
      setToasts((all) => [...all, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), SHOW_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[400] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            data-toast-type={t.kind}
            className="pointer-events-auto flex items-start gap-3 rounded-flask border border-flask-gray-200 bg-flask-white p-3 text-left text-sm text-flask-ink shadow-flask"
          >
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold">{LABEL[t.kind]}</p>
              <p className="m-0 text-flask-gray-500 [overflow-wrap:anywhere]">{t.message}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="cursor-pointer border-0 bg-transparent p-0 text-sm text-flask-gray-500 hover:text-flask-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs <ToastProvider> - app/layout.tsx wraps every page in it.");
  return show;
}
