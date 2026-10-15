// The five Daily Closing stages over Flask's six report sections (../dailyClosing.ts).

import { describe, expect, it } from "vitest";

import { notStartedProgress, STAGES, stageOf, stageProgress, stageSection, stagesOnPage, submittedProgress } from "@/lib/dailyClosing";
import type { Home } from "@/lib/dashboard";

function draft(current_section: string | null, completed_sections: string[]): NonNullable<Home["draft"]> {
  return { id: "d", current_section, completed_sections, last_edit_seconds: 0 };
}

const states = (p: ReturnType<typeof stageProgress>) => p.stages.map((s) => s.state);

describe("the stages", () => {
  it("are Part 15.15's five, in order, with Part 15.9's short labels", () => {
    expect(STAGES.map((s) => s.label)).toEqual(["Addition to Drawer", "Sales", "Expenses", "Cash Count", "Close"]);
    expect(STAGES.map((s) => s.short)).toEqual(["Drawer", "Sales", "Expenses", "Cash Count", "Close"]);
  });

  it("take Flask's six sections - Bank Deposit folded into Cash Count (D15-05)", () => {
    expect(
      ["opening", "sales", "expenses", "deposit", "cash_count", "ending"].map((section) => stageOf(section)?.label),
    ).toEqual(["Addition to Drawer", "Sales", "Expenses", "Cash Count", "Cash Count", "Close"]);
    expect(stageOf(null)).toBeNull();
    expect(stageOf("bank")).toBeNull();
  });

  it("open Cash Count at the deposit, its first section", () => {
    expect(stageOf("cash_count")?.sections).toEqual(["deposit", "cash_count"]);
  });
});

describe("an open report's progress", () => {
  it("counts done stages and names the stage Continue opens", () => {
    const p = stageProgress(draft("expenses", ["opening", "sales"]));
    expect(states(p)).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(p.done).toBe(2);
    expect(p.next?.label).toBe("Expenses");
  });

  it("counts Cash Count done only once the cash count is - the deposit alone is not enough", () => {
    const p = stageProgress(draft("deposit", ["opening", "sales", "expenses", "deposit"]));
    expect(p.done).toBe(3);
    expect(p.next?.label).toBe("Cash Count");
    expect(states(p)).toEqual(["done", "done", "done", "current", "upcoming"]);

    const counted = stageProgress(draft("ending", ["opening", "sales", "expenses", "deposit", "cash_count"]));
    expect(counted.done).toBe(4);
    expect(counted.next?.label).toBe("Close");
  });

  it("counts Cash Count done when the cash was counted even without a deposit section", () => {
    const p = stageProgress(draft("ending", ["opening", "sales", "expenses", "cash_count"]));
    expect(states(p)).toEqual(["done", "done", "done", "done", "current"]);
  });

  it("follows the section the person went back to - that is where Flask's resume lands", () => {
    const p = stageProgress(draft("sales", ["opening", "sales", "expenses"]));
    expect(states(p)).toEqual(["done", "current", "done", "upcoming", "upcoming"]);
    expect(p.done).toBe(3);
    expect(p.next?.label).toBe("Sales");
  });

  it("starts at Addition to Drawer when the draft names no section (Flask resumes at opening)", () => {
    const p = stageProgress(draft(null, []));
    expect(p.next?.label).toBe("Addition to Drawer");
    expect(states(p)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("falls back to the first stage not done for a section Flask does not use", () => {
    const p = stageProgress(draft("bank", ["opening"]));
    expect(p.next?.label).toBe("Sales");
  });

  it("ignores completed keys it does not know", () => {
    expect(stageProgress(draft("sales", ["opening", "bank"])).done).toBe(1);
  });
});

describe("a day with no open report", () => {
  it("not started: nothing done, Addition to Drawer next", () => {
    const p = notStartedProgress();
    expect(p.done).toBe(0);
    expect(p.next?.label).toBe("Addition to Drawer");
    expect(new Set(p.stages.map((s) => s.state))).toEqual(new Set(["upcoming"]));
  });

  it("submitted: all five done, nothing next", () => {
    const p = submittedProgress();
    expect(p.done).toBe(5);
    expect(p.next).toBeNull();
    expect(new Set(p.stages.map((s) => s.state))).toEqual(new Set(["done"]));
  });
});

describe("a stage's own page", () => {
  const byKey = (key: string) => STAGES.find((s) => s.key === key)!;

  it("draws its stage as current, done or not, and the others by what is done", () => {
    const here = (completed: string[]) => stagesOnPage(completed, "drawer").map((s) => s.state);
    expect(here([])).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(here(["opening", "sales", "deposit"])).toEqual(["current", "done", "upcoming", "upcoming", "upcoming"]);
    expect(here(["opening", "sales", "expenses", "cash_count"])).toEqual(["current", "done", "done", "done", "upcoming"]);
  });

  it("opens another stage where the report is inside it, else at the stage's first section", () => {
    expect(stageSection(byKey("cash_count"), "cash_count")).toBe("cash_count");
    expect(stageSection(byKey("cash_count"), "sales")).toBe("deposit");
    expect(stageSection(byKey("sales"), null)).toBe("sales");
    expect(stageSection(byKey("drawer"), "opening")).toBe("opening");
  });
});
