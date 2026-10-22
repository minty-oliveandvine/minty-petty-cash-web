// The module token in its cookies (../auth.ts, this app's instance of @minty/shared/auth): this
// app's own names, as long as the token lives, and the module claims read from it.

import { decodeJwtPayload, moduleClaims as claimsOf, secondsUntilExpiry } from "@minty/shared/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_COOKIE_NAME,
  clearAuth,
  ENTITY_ID_COOKIE_NAME,
  ENTITY_NAME_COOKIE_NAME,
  getAuth,
  getAuthSnapshot,
  setAuth,
} from "@/lib/auth";

/** The cookie token's module claims, as the sidebar and the settings pills read them. */
const moduleClaims = () => claimsOf(getAuth()?.token);

function token(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
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
    expect(secondsUntilExpiry(token({ exp: Math.floor(Date.now() / 1000) + 600 }))).toBeGreaterThan(590);
    expect(secondsUntilExpiry(token({}))).toBe(1800);
  });

  it("says which modules the company has, and both when it cannot tell", () => {
    setAuth(token({ petty_cash_enabled: true, billing_enabled: false }), "id", "n");
    expect(moduleClaims()).toEqual({ pettyCash: true, billing: false });
    clearAuth();
    expect(moduleClaims()).toEqual({ pettyCash: true, billing: true });
  });
});

describe("the cookie jar, exactly", () => {
  // The cookie names, their lifetime and the snapshot - @minty/shared/auth's since the shared-code
  // refactor (2026-10-21).

  const NOW = Date.UTC(2026, 9, 21, 9, 0, 0);

  function writes(run: () => void): string[] {
    const set = vi.spyOn(document, "cookie", "set");
    run();
    return set.mock.calls.map(([value]) => value);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("names the three cookies petty_cash_*", () => {
    expect(AUTH_COOKIE_NAME).toBe("petty_cash_token");
    expect(ENTITY_ID_COOKIE_NAME).toBe("petty_cash_entity_id");
    expect(ENTITY_NAME_COOKIE_NAME).toBe("petty_cash_entity_name");
  });

  it("writes each cookie encoded, for the token's own lifetime, on / and SameSite=Lax (no Secure on http)", () => {
    const t = token({ exp: NOW / 1000 + 600.9 });
    expect(writes(() => setAuth(t, "id-1", "Olive & Vine; Co"))).toEqual([
      `petty_cash_token=${encodeURIComponent(t)};path=/;max-age=600;SameSite=Lax`,
      "petty_cash_entity_id=id-1;path=/;max-age=600;SameSite=Lax",
      "petty_cash_entity_name=Olive%20%26%20Vine%3B%20Co;path=/;max-age=600;SameSite=Lax",
    ]);
    expect(getAuth()).toEqual({ token: t, entityId: "id-1", entityName: "Olive & Vine; Co" });
  });

  it("gives a lapsed token one second, and a token with no numeric exp Flask's 30 minutes", () => {
    expect(secondsUntilExpiry(token({ exp: NOW / 1000 - 60 }))).toBe(1);
    expect(secondsUntilExpiry(token({ exp: String(NOW / 1000 + 600) }))).toBe(1800);
    expect(secondsUntilExpiry("not-a-token")).toBe(1800);
    expect(writes(() => setAuth("not-a-token", "id", "n"))[0]).toBe("petty_cash_token=not-a-token;path=/;max-age=1800;SameSite=Lax");
  });

  it("clears with max-age=0 on /", () => {
    expect(writes(() => clearAuth())).toEqual([
      "petty_cash_token=;path=/;max-age=0",
      "petty_cash_entity_id=;path=/;max-age=0",
      "petty_cash_entity_name=;path=/;max-age=0",
    ]);
  });

  it("reads a token with no company cookies as empty strings, and no token as nothing", () => {
    document.cookie = "petty_cash_token=t;path=/";
    expect(getAuth()).toEqual({ token: "t", entityId: "", entityName: "" });
    document.cookie = "petty_cash_token=;path=/;max-age=0";
    document.cookie = "petty_cash_entity_id=id;path=/";
    expect(getAuth()).toBeNull();
  });

  it("decodes only an object payload of a three-part token", () => {
    const b64 = (s: string) => btoa(s).replace(/=+$/, "");
    expect(decodeJwtPayload(`h.${b64("[1,2]")}.s`)).toBeNull();
    expect(decodeJwtPayload(`h.${b64("null")}.s`)).toBeNull();
    expect(decodeJwtPayload(`h.${b64("7")}.s`)).toBeNull();
    expect(decodeJwtPayload(`h.${b64('{"a":1}')}.s.extra`)).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });
});

describe("getAuthSnapshot", () => {
  // The referentially stable snapshot - @minty/shared/auth's since the shared-code refactor (2026-10-21).

  it("is the same object while the cookies are unchanged, a new one after, and null with no token", () => {
    setAuth("a.b.c", "id-1", "Olive");
    const first = getAuthSnapshot();
    expect(first).toEqual({ token: "a.b.c", entityId: "id-1", entityName: "Olive" });
    expect(getAuthSnapshot()).toBe(first);
    setAuth("a.b.c", "id-2", "Vine");
    const second = getAuthSnapshot();
    expect(second).not.toBe(first);
    expect(second).toEqual({ token: "a.b.c", entityId: "id-2", entityName: "Vine" });
    clearAuth();
    expect(getAuthSnapshot()).toBeNull();
  });
});

describe("moduleClaims, a claim that is not a boolean", () => {
  // "Only a literal false hides a module" - @minty/shared/auth's since the shared-code refactor (2026-10-21).

  it.each([
    [{ petty_cash_enabled: 0, billing_enabled: "false" }, { pettyCash: true, billing: true }],
    [{ petty_cash_enabled: null, billing_enabled: "" }, { pettyCash: true, billing: true }],
    [{ petty_cash_enabled: false }, { pettyCash: false, billing: true }],
    [{}, { pettyCash: true, billing: true }],
  ])("reads %j as %j", (claims, expected) => {
    setAuth(token(claims), "id", "n");
    expect(moduleClaims()).toEqual(expected);
  });

  it("treats a token that is not a JWT as both on", () => {
    setAuth("opaque", "id", "n");
    expect(moduleClaims()).toEqual({ pettyCash: true, billing: true });
  });
});
