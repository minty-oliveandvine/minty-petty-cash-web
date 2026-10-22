// The sibling URLs (../env.ts, over @minty/shared/env's envUrl): read once at import, trimmed,
// trailing slashes stripped, a default when unset - outside production only.

import { afterEach, describe, expect, it, vi } from "vitest";

async function freshEnv() {
  vi.resetModules();
  return (await import("@/lib/env")).env;
}

describe("env", () => {
  // envUrl(name, raw, devFallback) since the shared-code refactor (2026-10-21).

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the decided local ports", async () => {
    vi.stubEnv("ACCOUNTS_API_URL", undefined);
    vi.stubEnv("PETTY_CASH_API_URL", undefined);
    vi.stubEnv("SUBSCRIPTION_API_URL", undefined);
    vi.stubEnv("PAYMENT_REQUEST_WEB_URL", undefined);
    expect(await freshEnv()).toEqual({
      ACCOUNTS_API_URL: "http://localhost:8000",
      PETTY_CASH_API_URL: "http://localhost:8010",
      SUBSCRIPTION_API_URL: "http://localhost:8001",
      PAYMENT_REQUEST_WEB_URL: "http://localhost:3020",
    });
  });

  it("trims the value and strips every trailing slash", async () => {
    vi.stubEnv("ACCOUNTS_API_URL", "  https://accounts-api.dailyminty.com///  ");
    vi.stubEnv("PETTY_CASH_API_URL", "https://pettycash-api.dailyminty.com/v1/");
    expect((await freshEnv()).ACCOUNTS_API_URL).toBe("https://accounts-api.dailyminty.com");
    expect((await freshEnv()).PETTY_CASH_API_URL).toBe("https://pettycash-api.dailyminty.com/v1");
  });

  it("falls back on an empty, blank or lone-slash value", async () => {
    vi.stubEnv("ACCOUNTS_API_URL", "");
    vi.stubEnv("SUBSCRIPTION_API_URL", "   ");
    vi.stubEnv("PETTY_CASH_API_URL", "/");
    const env = await freshEnv();
    expect(env.ACCOUNTS_API_URL).toBe("http://localhost:8000");
    expect(env.SUBSCRIPTION_API_URL).toBe("http://localhost:8001");
    // owner 2026-10-21: one shared module (@minty/shared/env) - a lone "/" is blank, so the default (was "")
    expect(env.PETTY_CASH_API_URL).toBe("http://localhost:8010");
  });

  it("has no default in a production build: an unset variable throws, naming it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNTS_API_URL", "https://accounts-api.dailyminty.com");
    vi.stubEnv("PETTY_CASH_API_URL", "https://pettycash-api.dailyminty.com");
    vi.stubEnv("SUBSCRIPTION_API_URL", "https://subscription-api.example");
    vi.stubEnv("PAYMENT_REQUEST_WEB_URL", "");
    await expect(freshEnv()).rejects.toThrow("PAYMENT_REQUEST_WEB_URL is not set");
    vi.stubEnv("PAYMENT_REQUEST_WEB_URL", "https://payment-request.dailyminty.com/");
    expect((await freshEnv()).PAYMENT_REQUEST_WEB_URL).toBe("https://payment-request.dailyminty.com");
  });
});
