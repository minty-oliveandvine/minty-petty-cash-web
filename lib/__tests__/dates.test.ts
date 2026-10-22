import { formatDay } from "@minty/shared/dates";
import { describe, expect, it } from "vitest";

import {
  addDays,
  clockTime,
  formatWeekdayDay,
  formatWeekdayShort,
  momentText,
  savedText,
} from "@/lib/dates";

describe("report days", () => {
  it("add across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("read as Flask wrote them", () => {
    expect(formatDay("2026-10-04")).toBe("04 Oct 2026");
  });

  it("read as Part 15 writes them (D MMM YYYY with the weekday)", () => {
    expect(formatWeekdayDay("2026-10-14")).toBe("Wed 14 Oct 2026");
    expect(formatWeekdayDay("2026-10-04")).toBe("Sun 4 Oct 2026");
    expect(formatWeekdayShort("2026-10-04")).toBe("Sun 4 Oct");
  });
});

describe("moments on the device's clock", () => {
  // Local-time Dates, so the expectations hold in any time zone the tests run in.
  const at = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo - 1, d, h, mi);

  it("tell the time in 12 hours", () => {
    expect(clockTime(at(2026, 10, 14, 18, 2))).toBe("6:02 pm");
    expect(clockTime(at(2026, 10, 14, 0, 5))).toBe("12:05 am");
    expect(clockTime(at(2026, 10, 14, 12, 0))).toBe("12:00 pm");
    expect(clockTime(at(2026, 10, 14, 9, 30))).toBe("9:30 am");
  });

  it("write an audit fact's moment in full", () => {
    expect(momentText(at(2026, 10, 13, 18, 12))).toBe("Tue 13 Oct 2026, 6:12 pm");
    expect(momentText(at(2027, 1, 4, 9, 5))).toBe("Mon 4 Jan 2027, 9:05 am");
  });

  it("say when an open report was saved", () => {
    const now = at(2026, 10, 14, 18, 5);
    expect(savedText(180, now)).toBe("Saved 6:02 pm");
    expect(savedText(0, now)).toBe("Saved 6:05 pm");
    expect(savedText(-5, now)).toBe("Saved 6:05 pm"); // a clock skew is never "in the future"
    const ago = (then: Date) => (now.getTime() - then.getTime()) / 1000; // DST-proof
    expect(savedText(ago(at(2026, 10, 13, 18, 5)), now)).toBe("Saved Tue 13 Oct, 6:05 pm");
    expect(savedText(ago(at(2025, 12, 18, 9, 41)), now)).toBe("Saved Thu 18 Dec 2025, 9:41 am");
  });
});

describe("the month and weekday names", () => {
  // The MONTHS/WEEKDAYS arrays and the parsing quirks. formatDay and MONTHS are
  // @minty/shared/dates' since the shared-code refactor (2026-10-21); the weekday helpers stay
  // here. There is no Hong Kong "today" on this branch: the page takes `server_today` from
  // GET /home (lib/dashboard.ts).

  it("names every month in three letters", () => {
    const names = Array.from({ length: 12 }, (_, i) =>
      formatDay(`2026-${String(i + 1).padStart(2, "0")}-01`).slice(3, 6),
    );
    expect(names).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
  });

  it("names every weekday in three letters, from the UTC date", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      formatWeekdayShort(addDays("2026-10-18", i)).slice(0, 3),
    );
    expect(days).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("shows nothing for a day that is not a real calendar date, and a datetime's day", () => {
    // owner 2026-10-21: one shared module (@minty/shared/dates) - unpadded parts read as
    // "05 Jan 2026" and month 13 as "01 undefined 2026"; anything not a real date is now ""
    expect(formatDay("2026-1-5")).toBe("");
    expect(formatDay("2026-13-01")).toBe("");
    expect(formatDay("2026-02-30")).toBe("");
    expect(formatDay("2026-10-04T18:00:00Z")).toBe("04 Oct 2026");
  });

  it("keeps the weekday helpers' own quirks (they stay in this app)", () => {
    expect(formatWeekdayDay("2026-02-30")).toBe("Mon 30 Feb 2026"); // the weekday is 2 March's
    expect(addDays("2026-02-30", 0)).toBe("2026-03-02");
  });
});
