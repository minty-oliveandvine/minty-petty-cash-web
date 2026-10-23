// @vitest-environment node
// The gate (proxy.ts): the cookie, for the company in the address - and Flask's re-handoff for
// everything else.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy, RENEW_WITHIN_SECONDS } from "@/proxy";

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

  it("lets a public share link through - the report someone was sent, read with no token", () => {
    const res = proxy(request(`/share/OV/13_Oct_2026/${"a".repeat(32)}`));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
    // the secret is in the address: never passed on, never indexed, never cached
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  // Exactly `/share/...` is public: everything else still needs the token.
  it.each([
    "/share",
    "/sharex/OV/13_Oct_2026/x",
    "/shared/OV",
    "/landing/share/x",
    `${HOME}/share/OV/13_Oct_2026/x`,
    `${HOME}/reports/r1/summary`,
    "/share/../entity/360812e1/olive-and-vine/petty-cash",
    "/share/%2e%2e/entity/360812e1/olive-and-vine/petty-cash",
    "/",
  ])("still sends %s to the hand-off", (path) => {
    handoff(proxy(request(path)));
  });

  it("starts the trip on a page of its own on a preview-set host", async () => {
    const res = proxy(request(HOME, {}, "pr-development-pettycash.dailyminty.com"));
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

// Old `pettycash.dailyminty.com` links after the host switch (lib/oldLinks.ts): each is answered
// before the gate, so it works the same with and without a token.
describe("old links after the host switch", () => {
  const SECRET = "Ab3_-xYz0123456789abcdefghijklmn";
  const OLD_SHARE = `/Minty_Report/OV/13_Oct_2026/${SECRET}/`;
  const without = {};
  const withToken = signedIn();

  describe.each([
    ["without a token", without],
    ["with a token", withToken],
  ])("%s", (_label, cookies) => {
    it("sends Flask's share link to the share page with a 308, never cached or passed on", () => {
      const res = proxy(request(OLD_SHARE, cookies));
      expect(res.status).toBe(308);
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
        `/share/OV/13_Oct_2026/${SECRET}`,
      );
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("drops the query from a share link", () => {
      const res = proxy(request(`${OLD_SHARE}?utm=x`, cookies));
      expect(new URL(res.headers.get("location") ?? "").search).toBe("");
    });

    it("moves an older Petty Cash address to this app's, query kept", () => {
      const res = proxy(
        request(
          "/entity/360812e1/olive-and-vine/reports/new/opening?transaction_date=2026-10-13",
          cookies,
        ),
      );
      expect(res.status).toBe(308);
      const to = new URL(res.headers.get("location") ?? "");
      expect(to.pathname + to.search).toBe(
        `${HOME}/reports/new/opening?transaction_date=2026-10-13`,
      );
      expect(to.origin).toBe("http://localhost:3010");
    });

    it("sends another Flask page to minty-web through the login-gated hand-off", () => {
      const res = proxy(request("/entity/360812e1/olive-and-vine/settings/users?x=1", cookies));
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location") ?? "");
      expect(to.origin + to.pathname).toBe("http://localhost:8000/handoff/minty-web");
      expect(to.searchParams.get("next")).toBe("/entity/360812e1/olive-and-vine/settings/users");
      expect(to.searchParams.get("return_origin")).toBe("http://localhost:3010");
    });

    it("sends /profile and /login to minty-web's pages", () => {
      const profile = new URL(proxy(request("/profile", cookies)).headers.get("location") ?? "");
      expect(profile.searchParams.get("next")).toBe("/profile");
      const login = new URL(proxy(request("/login", cookies)).headers.get("location") ?? "");
      expect(login.pathname).toBe("/handoff/minty-web");
      expect(login.searchParams.get("next")).toBe("/entities");
    });

    it("sends Flask's backend paths to the same path on accounts-api with a 308, query kept", () => {
      const res = proxy(request("/callback?code=c&state=s", cookies));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("http://localhost:8000/callback?code=c&state=s");
      const api = proxy(request("/api/me/profile", cookies));
      expect(api.headers.get("location")).toBe("http://localhost:8000/api/me/profile");
    });

    it("leaves an unknown path to the gate and then Next's 404", () => {
      const res = proxy(request("/nothing-here", cookies));
      expect(res.headers.get("location")?.includes("/Minty_Report") ?? false).toBe(false);
      expect(res.status === 307 || res.headers.get("x-middleware-next") === "1").toBe(true);
    });
  });

  it("goes to a meta-refresh page on a preview-set host for minty-web, as for every Flask trip", async () => {
    const res = proxy(request("/profile", {}, "pr-development-pettycash.dailyminty.com"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("/handoff/minty-web");
    expect(body).toContain("return_origin=http%3A%2F%2Fpr-development-pettycash.dailyminty.com");
  });

  describe("a full company id in place of <shortid>/<name>", () => {
    const UUID_PATH = `/entity/${ENTITY}/petty-cash/reports?page=2`;

    it("with that company's token: straight to the readable address (the name comes from the token's cookie)", () => {
      const res = proxy(request(UUID_PATH, withToken));
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location") ?? "");
      expect(to.pathname + to.search).toBe(`${HOME}/reports?page=2`);
    });

    it("without one: Flask's hand-off for that company, which comes back to the same address", () => {
      const qs = handoff(proxy(request(UUID_PATH)));
      expect(qs.get("entity_id")).toBe(ENTITY);
      expect(qs.get("next")).toBe(UUID_PATH);
    });

    it("with ANOTHER company's token: the same hand-off", () => {
      const qs = handoff(proxy(request(UUID_PATH, signedIn(OTHER))));
      expect(qs.get("entity_id")).toBe(ENTITY);
    });
  });

  it("runs the proxy on /api/... too, so an old API caller reaches Flask", () => {
    expect(config.matcher).toContain("/api/:path*");
  });
});
