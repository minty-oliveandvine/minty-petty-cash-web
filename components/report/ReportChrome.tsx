"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { formatMoney } from "@/lib/money";
import type { OpeningPage } from "@/lib/opening";

const BADGE = "shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium sm:px-3";

/**
 * Flask's report header badge (`components/report_draft_header_badge.html`): Published (sent to
 * Xero), Publish failed, Draft (a draft, or a report not started yet), else Submitted.
 */
export function ReportBadge({ draft }: { draft: OpeningPage["draft"] }) {
  if (draft?.xero_integrated) return <span className={`${BADGE} bg-flask-badge-published-bg text-flask-badge-published-ink`}>Published</span>;
  if (draft?.publishing_status === "failed") {
    return <span className={`${BADGE} bg-flask-badge-published-bg text-flask-badge-published-ink`}>Publish failed</span>;
  }
  if (!draft || draft.status === "draft") return <span className={`${BADGE} bg-flask-submitted text-flask-badge-draft-ink`}>Draft</span>;
  return <span className={`${BADGE} bg-flask-red-soft text-flask-red`}>Submitted</span>;
}

/** Flask's `components/loading_overlay.html`: over the phone card while a step saves. */
export function LoadingOverlay({ text = "Saving..." }: { text?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-flask-black/30" role="status">
      <div className="flex items-center gap-3 rounded-flask-lg bg-flask-white p-4 shadow-flask-lg">
        <svg className="h-5 w-5 animate-spin text-flask-teal" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="font-medium text-flask-gray-700">{text}</span>
      </div>
    </div>
  );
}

/**
 * Flask's modal frame on the report pages: a half-black backdrop over the phone card and a white
 * panel, 384px at most (448px `wide`). A click outside or Escape closes it.
 */
export function Modal({
  titleId,
  onClose,
  className,
  wide = false,
  children,
}: {
  titleId: string;
  onClose: () => void;
  className: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-flask-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`mx-auto w-full min-w-0 ${wide ? "max-w-md" : "max-w-sm"} outline-none ${className}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Shrinks a one-line figure until it fits its box (Flask's `fitBalanceText` on Deposit and Cash
 * Count: a pixel at a time, never below 12px), and again on resize.
 */
export function useFitText<T extends HTMLElement = HTMLParagraphElement>(on: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const fit = () => {
      el.style.fontSize = "";
      const max = el.parentElement?.clientWidth ?? el.clientWidth;
      if (!max) return;
      let size = Number.parseFloat(window.getComputedStyle(el).fontSize);
      while (el.scrollWidth > max && size > 12) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [on]);
  return ref;
}

/**
 * Flask's #fixNegativeBalanceModal, the same frame on every step that has one: the title, "Current
 * Balance" with the figure (in brackets and red when below zero), the step's sentence and its way
 * out (`children`, {@link FixStepButton}s). It cannot be dismissed - no close, no Escape, no
 * outside click. Deposit and Cash Count (`window`) draw it outside the phone card, so it covers the
 * whole window, and shrink the figure to one line; Opening's sits over the card.
 */
export function FixNegativeBalanceModal({
  balance,
  currencyCode,
  message,
  window: overWindow = false,
  children,
}: {
  balance: number;
  currencyCode: string | null;
  message: string;
  window?: boolean;
  children: ReactNode;
}) {
  const fit = overWindow;
  const figure = useFitText(fit);
  const shown = balance < 0 ? `(${formatMoney(Math.abs(balance), currencyCode)})` : formatMoney(balance, currencyCode);
  return (
    <div className={`${overWindow ? "fixed" : "absolute"} inset-0 z-50 flex items-center justify-center bg-flask-black/50 p-4`}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="fix-negative-title" className="mx-auto w-full max-w-sm rounded-flask-lg bg-flask-white p-6">
        <div className="mb-6">
          <h2 id="fix-negative-title" className="mb-2 text-xl font-bold text-flask-gray-900">
            Fix Negative Balance
          </h2>
          <p className="mb-1 text-sm text-flask-gray-600">Current Balance</p>
          <p
            ref={figure}
            className={`mb-4 text-center text-3xl font-semibold ${fit ? "whitespace-nowrap" : ""} ${balance < 0 ? "text-flask-red-600" : "text-flask-gray-900"}`}
          >
            {shown}
          </p>
          <p className="text-sm text-flask-gray-600">{message}</p>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

/** One way out of {@link FixNegativeBalanceModal}: the step's name, its figure in brackets, the chevron. */
export function FixStepButton({ label, note, noteClass, onClick }: { label: string; note: string; noteClass: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-flask-xl border border-flask-teal-soft bg-flask-white px-4 py-3 text-left text-flask-gray-700 transition-colors hover:bg-flask-gray-50"
    >
      <span className="flex min-w-0 items-center">
        {label}
        <span className={`ml-2 min-w-0 ${noteClass}`}>{note}</span>
      </span>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0 text-flask-gray-900 transition-transform group-hover:translate-x-1" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}

/** A figure as the Fix modal's buttons write it: `formatMoney`'s `HKD 1,234.50` (Flask's had the same space after the code). */
export function fixNote(kind: "Cash in" | "Cash out", amount: number, currencyCode: string | null): string {
  return `(${kind}: ${formatMoney(amount, currencyCode)})`;
}

/** Flask's Save & Next (the teal bar with its arrow, a form's submit) and Save & Exit under it. */
export function SaveButtons({ disabled, onExit }: { disabled: boolean; onExit: () => void }) {
  return (
    <div>
      <button
        type="submit"
        disabled={disabled}
        className="group flex min-h-[40px] w-full items-center justify-center gap-4 rounded-flask-xl bg-flask-teal px-4 py-3 font-medium text-flask-white shadow-flask-md transition-colors hover:bg-flask-teal/80 disabled:opacity-70"
      >
        <span>Save &amp; Next</span>
        <svg className="transition-transform group-hover:translate-x-1" width="14" height="13" viewBox="0 0 14 13" fill="none" aria-hidden="true">
          <path
            d="M10.534 5.66477L6.16282 1.18659L7.31648 -9.53674e-07L13.6377 6.50026L7.31648 13L6.16282 11.8139L10.534 7.33576H0.637695V5.66477H10.534Z"
            className="fill-flask-white"
          />
        </svg>
      </button>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          disabled={disabled}
          onClick={onExit}
          className="flex min-h-[40px] items-center justify-center px-4 py-2 text-sm font-medium text-flask-teal transition-colors hover:text-flask-teal/80"
        >
          <span>Save &amp; Exit</span>
        </button>
      </div>
    </div>
  );
}

/** A field's own message, under it (the Responsive UI rules' as-you-type check, Part 11 wording). */
export function FieldMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 text-sm text-flask-danger-ink">
      {children}
    </p>
  );
}

/**
 * Flask's report-page illustration: a grey circle (`.image-skeleton`, at the top of the box) while
 * it loads, then the picture fading in and the box closing to the picture's height.
 */
export function StepImage({
  src,
  alt,
  width,
  height,
  boxClass,
  minHeight,
  skeleton,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** The box's width and bottom margin (Flask's `mb-10 w-[240px]`, `mb-6 w-[180px]`). */
  boxClass: string;
  /** The box's height until the picture has loaded, px. */
  minHeight: number;
  /** The circle's size, px. */
  skeleton: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative mx-auto block ${boxClass}`} style={{ minHeight: loaded ? "auto" : minHeight }}>
      {!loaded && !failed ? (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 animate-pulse rounded-full bg-flask-gray-200" style={{ width: skeleton, height: skeleton }} />
      ) : null}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        unoptimized
        priority
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`relative mx-auto block h-auto w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
