"use client";

import type { MouseEvent } from "react";

import { stepStates, type Progress } from "@/lib/dashboard";
import type { WizardStep } from "@/lib/wizardPages";

const TICK = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="8"
    viewBox="0 0 11 8"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M0.667969 3.07527L3.66797 5.76758L9.66797 0.767578"
      className="stroke-flask-teal-ink"
      strokeWidth="2"
    />
  </svg>
);

const CHEVRON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth="1.5"
    stroke="currentColor"
    className="h-3 w-3 sm:h-4 sm:w-4"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

/**
 * Flask's `components/stepper.html`, exactly: six pills - current (teal with its number and a pale
 * ring), completed (pale teal with a tick), next (grey with a chevron), locked (grey, empty) - and
 * their labels, 7.6px on a phone as Flask draws them. A step that opens goes to that step of the
 * wizard for the draft's date.
 */
export function Stepper({
  draft,
  page,
  stepHref,
  onStepClick,
}: {
  draft: Progress;
  /** The wizard page this stepper sits on; omitted on the dashboard. */
  page?: WizardStep;
  stepHref: (step: WizardStep) => string;
  /** Asked before a step's link is followed; `preventDefault` it to stay (unsaved changes). */
  onStepClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const steps = stepStates(draft, page);
  return (
    <div className="relative flex-shrink-0 px-4 py-2 sm:px-6 sm:py-2">
      <ol
        className="relative mx-auto flex max-w-2xl items-center justify-between"
        aria-label="Report steps"
      >
        {steps.map((step, i) => {
          const pill =
            step.state === "current" ? (
              <div className="relative">
                <div className="flex h-6 w-12 items-center justify-center rounded-full border-4 border-flask-teal-soft bg-flask-teal text-xs font-medium leading-none text-flask-white transition-colors duration-200 sm:h-8 sm:w-16 sm:text-sm">
                  {i + 1}
                </div>
              </div>
            ) : step.state === "completed" ? (
              <div className="flex h-5 w-12 items-center justify-center rounded-full bg-flask-teal-soft transition-colors duration-200 sm:h-8 sm:w-16">
                {TICK}
              </div>
            ) : step.state === "next" ? (
              <div className="flex h-5 w-12 items-center justify-center rounded-full bg-flask-gray-100 text-xs font-medium leading-none text-flask-gray-600 transition-colors duration-200 hover:bg-flask-gray-200 hover:text-flask-gray-700 sm:h-8 sm:w-16 sm:text-sm">
                {CHEVRON}
              </div>
            ) : (
              <div className="flex h-5 w-12 cursor-not-allowed items-center justify-center rounded-full bg-flask-gray-200 sm:h-8 sm:w-16" />
            );
          const label = (
            <span
              className={`whitespace-nowrap text-center text-[7.6px] font-medium text-flask-black sm:text-xs ${
                step.open
                  ? "cursor-pointer transition-colors duration-200 hover:text-flask-teal"
                  : "cursor-not-allowed"
              }`}
            >
              {step.label}
            </span>
          );
          const state =
            step.state === "current"
              ? "current step"
              : step.state === "completed"
                ? "done"
                : step.state === "locked"
                  ? "not yet"
                  : "next";
          return (
            <li
              key={step.key}
              className="relative z-10 flex flex-1 flex-col items-center gap-2 transition-transform duration-200 hover:scale-105"
            >
              {step.open ? (
                <a
                  href={stepHref(step.key)}
                  onClick={onStepClick}
                  className="flex flex-col items-center gap-2"
                  aria-label={`${step.label}, ${state}`}
                >
                  {pill}
                  {label}
                </a>
              ) : (
                <div
                  className="flex flex-col items-center gap-2"
                  aria-label={`${step.label}, ${state}`}
                >
                  {pill}
                  {label}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
