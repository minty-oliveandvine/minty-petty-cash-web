// The module token in its cookies (../auth.ts): this app's own names, as long as the token
// lives, and the module claims read from it.

import { describe, expect, it } from "vitest";

import {
  clearAuth,
  decodeJwtPayload,
  getAuth,
  moduleClaims,
  secondsUntilExpiry,
  setAuth,
} from "@/lib/auth";

function token(claims: object): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;
}

describe("the cookies", () => {
  it("round-trip under petty_cash_* - never another app's names", () => {
    setAuth("a.b.c", "id-1", "Olive & Vine");
    expect(getAuth()).toEqual({ token: "a.b.c", entityId: "id-1", entityName: "Olive & Vine" });
    expect(document.cookie).toContain("petty_cash_token=");
    expect(document.cookie).not.toMatch(/(^|; )(minty_token|billing_token)=/);
    clearAuth();
    expect(getAuth()).toBeNull();
  });
});

describe("the token", () => {
  it("reads its claims without throwing on rubbish", () => {
    expect(decodeJwtPayload(token({ user_id: "u" }))).toEqual({ user_id: "u" });
    expect(decodeJwtPayload("nonsense")).toBeNull();
    expect(decodeJwtPayload("a.%%%.c")).toBeNull();
  });

  it("lives until its exp, and Flask's 30 minutes when it has none", () => {
    expect(secondsUntilExpiry(token({ exp: Math.floor(Date.now() / 1000) + 600 }))).toBeGreaterThan(
      590,
    );
    expect(secondsUntilExpiry(token({}))).toBe(1800);
  });

  it("says which modules the company has, and both when it cannot tell", () => {
    setAuth(token({ petty_cash_enabled: true, billing_enabled: false }), "id", "n");
    expect(moduleClaims()).toEqual({ pettyCash: true, billing: false });
    clearAuth();
    expect(moduleClaims()).toEqual({ pettyCash: true, billing: true });
  });
});
