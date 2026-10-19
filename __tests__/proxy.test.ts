// @vitest-environment node
// The gate (proxy.ts): the cookie, for the company in the address - and Flask's re-handoff for
// everything else.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy, RENEW_WITHIN_SECONDS } from "@/proxy";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";
const OTHER = "a1b2c3d4-0000-4000-8000-000000000000";
const HOME = "/entity/360812e1/olive-and-vine/petty-cash";

function token(secondsLeft: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ user_id: "u", exp: Math.floor(Date.now() / 1000) + secondsLeft })}.sig`;
}

function request(path: string, cookies: Record<string, string> = {}, host = "localhost:3010") {
  const req = new NextRequest(`http://${host}${path}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

function signedIn(entityId = ENTITY, secondsLeft = 1800) {
  return {
    petty_cash_token: token(secondsLeft),
    petty_cash_entity_id: entityId,
    petty_cash_entity_name: "Olive & Vine",
  };
}

function handoff(res: Response) {
  expect(res.status).toBe(307);
  const target = new URL(res.headers.get("location") ?? "");
  expect(target.pathname).toBe("/handoff/petty-cash-web");
  return target.searchParams;
}

describe("without a token", () => {
  it("goes to Flask's re-handoff for the page asked for, naming the company from the address", () => {
    const qs = handoff(proxy(request(`${HOME}/reports?page=2`)));
    expect(qs.get("next")).toBe(`${HOME}/reports?page=2`);
    expect(qs.get("entity_id")).toBe("360812e1/olive-and-vine");
    expect(qs.get("return_origin")).toBe("http://localhost:3010");
  });

  it("names no company for an address outside one", () => {
    const qs = handoff(proxy(request("/")));
    expect(qs.get("entity_id")).toBeNull();
  });

  it("lets the landing through - it is where the token arrives", () => {
    expect(proxy(request("/landing?token=x")).headers.get("x-middleware-next")).toBe("1");
  });

  it("starts the trip on a page of its own on a preview-set host", async () => {
    const res = proxy(request(HOME, {}, "pr-development-petty-cash.dailyminty.com"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('http-equiv="refresh"');
  });
});

describe("with a token", () => {
  it("lets a page of the token's company through", () => {
    expect(proxy(request(HOME, signedIn())).headers.get("x-middleware-next")).toBe("1");
  });

  it("goes back to Flask for a page of ANOTHER company - the token is for one", () => {
    const qs = handoff(proxy(request(HOME, signedIn(OTHER))));
    expect(qs.get("entity_id")).toBe("360812e1/olive-and-vine");
  });

  it("renews a token about to lapse on the way to the next page", () => {
    const qs = handoff(proxy(request(HOME, signedIn(ENTITY, RENEW_WITHIN_SECONDS - 10))));
    expect(qs.get("entity_id")).toBe(ENTITY);
    expect(qs.get("next")).toBe(HOME);
  });

  it("sends / to the company's Petty Cash", () => {
    const res = proxy(request("/", signedIn()));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(HOME);
  });
});

describe("the public share page (/share/<initials>/<day>/<secret>)", () => {
  const SHARE = "/share/OV/13_Oct_2026/AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
  const through = (res: Response) => res.headers.get("x-middleware-next") === "1";

  it("opens without a token, and with any company's token, never renewing or redirecting", () => {
    expect(through(proxy(request(SHARE)))).toBe(true);
    expect(through(proxy(request(SHARE, signedIn(OTHER))))).toBe(true);
    expect(through(proxy(request(SHARE, signedIn(ENTITY, 10))))).toBe(true);
  });

  it("tells the browser to send no referrer and search engines to keep out - the secret is in the address", () => {
    const res = proxy(request(SHARE));
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("makes nothing else public: every other page still needs a token", () => {
    for (const path of [
      "/share",
      "/sharex/OV/13_Oct_2026/s",
      "/shared/OV/13_Oct_2026/s",
      "/Share/OV/13_Oct_2026/s",
      "/landing/share/OV",
      `/share/../${HOME.slice(1)}`,
      `/share/%2e%2e/${HOME.slice(1)}`,
      HOME,
      `${HOME}/reports/r1/summary`,
      "/",
    ]) {
      const res = proxy(request(path));
      expect(res.status, path).toBe(307);
      expect(new URL(res.headers.get("location") ?? "").pathname, path).toBe("/handoff/petty-cash-web");
    }
  });
});
