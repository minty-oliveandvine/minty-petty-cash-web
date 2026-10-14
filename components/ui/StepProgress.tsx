import { Icon } from "@minty/shared/ui";

export type StepProgressStep = {
  /** The short label under the indicator ("Drawer", "Cash Count"). */
  label: string;
  state: "done" | "current" | "upcoming";
  /** Where the step opens. Part 14: done and current steps are clickable; upcoming never are. */
  href?: string;
};

/**
 * Part 14 "Step · Step progress" (Part 15.9c): an ordered list, one step per stage, the labels
 * always visible. Done = brand tint + check, current = brand fill (Minty Primary, D14-03) with a
 * bold label and `aria-current="step"` (brand on white is 1.79:1, so colour is never the only
 * sign), upcoming = sunk + border. Indicators are 28 tall and fill the width; the list sits in a
 * 70px frame so a label that wraps to two lines on a phone never overlaps what follows, and never
 * drops under 12px.
 */
export function StepProgress({ steps, label }: { steps: StepProgressStep[]; label: string }) {
  return (
    <ol className="grid min-h-[70px] gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={label}>
      {steps.map((step, i) => {
        const indicator =
          step.state === "current"
            ? "bg-brand-primary text-text-primary"
            : step.state === "done"
              ? "bg-state-selected text-text-link"
              : "border border-border-default bg-surface-sunk text-text-muted";
        const body = (
          <>
            <span className={`flex h-7 w-full items-center justify-center rounded-md ${indicator}`} aria-hidden="true">
              {step.state === "done" ? <Icon name="check" size="sm" /> : <span className="text-label">{i + 1}</span>}
            </span>
            <span
              className={`mt-1 block text-center text-caption break-words ${
                step.state === "current" ? "font-semibold text-text-primary" : "text-text-secondary"
              }`}
            >
              <span aria-hidden="true">{step.label}</span>
              {/* One text node, so the step reads "Sales, done" - not "Sales , done". */}
              <span className="sr-only">
                {`${step.label}, ${step.state === "done" ? "done" : step.state === "current" ? "current step" : "not started"}`}
              </span>
            </span>
          </>
        );
        const clickable = step.href && step.state !== "upcoming";
        return (
          <li key={step.label} className="min-w-0" aria-current={step.state === "current" ? "step" : undefined}>
            {clickable ? (
              <a
                href={step.href}
                className="block min-h-11 rounded-md hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                {body}
              </a>
            ) : (
              <div className="min-h-11">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
