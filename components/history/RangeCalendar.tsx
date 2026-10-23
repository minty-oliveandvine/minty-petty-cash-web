"use client";

import { useEffect, useRef, useState } from "react";

import { WEEKDAY_HEADINGS, formatMonth, monthGrid, monthOf, shiftMonth } from "@/lib/dates";

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" });

/** Flatpickr's arrows (its own SVGs). */
const PREV =
  "M5.207 8.471l7.146 7.147-0.707 0.707-7.853-7.854 7.854-7.853 0.707 0.707-7.147 7.146z";
const NEXT =
  "M13.207 8.472l-7.854 7.854-0.707-0.707 7.146-7.146-7.146-7.148 0.707-0.707 7.854 7.854z";

function Arrow({
  d,
  label,
  onClick,
  side,
}: {
  d: string;
  label: string;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group absolute top-0 z-[3] flex h-[34px] items-center px-[10px] ${side === "left" ? "left-0" : "right-0"}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 17 17"
        className="fill-flask-black/90 group-hover:fill-flask-calendar-arrow-hover"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </button>
  );
}

/**
 * Flask's range calendar on report history - Flatpickr (`mode: 'range'`), drawn here as the page
 * themed it, since this app carries no Flatpickr: one month on a phone, two side by side from
 * 640px stretched to the date fields, the range in teal with the days between in pale teal,
 * today ringed, and the footer's Clear and Search Report. A click picks the start, the next the
 * end (in order), the next starts again. Escape or a click outside closes it, keeping the pick.
 */
export function RangeCalendar({
  picked,
  onPick,
  onClear,
  onSearch,
  onClose,
}: {
  picked: string[];
  onPick: (day: string) => void;
  onClear: () => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const today = TODAY.format(new Date());
  const [view, setView] = useState(() => monthOf(picked[0] ?? today));
  const [two, setTwo] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 640px)");
    const sync = () => setTwo(wide.matches);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // the fields open it; anywhere else closes it
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!box.current?.contains(target) && !target.closest?.("[data-range-field]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const [start, end] = [picked[0] ?? "", picked[1] ?? picked[0] ?? ""];
  const months = Array.from({ length: two ? 2 : 1 }, (_, i) =>
    shiftMonth(view.year, view.month, i),
  );

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Choose the dates"
      tabIndex={-1}
      className="absolute left-3 top-full z-[60] mt-0.5 w-[calc(100vw-24px)] max-w-[360px] rounded-flask-xl bg-flask-white text-sm shadow-flask-calendar outline-none sm:left-6 sm:right-6 sm:w-auto sm:max-w-none"
    >
      <div className="relative flex">
        <Arrow
          d={PREV}
          label="Previous month"
          side="left"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
        />
        <Arrow
          d={NEXT}
          label="Next month"
          side="right"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
        />
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`} className="min-w-0 flex-1">
            {/* Flatpickr's month name, then its lighter year */}
            <p className="h-[34px] pt-[7.48px] text-center text-[135%] font-semibold leading-none text-flask-gray-700">
              {formatMonth(year, month).split(" ")[0]} <span className="font-light">{year}</span>
            </p>
            <div className="flex h-[28px] items-center" aria-hidden="true">
              {WEEKDAY_HEADINGS.map((w) => (
                <span
                  key={w}
                  className="flex-1 text-center text-[90%] font-bold text-flask-black/54"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-around sm:justify-start">
              {monthGrid(year, month).map(({ iso, inMonth }) => {
                if (!inMonth)
                  return (
                    <span
                      key={iso}
                      className="invisible h-[42px] w-[14.2857143%] max-w-[39px] sm:h-[39px] sm:max-w-[14.2857143%]"
                      aria-hidden="true"
                    />
                  );
                const isStart = iso === start;
                const isEnd = iso === end;
                const ends = isStart || isEnd;
                const between = !!start && iso > start && iso < end;
                const shape =
                  isStart && isEnd
                    ? "rounded-[50px]"
                    : isStart
                      ? "rounded-l-[50px] rounded-r-none"
                      : isEnd
                        ? "rounded-l-none rounded-r-[50px]"
                        : "rounded-[150px] sm:rounded-[10px]";
                const look = ends
                  ? "border-flask-teal bg-flask-teal text-flask-white hover:border-flask-teal-hover hover:bg-flask-teal-hover"
                  : between
                    ? "border-flask-range bg-flask-range text-flask-range-ink shadow-[-5px_0_0_var(--color-flask-range),5px_0_0_var(--color-flask-range)]"
                    : `${iso === today ? "border-flask-teal" : "border-transparent"} text-flask-calendar-ink hover:bg-flask-day-hover`;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onPick(iso)}
                    aria-pressed={ends || between}
                    aria-label={`${Number(iso.slice(8))} ${formatMonth(year, month)}`}
                    className={`h-[42px] w-[14.2857143%] max-w-[39px] border text-center text-sm leading-[40px] sm:h-[39px] sm:max-w-[14.2857143%] sm:leading-[37px] ${shape} ${look}`}
                  >
                    {Number(iso.slice(8))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-flask-calendar-rule px-3 py-2.5">
        <button
          type="button"
          onClick={onClear}
          className="min-h-[44px] rounded-[10px] border border-flask-gray-200 bg-transparent px-[18px] py-2.5 text-sm font-semibold text-flask-gray-500 transition-colors hover:bg-flask-gray-100 hover:text-flask-gray-700 sm:min-h-0 sm:px-4 sm:py-2"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="min-h-[44px] rounded-[10px] bg-flask-teal px-[18px] py-2.5 text-sm font-semibold text-flask-white transition-colors hover:bg-flask-teal-hover sm:min-h-0 sm:px-5 sm:py-2"
        >
          Search Report
        </button>
      </div>
    </div>
  );
}
