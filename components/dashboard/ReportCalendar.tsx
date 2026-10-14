"use client";

import { useState } from "react";

import { Icon } from "@minty/shared/ui";

import { dayState, isClickable, type DayState, type Home } from "@/lib/dashboard";
import { formatDay, formatMonth, monthGrid, monthOf, shiftMonth, WEEKDAY_HEADINGS } from "@/lib/dates";

const LOOK: Record<DayState, string> = {
  today: "bg-action-primary text-action-on-primary",
  submitted: "bg-surface-sunk text-text-secondary",
  missing: "bg-status-danger-bg text-status-danger-ink",
  open: "text-text-primary hover:bg-state-hover",
  idle: "text-text-disabled",
};

const SAY: Record<DayState, string> = {
  today: "today",
  submitted: "submitted",
  missing: "not submitted",
  open: "",
  idle: "",
};

/**
 * Flask's "Report Calendar" (hand-written there too): a month of 42 days, Sunday first, the
 * neighbouring months' days shown and inert. Today, submitted, not-submitted (missing) days, the
 * day that may be picked, and the rest - Flask's legend, with its three entries. Days carry only
 * their number; a picked day's balance shows above the calendar.
 */
export function ReportCalendar({
  home,
  selected,
  onPick,
}: {
  home: Home;
  selected: string | null;
  onPick: (day: string) => void;
}) {
  const [shown, setShown] = useState(() => monthOf(home.server_today));
  const grid = monthGrid(shown.year, shown.month);

  return (
    <section aria-labelledby="calendar-title" className="rounded-lg border border-border-subtle bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 id="calendar-title" className="text-title-m text-text-primary">
          Report Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setShown(shiftMonth(shown.year, shown.month, -1))}
            className="inline-flex size-11 items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            title="Back to this month"
            onClick={() => setShown(monthOf(home.server_today))}
            className="min-h-11 whitespace-nowrap rounded-lg px-2 text-body-m font-semibold text-text-primary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-border-focus"
            aria-live="polite"
          >
            {formatMonth(shown.year, shown.month)}
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setShown(shiftMonth(shown.year, shown.month, 1))}
            className="inline-flex size-11 items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <Icon name="chevron_right" />
          </button>
        </div>
      </div>

      <div role="grid" aria-labelledby="calendar-title" className="mt-3">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_HEADINGS.map((d) => (
            <div key={d} role="columnheader" className="py-1 text-center text-label text-text-muted">
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" key={week} className="grid grid-cols-7 gap-1 py-0.5">
            {grid.slice(week * 7, week * 7 + 7).map(({ iso, inMonth }) => {
              const number = Number(iso.slice(8));
              if (!inMonth) {
                return (
                  <div key={iso} role="gridcell" aria-hidden="true" className="flex h-11 items-center justify-center text-body-m text-text-disabled opacity-50">
                    {number}
                  </div>
                );
              }
              const state = dayState(home, iso);
              const picked = selected === iso && state === "open";
              const clickable = isClickable(home, iso);
              return (
                <div key={iso} role="gridcell" aria-selected={selected === iso}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => onPick(iso)}
                    aria-label={`${formatDay(iso)}${SAY[state] ? `, ${SAY[state]}` : ""}`}
                    className={`flex h-11 w-full items-center justify-center rounded-md text-body-m focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus disabled:cursor-default ${
                      picked ? "border-2 border-action-primary bg-state-selected text-text-primary" : LOOK[state]
                    }`}
                  >
                    {number}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-label text-text-secondary" aria-label="Calendar key">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-surface-sunk ring-1 ring-border-default" aria-hidden="true" />
          Submitted
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-status-danger-bg ring-1 ring-status-danger-ink" aria-hidden="true" />
          Not Submitted
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-action-primary" aria-hidden="true" />
          Today
        </li>
      </ul>
    </section>
  );
}
