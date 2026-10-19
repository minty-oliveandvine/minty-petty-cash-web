"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";

import { Button, Field, Icon, InlineAlert, inputClass, PageBanner, Skeleton, StatusPill, type StatusTone } from "@minty/shared/ui";

import { AppBar } from "@/components/layout/AppBar";
import { StepProgress, type StepProgressStep } from "@/components/ui/StepProgress";
import { ApiError, pettyCashFetch } from "@/lib/apiClient";
import { getAuth } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { sanitizeMoney, groupMoney } from "@/lib/currencyInput";
import { stageOf, stageSection, stagesOnPage, type StageKey } from "@/lib/dailyClosing";
import { formatWeekdayDay } from "@/lib/dates";
import { setFlash, takeFlash, type FlashKind } from "@/lib/flash";
import { leaveTo } from "@/lib/handoff";
import { useAuth } from "@/lib/useAuth";
import { outcomeHref, stepHref, type WizardStep } from "@/lib/wizardPages";

/**
 * What every Daily Closing stage page shares (Part 15.9 / 15.15): the frame (App bar, a centred
 * 720 column, phone first), the read and its loading / failed states, a message another page left
 * for this one, the Workflow header, the stages, the unsaved-changes hold, the Amount input and
 * Save & Next / Save & Exit. Each stage (AdditionToDrawer.tsx, Sales.tsx, Expenses.tsx, CashCount.tsx, Close.tsx) draws only its form.
 */

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
export const NOT_SAVED = "We couldn't save this stage. Check your connection, then try again.";
const UNSAVED = "Your changes to this stage are not saved yet. Save them with Save & Next or Save & Exit first.";

type Flash = { message: string; kind: FlashKind } | null;
type Load<T> = { kind: "loading" } | { kind: "ready"; page: T } | { kind: "failed"; message: string };

/** A flash's tone as a Page banner - an error is Danger, and never a toast (Part 14, 15.10). */
const FLASH_TONE = { error: "danger", warning: "warning", success: "success", info: "info" } as const;

export type StageContext = {
  entityId: string;
  entityName: string;
  /** The launch page. */
  home: string;
  /** A message another page left for this one (lib/flash.ts) - drawn under the Workflow header. */
  notice: ReactNode;
};

/**
 * A stage page: reads `path` for `day`, then hands the answer to `children`. Until then the
 * Workflow header shows its title at once and the rest is skeleton; a failed read is a Danger
 * inline alert in its place.
 */
export function StagePage<T>({
  path,
  day,
  title,
  guidance,
  here,
  children,
}: {
  path: string;
  day: string | null;
  title: string;
  guidance: string;
  /**
   * This stage, for a read the API refuses with a place to go (`{error, to}`) - Expenses' read is
   * a 409 `to: "opening"` when the day has no draft, Close's also `to: "submitted"` when the day
   * is already submitted: the person is taken there (in place of this page) and told why, as a
   * refused save is (`refused`). Without it every refusal is a Danger inline alert here.
   */
  here?: StageKey;
  children: (page: T, context: StageContext) => ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [load, setLoad] = useState<Load<T>>({ kind: "loading" });
  // Taken once - in a ref, so a development re-run of the effect does not lose it - and shown once
  // the page has data, under the header (15.1: a page-wide state goes under the header).
  const flash = useRef<Flash | undefined>(undefined);
  const [shownFlash, setShownFlash] = useState<Flash>(null);

  useEffect(() => {
    let live = true;
    if (flash.current === undefined) flash.current = takeFlash();
    pettyCashFetch<T>(path, { query: { transaction_date: day ?? undefined } })
      .then((page) => {
        if (!live) return;
        setShownFlash(flash.current ?? null);
        setLoad({ kind: "ready", page });
      })
      .catch((err: unknown) => {
        // A 401 has already gone back through the hand-off.
        if (!live || (err instanceof ApiError && err.status === 401)) return;
        const auth = getAuth();
        if (here && day && auth && err instanceof ApiError && typeof (err.body as { to?: unknown } | null)?.to === "string") {
          const home = pettyCashHome(auth.entityId, auth.entityName);
          // In place of this page, which never showed: Back must not land on a page that sends it on again.
          const push = (href: string) => router.replace(href);
          if (refused(err, { here, push, entityId: auth.entityId, entityName: auth.entityName, home, day }) === undefined) return;
        }
        setShownFlash(flash.current ?? null);
        setLoad({ kind: "failed", message: err instanceof ApiError ? err.message : UNREACHABLE });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per stage and day; `here` and the router are fixed for a page
  }, [path, day]);

  const entityId = auth?.entityId ?? "";
  const entityName = auth?.entityName ?? "";
  const home = auth ? pettyCashHome(entityId, entityName) : "";
  const notice = shownFlash ? <PageBanner tone={FLASH_TONE[shownFlash.kind]}>{shownFlash.message}</PageBanner> : null;

  return (
    <>
      <AppBar companyName={entityName} />
      {/* Part 15.D: page padding 16 / 24 / 32; a workflow is a centred 720 column (15.9, 15.15). */}
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6">
          {load.kind === "ready" && auth ? (
            children(load.page, { entityId, entityName, home, notice })
          ) : (
            <>
              <WorkflowHeader home={home} day={day} title={title} guidance={guidance} />
              {notice}
              {load.kind === "failed" ? (
                <InlineAlert tone="danger">{load.message}</InlineAlert>
              ) : (
                <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-11 w-full sm:ml-auto sm:w-56" />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * Part 15.1's Workflow header: the way back to the launch page, "Daily Closing · <day>" with the
 * report's status pill (the line Flask's App-bar date pill moves to), the Step progress, then the
 * stage title (the page's h1) and one sentence of guidance. While loading the title shows at once
 * and the rest is skeleton.
 */
export function WorkflowHeader({
  home,
  day,
  title,
  guidance,
  status,
  steps,
  onLeave,
  held,
}: {
  home: string;
  day: string | null;
  title: string;
  guidance: string;
  status?: { label: string; tone: StatusTone };
  steps?: StepProgressStep[];
  /** A click on a way out of the stage (the back link, a stage) - held while changes are unsaved. */
  onLeave?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  /** Shown under the stages: why a way out was held. */
  held?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {home ? (
          <Link
            href={home}
            onClick={onLeave ? (event) => onLeave(event, home) : undefined}
            className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-body-m font-medium text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <Icon name="chevron_left" size="md" />
            Petty Cash
          </Link>
        ) : (
          <span className="min-h-11" aria-hidden />
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {day ? (
            <p className="min-w-0 text-body-m text-text-secondary">
              Daily Closing &middot; {formatWeekdayDay(day)}
            </p>
          ) : (
            <Skeleton className="h-5 w-48" />
          )}
          {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
        </div>
      </div>
      {steps ? (
        <StepProgress
          steps={steps}
          label="Daily Closing stages"
          onStepClick={onLeave ? (event, step) => step.href && onLeave(event, step.href) : undefined}
        />
      ) : (
        <Skeleton className="h-[70px] w-full" />
      )}
      {held}
      <div className="flex flex-col gap-1">
        <h1 className="min-w-0 break-words text-display-m text-text-primary">{title}</h1>
        <p className="text-body-m text-text-secondary">{guidance}</p>
      </div>
    </div>
  );
}

/**
 * The Step progress on a stage's own page: this stage current, done or not; done stages are links
 * to where they were left (`stageSection`; Cash Count at the deposit unless the report is in
 * `cash_count`); stages not done wait for their turn - Save & Next is the way forward (15.9d).
 */
export function stageSteps(
  entityId: string,
  entityName: string,
  progress: { current_section: string | null; completed_sections: string[] },
  here: StageKey,
  day: string,
): StepProgressStep[] {
  return stagesOnPage(progress.completed_sections, here).map(({ stage, state }) => ({
    label: stage.short,
    state,
    href: state === "done" ? stepHref(entityId, entityName, stageSection(stage, progress.current_section), day) : undefined,
  }));
}

/**
 * Unsaved changes hold the stage links and the back link: a warning inline alert under the stages
 * says so, with Leave without saving. Putting the change back clears it. A reload or a typed
 * address is not held.
 */
export function useLeaveHold(dirty: boolean, saving: boolean) {
  const [heldHref, setHeldHref] = useState<string | null>(null);

  function onLeave(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty || saving) return;
    event.preventDefault();
    setHeldHref(href);
  }

  const held =
    heldHref && dirty ? (
      <InlineAlert
        tone="warning"
        action={
          <Button kind="link" onClick={() => leaveTo(heldHref)}>
            Leave without saving
          </Button>
        }
      >
        {UNSAVED}
      </InlineAlert>
    ) : null;

  return { onLeave, held, release: () => setHeldHref(null) };
}

type Push = (href: string) => void;

/** Open a section of the day's report - every one is this app's own stage page. */
export function openStep(push: Push, entityId: string, entityName: string, step: WizardStep, day: string) {
  push(stepHref(entityId, entityName, step, day));
}

/**
 * A refused save. A refusal that names another place (`to`) goes there and says why there, as a
 * Page banner read once (lib/flash.ts, Flask's flash; never a toast): `dashboard` is the launch
 * page, a section is that section's stage, and `submitted` (with its `report_id`: the day is
 * already submitted) is the report's outcome page, which says so itself. Anything else stays on
 * this stage: the sentence to show inline is returned. A 401 has already gone back through the
 * hand-off (undefined).
 */
export function refused(
  err: unknown,
  { here, push, entityId, entityName, home, day }: { here: StageKey; push: Push; entityId: string; entityName: string; home: string; day: string },
): string | undefined {
  if (err instanceof ApiError && err.status === 401) return undefined;
  const message = err instanceof ApiError ? err.message : NOT_SAVED;
  const to = err instanceof ApiError ? (err.body as { to?: unknown } | null)?.to : undefined;
  const reportId = err instanceof ApiError ? (err.body as { report_id?: unknown } | null)?.report_id : undefined;
  if (to === "submitted" && typeof reportId === "string") {
    push(outcomeHref(entityId, entityName, reportId));
    return undefined;
  }
  if (to === "dashboard") {
    setFlash(message, "warning");
    push(home);
    return undefined;
  }
  const stage = typeof to === "string" ? stageOf(to) : null;
  if (stage && stage.key !== here) {
    setFlash(message, "warning");
    openStep(push, entityId, entityName, stageSection(stage, to as string), day);
    return undefined;
  }
  return message;
}

/**
 * Part 14 Amount input: the label (with the currency in its accessible name), the currency as a
 * prefix, the value right-aligned, `inputMode="decimal"`, cleaned as typed and grouped + padded on
 * blur (lib/currencyInput.ts, Flask's `currency.js` rules).
 */
export function AmountInput({
  label,
  code,
  value,
  onChange,
  name,
  helper,
  disabled,
  inputRef,
  id,
  required,
  error,
  onBlur,
}: {
  label: string;
  code: string | null;
  value: string;
  onChange: (value: string) => void;
  name: string;
  helper?: ReactNode;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** The control's id - an error summary links to it. */
  id?: string;
  /** Red `*`, sr-only "(required)" and `aria-required` (Field). */
  required?: boolean;
  /** Shown under the field in place of the helper, with the Danger ring - the caller decides when. */
  error?: ReactNode;
  /** After the value is grouped on blur. */
  onBlur?: () => void;
}) {
  return (
    <Field
      id={id}
      required={required}
      error={error}
      label={
        <>
          {label}
          <span className="sr-only"> in {code || "$"}</span>
        </>
      }
      helper={helper}
    >
      {(a11y) => (
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body-m text-text-secondary"
            aria-hidden
            translate="no"
          >
            {code || "$"}
          </span>
          <input
            {...a11y}
            ref={inputRef}
            name={name}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(sanitizeMoney(e.target.value))}
            onBlur={() => {
              onChange(groupMoney(value));
              onBlur?.();
            }}
            className={`${inputClass(Boolean(error))} pl-14 text-right`}
          />
        </div>
      )}
    </Field>
  );
}

/**
 * Part 15.2 workflow continuation, not sticky: Save & Next first and full width on a phone with
 * Save & Exit under it; [Save & Exit] [Save & Next] at the right from 640. Save & Next is the
 * form's submit, so Enter in a field is Save & Next. `gate`: why Save & Next waits - it is
 * disabled and says so above it (Cash Count, Daily Closing Phase 1); Save & Exit never waits.
 */
export function StageActions({ saving, onExit, gate = null }: { saving: "next" | "exit" | null; onExit: () => void; gate?: string | null }) {
  const gateId = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-end sm:justify-start sm:gap-3">
      <div className="flex flex-col gap-1 sm:items-end">
        {gate ? (
          <p id={gateId} className="text-body-s text-text-secondary sm:text-right">
            {gate}
          </p>
        ) : null}
        <Button
          type="submit"
          kind="primary"
          className="w-full sm:w-auto"
          processing={saving === "next"}
          processingLabel="Saving…"
          disabled={saving !== null || Boolean(gate)}
          aria-describedby={gate ? gateId : undefined}
          data-stage-save="next"
        >
          Save &amp; Next
        </Button>
      </div>
      <Button
        kind="ghost"
        className="w-full sm:w-auto"
        processing={saving === "exit"}
        processingLabel="Saving…"
        disabled={saving !== null}
        onClick={onExit}
        data-stage-save="exit"
      >
        Save &amp; Exit
      </Button>
    </div>
  );
}
