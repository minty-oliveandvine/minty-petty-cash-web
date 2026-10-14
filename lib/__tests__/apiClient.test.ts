// The one way this app talks to its backends (../apiClient.ts): the company in the path, the
// bearer, a 401 back through Flask, every other failure the API's own sentence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOUSE_FALLBACK, mintyFetch, pettyCashFetch } from "@/lib/apiClient";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

function answer(status: number, body: unknown) {
  return new Response(body === null ? "" : JSON.stringify(body), { status });
}

let go: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  go = vi.fn();
  _resetHandoffForTests(go);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetHandoffForTests();
});

describe("pettyCashFetch", () => {
  it("calls the company's path on the Petty Cash API with the bearer and nothing else", async () => {
    setAuth("tok", ENTITY, "Olive & Vine");
    fetchMock.mockResolvedValue(answer(200, { ok: 1 }));

    await expect(pettyCashFetch("/home", { query: { day: "2026-10-14" } })).resolves.toEqual({ ok: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/home?day=2026-10-14`);
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok");
    // Flask's CORS allows only Authorization and Content-Type
    expect(headers.has("X-Entity-Id")).toBe(false);
  });

  it("sends JSON when given a body", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(200, null));
    await pettyCashFetch("/x", { method: "PUT", json: { a: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("answers a 401 by going back through Flask for this company", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(401, { error: "unauthorized" }));
    await expect(pettyCashFetch("")).rejects.toMatchObject({ status: 401 });
    expect(new URL(go.mock.calls[0][0]).searchParams.get("entity_id")).toBe(ENTITY);
  });

  it("rejects with the API's own sentence, or the house one", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(answer(409, { error: "This company is still setting up." }));
    await expect(pettyCashFetch("")).rejects.toMatchObject({ name: "ApiError", status: 409, message: "This company is still setting up." });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    await expect(pettyCashFetch("")).rejects.toMatchObject({ status: 502, message: HOUSE_FALLBACK });
  });

  it("never calls with no company - it goes for a token instead", async () => {
    await expect(pettyCashFetch("")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("mintyFetch", () => {
  it("reads Flask, and a decoration's 401 only rejects", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(401, null));
    await expect(mintyFetch("/api/me/profile", { onUnauthorized: "reject" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/me/profile");
    expect(go).not.toHaveBeenCalled();
  });
});
