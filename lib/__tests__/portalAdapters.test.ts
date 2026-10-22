// My Profile's reads for the packaged panel and card (lib/apiClient.ts's `profileApi` and
// `loadSubscriptions`, over @minty/shared/portal since the shared-code refactor, 2026-10-21):
// Flask's /api/me/profile with the company as ?entity=, and every page of subscription-api's
// /api/me/subscriptions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, loadSubscriptions, profileApi } from "@/lib/apiClient";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

let fetchMock: ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  _resetHandoffForTests(vi.fn());
  setAuth("tok", ENTITY, "Olive & Vine");
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetHandoffForTests();
});

describe("profileApi", () => {
  // The profile adapter - @minty/shared/portal's createProfileApi over mintyFetch.

  it("loads the profile for the company, passing the signal on", async () => {
    fetchMock.mockResolvedValue(json({ user: { name: "J" } }));
    const signal = new AbortController().signal;
    await expect(profileApi.load(ENTITY, signal)).resolves.toEqual({ user: { name: "J" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:8000/api/me/profile?entity=${ENTITY}`);
    expect(init.signal).toBe(signal);
    expect(init.method).toBeUndefined();
  });

  it("names no company when the id is empty", async () => {
    fetchMock.mockResolvedValue(json({}));
    await profileApi.load("", new AbortController().signal);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/me/profile");
  });

  it("saves with a PATCH of the changes as JSON, for the company", async () => {
    fetchMock.mockResolvedValue(json({ user: { first_name: "Jo" } }));
    await expect(profileApi.save({ first_name: "Jo" }, ENTITY)).resolves.toEqual({ user: { first_name: "Jo" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:8000/api/me/profile?entity=${ENTITY}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"first_name":"Jo"}');
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("refuses with Flask's sentence", async () => {
    fetchMock.mockResolvedValue(json({ error: "That name is too long." }, 422));
    await expect(profileApi.save({ first_name: "x" }, ENTITY)).rejects.toMatchObject({ status: 422, message: "That name is too long." });
  });
});

describe("loadSubscriptions", () => {
  // The per_page=100 page walk - @minty/shared/portal's fetchAllSubscriptions over subscriptionFetch.
  // owner 2026-10-21: one shared module (@minty/shared/portal) - the result also carries page 1's
  // payer, billing and transfer_outcomes (it kept only the entities), and a page with no entities
  // list is refused with a 502.

  it("walks every page at 100 a page, in order, with the signal, with page 1's payer and billing", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ payer: { id: "p" }, billing: { currency: "HKD" }, entities: [{ id: "a" }], page: 1, pages: 3, total: 3 }))
      .mockResolvedValueOnce(json({ payer: { id: "other" }, entities: [{ id: "b" }], page: 2, pages: 3 }))
      .mockResolvedValueOnce(json({ entities: [{ id: "c" }], page: 3, pages: 3 }));
    const signal = new AbortController().signal;
    await expect(loadSubscriptions(signal)).resolves.toEqual({
      payer: { id: "p" },
      billing: { currency: "HKD" },
      entities: [{ id: "a" }, { id: "b" }, { id: "c" }],
      transfer_outcomes: [],
    });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      "http://localhost:8001/api/me/subscriptions?page=1&per_page=100",
      "http://localhost:8001/api/me/subscriptions?page=2&per_page=100",
      "http://localhost:8001/api/me/subscriptions?page=3&per_page=100",
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.signal === signal)).toBe(true);
  });

  it("reads once when there is one page, none or no page count", async () => {
    for (const pages of [1, 0, undefined]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(json({ entities: [{ id: "a" }], pages }));
      await expect(loadSubscriptions(new AbortController().signal)).resolves.toMatchObject({ entities: [{ id: "a" }] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects the whole read when a later page is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ entities: [{ id: "a" }], pages: 2 }))
      .mockResolvedValueOnce(json({ error: "Try again later." }, 503));
    await expect(loadSubscriptions(new AbortController().signal)).rejects.toMatchObject({ status: 503, message: "Try again later." });
  });

  it("refuses a page with no entities list as an ApiError 502", async () => {
    fetchMock.mockResolvedValueOnce(json({ pages: 1 }));
    const error = await loadSubscriptions(new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, message: "That came back in a shape I didn't expect. Mind trying again?" });
  });
});
