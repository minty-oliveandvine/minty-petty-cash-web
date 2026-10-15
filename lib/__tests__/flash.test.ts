import { afterEach, describe, expect, it } from "vitest";

import { setFlash, setNextDay, takeFlash, takeNextDay } from "@/lib/flash";

afterEach(() => sessionStorage.clear());

describe("the flash", () => {
  it("survives one read", () => {
    setFlash("That report's deleted.", "success");
    expect(takeFlash()).toEqual({ message: "That report's deleted.", kind: "success" });
    expect(takeFlash()).toBeNull();
  });
});

describe("the next day to start (Flask's autoStartNextDay)", () => {
  it("is read once", () => {
    setNextDay("2026-10-14");
    expect(takeNextDay()).toBe("2026-10-14");
    expect(takeNextDay()).toBeNull();
  });

  it("is ignored when it is not a date", () => {
    sessionStorage.setItem("petty_cash_next_day", "tomorrow");
    expect(takeNextDay()).toBeNull();
    expect(sessionStorage.getItem("petty_cash_next_day")).toBeNull();
  });
});
