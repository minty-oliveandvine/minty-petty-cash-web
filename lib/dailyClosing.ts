/**
 * The Daily Closing's five stages (Part 15.15b, D15-05): Addition to Drawer · Sales · Expenses ·
 * Cash Count · Close - drawn over the six sections Flask's report wizard still has (its
 * `report.current_section` / `completed_sections` keys). Pure, so the launch page only draws
 * what this says.
 *
 * - opening    -> Addition to Drawer
 * - sales      -> Sales
 * - expenses   -> Expenses
 * - deposit    -> Cash Count (Bank Deposit is folded into Cash Count, D15-05) ...
 * - cash_count -> Cash Count ... which is done only once the cash count itself is done
 * - ending     -> Close
 */

import type { Home } from "@/lib/dashboard";
import type { WizardStep } from "@/lib/flaskPages";

export type StageKey = "drawer" | "sales" | "expenses" | "cash_count" | "close";

export type Stage = {
  key: StageKey;
  /** The stage's name ("Next: Addition to Drawer"). */
  label: string;
  /** The Step progress label - Part 15.9's short form. */
  short: string;
  /** Flask's sections inside this stage, in order; the first is where the stage opens. */
  sections: readonly WizardStep[];
  /** The section whose completion completes the stage. */
  doneWhen: WizardStep;
};

export const STAGES: readonly Stage[] = [
  { key: "drawer", label: "Addition to Drawer", short: "Drawer", sections: ["opening"], doneWhen: "opening" },
  { key: "sales", label: "Sales", short: "Sales", sections: ["sales"], doneWhen: "sales" },
  { key: "expenses", label: "Expenses", short: "Expenses", sections: ["expenses"], doneWhen: "expenses" },
  { key: "cash_count", label: "Cash Count", short: "Cash Count", sections: ["deposit", "cash_count"], doneWhen: "cash_count" },
  { key: "close", label: "Close", short: "Close", sections: ["ending"], doneWhen: "ending" },
];

/** The stage a Flask section belongs to, or null for a key Flask does not use. */
export function stageOf(section: string | null): Stage | null {
  if (!section) return null;
  return STAGES.find((stage) => (stage.sections as readonly string[]).includes(section)) ?? null;
}

export type StageState = "done" | "current" | "upcoming";

export type StageProgress = {
  stages: { stage: Stage; state: StageState }[];
  /** How many of the five are done ("3 of 5 done"). */
  done: number;
  /** Where Continue lands - null once every stage is done. */
  next: Stage | null;
};

/**
 * An open report's progress over the five stages. "Next" is where Continue lands: Flask's resume
 * opens `current_section` (or the first section when there is none), so it is that section's
 * stage - even when the person went back to a stage already done. A stage is done when its
 * `doneWhen` section is done; the current stage is drawn as current whether done or not.
 */
export function stageProgress(draft: NonNullable<Home["draft"]>): StageProgress {
  const completed = new Set(draft.completed_sections);
  const isDone = (stage: Stage) => completed.has(stage.doneWhen);
  const done = STAGES.filter(isDone).length;
  const current =
    stageOf(draft.current_section) ?? (draft.current_section ? (STAGES.find((s) => !isDone(s)) ?? null) : STAGES[0]);
  return {
    stages: STAGES.map((stage) => ({
      stage,
      state: stage === current ? "current" : isDone(stage) ? "done" : "upcoming",
    })),
    done,
    next: current,
  };
}

/** The section a stage opens at: the one the report is in when it is inside this stage, else the stage's first. */
export function stageSection(stage: Stage, currentSection: string | null): WizardStep {
  return currentSection && stageOf(currentSection) === stage ? (currentSection as WizardStep) : stage.sections[0];
}

/**
 * The Step progress on a stage's own page (Part 15.9c): that stage is current, whether done or
 * not; any other is done when its `doneWhen` section is, else upcoming.
 */
export function stagesOnPage(completedSections: readonly string[], here: StageKey): { stage: Stage; state: StageState }[] {
  const completed = new Set(completedSections);
  return STAGES.map((stage) => ({
    stage,
    state: stage.key === here ? "current" : completed.has(stage.doneWhen) ? "done" : "upcoming",
  }));
}

/** No report yet: every stage ahead. */
export function notStartedProgress(): StageProgress {
  return { stages: STAGES.map((stage) => ({ stage, state: "upcoming" })), done: 0, next: STAGES[0] };
}

/** A submitted day: every stage done. */
export function submittedProgress(): StageProgress {
  return { stages: STAGES.map((stage) => ({ stage, state: "done" })), done: STAGES.length, next: null };
}
