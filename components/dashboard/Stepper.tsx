"use client";

import { Icon } from "@minty/shared/ui";

import { stepStates, type Home } from "@/lib/dashboard";
import type { WizardStep } from "@/lib/flaskPages";

/**
 * The draft's six steps (Flask `components/stepper.html`): current, completed (tick), next
 * (opens) and locked. A step that opens is a link into that step of the wizard. The state is in
 * text for assistive technology, never colour alone.
 */
export function Stepper({
  draft,
  stepHref,
}: {
  draft: NonNullable<Home["draft"]>;
  stepHref: (step: WizardStep) => string;
}) {
  const steps = stepStates(draft);
  return (
    // Two rows of three on a phone, so every label is whole at 360px (never clipped, never under 12px).
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Report steps">
      {steps.map((step, i) => {
        const pill =
          step.state === "current"
            ? "bg-action-primary text-action-on-primary"
            : step.state === "completed"
              ? "bg-status-info-bg text-status-info-ink"
              : step.state === "next"
                ? "bg-surface-sunk text-text-secondary"
                : "bg-surface-sunk text-text-disabled";
        const body = (
          <>
            <span className={`flex h-8 w-full items-center justify-center rounded-full ${pill}`} aria-hidden="true">
              {step.state === "completed" ? (
                <Icon name="check" size="sm" />
              ) : step.state === "current" ? (
                <span className="text-label">{i + 1}</span>
              ) : step.state === "next" ? (
                <Icon name="expand_more" size="sm" />
              ) : null}
            </span>
            <span className="mt-1 block text-center text-label text-text-secondary">{step.label}</span>
            <span className="sr-only">
              {step.state === "current" ? ", current step" : step.state === "completed" ? ", done" : step.state === "locked" ? ", not yet" : ""}
            </span>
          </>
        );
        return (
          <li key={step.key} className="min-w-0">
            {step.open ? (
              <a
                href={stepHref(step.key)}
                className="block min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                {body}
              </a>
            ) : (
              <div className="min-h-11 cursor-not-allowed">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
