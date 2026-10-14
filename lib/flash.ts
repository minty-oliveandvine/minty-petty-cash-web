/**
 * A message that survives one navigation - Flask's flash: a refused save in the wizard sends the
 * person to the dashboard, and the dashboard shows why. Kept in sessionStorage for exactly one read.
 */

import type { ToastKind } from "@/components/flask/Toasts";

const KEY = "petty_cash_flash";

export function setFlash(message: string, kind: ToastKind = "error") {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ message, kind }));
  } catch {
    // private mode / storage blocked: the message is lost, the navigation still happens
  }
}

export function takeFlash(): { message: string; kind: ToastKind } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const value = JSON.parse(raw) as { message?: unknown; kind?: unknown };
    if (typeof value.message !== "string") return null;
    const kind = value.kind === "success" || value.kind === "warning" || value.kind === "info" ? value.kind : "error";
    return { message: value.message, kind };
  } catch {
    return null;
  }
}
