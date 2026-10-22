// The one way this app talks to its backends (../apiClient.ts): the company in the path, the
// bearer, a 401 back through Flask, every other failure the API's own sentence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  HOUSE_FALLBACK,
  mintyFetch,
  pettyCashBlob,
  pettyCashDownload,
  pettyCashFetch,
  subscriptionFetch,
} from "@/lib/apiClient";
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

    await expect(pettyCashFetch("/home", { query: { day: "2026-10-14" } })).resolves.toEqual({
      ok: 1,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/home?day=2026-10-14`,
    );
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok");
    // Flask's CORS allows only Authorization and Content-Type
    expect(headers.has("X-Entity-Id")).toBe(false);
  });

  it("sends JSON when given a body", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(200, null));
    await pettyCashFetch("/x", { method: "PUT", body: { a: 1 } });
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
    await expect(pettyCashFetch("")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "This company is still setting up.",
    });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    await expect(pettyCashFetch("")).rejects.toMatchObject({
      status: 502,
      message: HOUSE_FALLBACK,
    });
  });

  it("sends a multipart body as it is, leaving its Content-Type to the browser", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(201, { ok: 1 }));
    const form = new FormData();
    form.set("amount", "12.5");
    await expect(
      pettyCashFetch("/reports/expenses/lines", { method: "POST", form }),
    ).resolves.toEqual({ ok: 1 });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("never calls with no company - it goes for a token instead", async () => {
    await expect(pettyCashFetch("")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("pettyCashDownload", () => {
  it("reads a file with the bearer and the query, with the server's file name", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(
      new Response("Date,Amount", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=reports_a_to_b.csv",
        },
      }),
    );
    const file = await pettyCashDownload("/reports/export.csv", {
      query: { start_date: "2026-10-01", end_date: "2026-10-13" },
    });
    expect(file.filename).toBe("reports_a_to_b.csv");
    expect(await file.blob.text()).toBe("Date,Amount");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/reports/export.csv?start_date=2026-10-01&end_date=2026-10-13`,
    );
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("has no name when the header can't be read, and rejects with a refusal's sentence", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    expect((await pettyCashDownload("/reports/export.csv")).filename).toBeNull();
    fetchMock.mockResolvedValueOnce(answer(422, { error: "The To date is before the From date." }));
    await expect(pettyCashDownload("/reports/export.csv")).rejects.toMatchObject({
      status: 422,
      message: "The To date is before the From date.",
    });
  });
});

describe("pettyCashBlob", () => {
  it("reads a file with the bearer, for the company, as a Blob", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(
      new Response("%PDF-1.4", { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );
    const blob = await pettyCashBlob("/expense-lines/l/receipts/r");
    expect(await blob.text()).toBe("%PDF-1.4");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/expense-lines/l/receipts/r`,
    );
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("rejects with the API's sentence, and a 401 goes back through Flask", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(answer(404, { error: "I couldn't find that file." }));
    await expect(pettyCashBlob("/x")).rejects.toMatchObject({
      status: 404,
      message: "I couldn't find that file.",
    });
    fetchMock.mockResolvedValueOnce(answer(401, null));
    await expect(pettyCashBlob("/x")).rejects.toMatchObject({ status: 401 });
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("mintyFetch", () => {
  it("reads Flask, and a decoration's 401 only rejects", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(401, null));
    await expect(mintyFetch("/api/me/profile", { onUnauthorized: "reject" })).rejects.toMatchObject(
      { status: 401 },
    );
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/me/profile");
    expect(go).not.toHaveBeenCalled();
  });
});

describe("the wire rules every call shares", () => {
  // The query string, the body reading and the refusal wording - @minty/shared/apiClient's since
  // the shared-code refactor (2026-10-21).

  const urlOf = (n = 0) => String(fetchMock.mock.calls[n][0]);

  it("writes the house fallback exactly", () => {
    // owner 2026-10-21: one shared module (@minty/shared/apiClient) - was "Something went wrong on our side. Please try again."
    expect(HOUSE_FALLBACK).toBe("Something went wrong on my end. Mind trying again?");
  });

  it("drops undefined, null and empty strings from the query", async () => {
    // owner 2026-10-21: one shared module (@minty/shared/apiClient) - "" was sent as `a=` and null as `e=null`
    setAuth("tok", ENTITY, "n");
    fetchMock.mockImplementation(() => Promise.resolve(answer(200, null)));
    await pettyCashFetch("/x", {
      query: { a: "", b: undefined, c: 0, d: false, e: null, f: "a b&c" },
    });
    expect(urlOf()).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/x?c=0&d=false&f=a+b%26c`,
    );
  });

  it("adds no ? for an empty or all-undefined query, and joins with & onto a path that has one", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockImplementation(() => Promise.resolve(answer(200, null)));
    await pettyCashFetch("/x", { query: {} });
    await pettyCashFetch("/x", { query: { a: undefined } });
    await pettyCashFetch("/x?y=1", { query: { z: 2 } });
    await pettyCashFetch("/x?", { query: { z: 2 } });
    const base = `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}`;
    expect(urlOf(0)).toBe(`${base}/x`);
    expect(urlOf(1)).toBe(`${base}/x`);
    expect(urlOf(2)).toBe(`${base}/x?y=1&z=2`);
    // a trailing "?" still counts as having one: "?&"
    expect(urlOf(3)).toBe(`${base}/x?&z=2`);
  });

  it("puts the cookie's company in the path percent-encoded", async () => {
    setAuth("tok", "a/b c", "n");
    fetchMock.mockResolvedValue(answer(200, null));
    await pettyCashFetch("");
    expect(urlOf()).toBe("http://localhost:8010/api/petty-cash/v1/companies/a%2Fb%20c");
  });

  it("reads an empty answer as null and a non-JSON answer as its text", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(pettyCashFetch("/x")).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("plain words", { status: 200 }));
    await expect(pettyCashFetch("/x")).resolves.toBe("plain words");
  });

  it("asks for JSON on a read and anything on a file, and makes no call without a token", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockImplementation(() => Promise.resolve(answer(200, null)));
    await pettyCashFetch("/x");
    await pettyCashBlob("/x");
    await pettyCashDownload("/x");
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Accept")).toBe("application/json");
    expect((fetchMock.mock.calls[1][1].headers as Headers).get("Accept")).toBe("*/*");
    expect((fetchMock.mock.calls[2][1].headers as Headers).get("Accept")).toBe("*/*");
    // no body at all on a read, and no Content-Type
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect((fetchMock.mock.calls[0][1].headers as Headers).has("Content-Type")).toBe(false);

    // owner 2026-10-21: one shared module (@minty/shared/apiClient) - no token is no call (it was
    // sent with no bearer, and the 401 went back through Flask): now straight back through Flask
    document.cookie = "petty_cash_token=;path=/;max-age=0";
    await expect(mintyFetch("/api/me/profile")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("keeps a caller's own headers and init, but the bearer and Accept are its own", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(200, null));
    await pettyCashFetch("/x", {
      method: "DELETE",
      headers: { "X-Thing": "1", Accept: "text/plain", Authorization: "Bearer other" },
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    const headers = init.headers as Headers;
    expect(headers.get("X-Thing")).toBe("1");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok");
    // the request's own keys are never passed on to fetch
    expect(init).not.toHaveProperty("form");
    expect(init).not.toHaveProperty("query");
    expect(init).not.toHaveProperty("onUnauthorized");
  });

  it("refuses with the body attached, and falls back when `error` is not a sentence", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(answer(400, { error: { field: "amount" } }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 400,
      message: HOUSE_FALLBACK,
      body: { error: { field: "amount" } },
    });
    fetchMock.mockResolvedValueOnce(answer(500, null));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 500,
      message: HOUSE_FALLBACK,
      body: null,
    });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({ status: 502, body: "<html>" });
    // owner 2026-10-21: one shared module (@minty/shared/apiClient) - an empty error string was
    // shown as it stands (""); now it says nothing, so the house sentence does
    fetchMock.mockResolvedValueOnce(answer(409, { error: "" }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 409,
      message: HOUSE_FALLBACK,
    });
    // owner 2026-10-21: one shared module (@minty/shared/errorCopy) - `detail` and `message` are read
    // too, and a machine code or markup is never shown
    fetchMock.mockResolvedValueOnce(
      answer(422, { detail: "The amount is still empty. Add the amount to continue." }),
    );
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 422,
      message: "The amount is still empty. Add the amount to continue.",
    });
    fetchMock.mockResolvedValueOnce(answer(400, { message: "That day is already closed." }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 400,
      message: "That day is already closed.",
    });
    fetchMock.mockResolvedValueOnce(answer(409, { error: "report_locked" }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 409,
      message: HOUSE_FALLBACK,
    });
    fetchMock.mockResolvedValueOnce(answer(500, { error: "<b>Server Error</b> happened" }));
    await expect(pettyCashFetch("/x")).rejects.toMatchObject({
      status: 500,
      message: HOUSE_FALLBACK,
    });
  });

  it("ends a session with one sentence, no body, and without reading the answer", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(401, { error: "Token expired." }));
    const error = await pettyCashFetch("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Your session has ended. Signing you back in…",
      body: null,
    });
    // no company in the cookie: the same rejection, and no call at all
    document.cookie = "petty_cash_entity_id=;path=/;max-age=0";
    fetchMock.mockClear();
    await expect(pettyCashBlob("/x")).rejects.toMatchObject({
      status: 401,
      message: "Your session has ended. Signing you back in…",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes back through Flask on a 401 by default, and only rejects on `reject` - for every client", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockImplementation(() => Promise.resolve(answer(401, null)));
    await expect(
      subscriptionFetch("/api/me/subscriptions", { onUnauthorized: "reject" }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(pettyCashDownload("/x", { onUnauthorized: "reject" })).rejects.toMatchObject({
      status: 401,
    });
    expect(go).not.toHaveBeenCalled();
    await expect(subscriptionFetch("/api/me/subscriptions")).rejects.toMatchObject({ status: 401 });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("calls subscription-api at its own base", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(200, { entities: [] }));
    await expect(
      subscriptionFetch("/api/me/subscriptions", { query: { page: 1 } }),
    ).resolves.toEqual({ entities: [] });
    expect(urlOf()).toBe("http://localhost:8001/api/me/subscriptions?page=1");
  });

  it("refuses a file with the house sentence when the body is not JSON, with the text as its body", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(new Response("gateway", { status: 504 }));
    await expect(pettyCashBlob("/x")).rejects.toMatchObject({
      status: 504,
      message: HOUSE_FALLBACK,
      body: "gateway",
    });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(pettyCashDownload("/x")).rejects.toMatchObject({
      status: 500,
      message: HOUSE_FALLBACK,
      body: null,
    });
  });

  it("names a download from filename*, keeping only the last path segment", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(
      new Response("x", {
        status: 200,
        headers: { "Content-Disposition": "attachment; filename*=UTF-8''dir%2Fcaf%C3%A9.csv" },
      }),
    );
    expect((await pettyCashDownload("/x")).filename).toBe("café.csv");
  });
});

describe("ApiError", () => {
  // The error's shape - @minty/shared/apiClient's since the shared-code refactor (2026-10-21).

  it("is an Error named ApiError, with the status, the message and the body (null by default)", () => {
    const plain = new ApiError(404, "Not here.");
    expect(plain).toBeInstanceOf(Error);
    expect(plain.name).toBe("ApiError");
    expect(plain.status).toBe(404);
    expect(plain.message).toBe("Not here.");
    expect(plain.body).toBeNull();
    expect(new ApiError(422, "m", { error: "m" }).body).toEqual({ error: "m" });
  });
});
