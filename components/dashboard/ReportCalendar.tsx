"use client";

import { useState } from "react";

import { dayState, isClickable, type DayState, type Home } from "@/lib/dashboard";
import {
  formatDay,
  formatMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  WEEKDAY_HEADINGS,
} from "@/lib/dates";

const CELL =
  "calendar-day flex h-10 items-center justify-center rounded-flask-lg py-2 text-center text-sm";

/** Flask's `createCalendarDay` classes, by state. */
const LOOK: Record<DayState, string> = {
  today: "cursor-pointer bg-flask-green font-medium text-flask-white hover:bg-flask-green/80",
  submitted:
    "cursor-pointer bg-flask-submitted font-medium text-flask-gray-500 hover:bg-flask-submitted/80",
  missing: "cursor-pointer bg-flask-red font-medium text-flask-white hover:bg-flask-red/80",
  open: "cursor-pointer text-flask-gray-500 hover:bg-flask-gray-50",
  idle: "text-flask-gray-400",
};
const PICKED =
  "cursor-pointer border-2 border-flask-teal bg-flask-teal/20 font-medium text-flask-teal hover:bg-flask-teal/30";
const SAY: Record<DayState, string> = {
  today: "today",
  submitted: "submitted",
  missing: "not submitted",
  open: "",
  idle: "",
};

/**
 * Flask's "Report Calendar", exactly: the heading, the month bar (grey, ‹ month year ›), a white
 * grid of 42 days with the weekday row, and the legend in a grey bar. Today green, submitted pale
 * grey, not-submitted red, a picked day teal-outlined.
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
  const [shown, setShown] = useState(() => monthOf(selected ?? home.server_today));
  const grid = monthGrid(shown.year, shown.month);

  return (
    <div className="report_calendar_section">
      <div className="mb-4">
        <h2 id="calendar-title" className="text-lg font-semibold text-flask-gray-900">
          Report Calendar
        </h2>
      </div>

      <div className="rounded-flask-lg bg-flask-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setShown(shiftMonth(shown.year, shown.month, -1))}
            className="rounded-flask-lg p-2 transition-colors hover:bg-flask-gray-200"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M10 12L6 8L10 4"
                className="stroke-flask-gray-500"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            className="text-center text-lg font-semibold text-flask-gray-700"
            aria-live="polite"
            onDoubleClick={() => setShown(monthOf(home.server_today))}
          >
            {formatMonth(shown.year, shown.month)}
          </div>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setShown(shiftMonth(shown.year, shown.month, 1))}
            className="rounded-flask-lg p-2 transition-colors hover:bg-flask-gray-200"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M6 4L10 8L6 12"
                className="stroke-flask-gray-500"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="rounded-flask-lg bg-flask-white p-4">
        <div className="mb-2 grid grid-cols-7 gap-1" aria-hidden="true">
          {WEEKDAY_HEADINGS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-flask-gray-600">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map(({ iso, inMonth }) => {
            const number = Number(iso.slice(8));
            if (!inMonth) {
              return (
                <div key={iso} aria-hidden="true" className={`${CELL} text-flask-gray-300`}>
                  {number}
                </div>
              );
            }
            const state = dayState(home, iso);
            const look = selected === iso && state === "open" ? PICKED : LOOK[state];
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={selected === iso}
                disabled={!isClickable(home, iso)}
                onClick={() => onPick(iso)}
                aria-label={`${formatDay(iso)}${SAY[state] ? `, ${SAY[state]}` : ""}`}
                className={`${CELL} ${look} disabled:cursor-default`}
              >
                {number}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="rounded-flask-lg bg-flask-gray-50 px-4 py-3">
          <div className="flex flex-wrap justify-center gap-2 text-xs sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="h-3 w-3 rounded-full bg-flask-submitted sm:h-4 sm:w-4" />
              <span className="text-flask-gray-700">Submitted</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="h-3 w-3 rounded-full bg-flask-red sm:h-4 sm:w-4" />
              <span className="text-flask-gray-700">Not Submitted</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="h-3 w-3 rounded-full bg-flask-green sm:h-4 sm:w-4" />
              <span className="text-flask-gray-700">Today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
