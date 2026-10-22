import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AmountInput } from "@/components/closing/Stage";

// The stages' money input on @minty/shared/money (owner 2026-10-21: one money rule): what a
// keystroke may add, what blur shows, and the currency it names.

function Harness({ code, initial = "" }: { code: string | null; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <AmountInput label="Cash sales" name="cash" code={code} value={value} onChange={setValue} />;
}

const box = () => screen.getByRole("textbox") as HTMLInputElement;
const type = (value: string) => fireEvent.change(box(), { target: { value } });

describe("AmountInput", () => {
  it("refuses a keystroke that is not digits and one point, or goes past the limits - the field keeps what it had", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - these were stripped ("12a3" kept "123")
    render(<Harness code="HKD" />);
    type("123");
    type("12a3");
    expect(box().value).toBe("123");
    type("1234.56");
    type("1234.567");
    expect(box().value).toBe("1234.56");
    type("-50");
    expect(box().value).toBe("1234.56");
    type("1.2.3");
    expect(box().value).toBe("1234.56");
    type("12345678901");
    type("123456789012");
    expect(box().value).toBe("12345678901");
  });

  it("keeps plain digits while typing over a grouped value, and never groups as it goes", () => {
    render(<Harness code="HKD" initial="1,234.50" />);
    type("1,234.5");
    expect(box().value).toBe("1234.5");
    type("12345");
    expect(box().value).toBe("12345");
  });

  it("groups and pads on blur, and leaves an empty field empty", () => {
    render(<Harness code="HKD" />);
    type("1234.5");
    fireEvent.blur(box());
    expect(box().value).toBe("1,234.50");
    type("");
    fireEvent.blur(box());
    expect(box().value).toBe("");
  });

  it("names the company's currency as the prefix and in the label", () => {
    render(<Harness code="HKD" />);
    expect(document.querySelector(`label[for="${box().id}"]`)?.textContent).toBe("Cash sales in HKD");
    expect(box().previousElementSibling?.textContent).toBe("HKD");
    expect(box().className).toContain("pl-14");
  });

  it("shows no currency at all when the company has none - never $", () => {
    // owner 2026-10-21: one money rule (@minty/shared/money) - was "Cash sales in $" and a "$" prefix
    render(<Harness code={null} />);
    expect(document.querySelector(`label[for="${box().id}"]`)?.textContent).toBe("Cash sales");
    expect(box().previousElementSibling).toBeNull();
    expect(box().className).not.toContain("pl-14");
  });
});
