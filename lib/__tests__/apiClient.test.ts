// The one way this app talks to its backends (../apiClient.ts): the company in the path, the
// bearer, a 401 back through Flask, every other failure the API's own sentence.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  HOUSE_FALLBACK,
  filenameFromDisposition,
  mintyFetch,
  pettyCashBlob,
  pettyCashDownload,
  pettyCashFetch,
  pettyCashPublicFetch,
} from "@/lib/apiClient";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";

const ENTITY = "360812e1-9f94-46a3-aa31-347e21afde8e";

function answer(status: number, body: unknown) {
  return new Response(body === null ? "" : JSON.stringify(body), { status });
}

// Typed: Vitest 5's untyped vi.fn() is "any function or class", which the hand-off does not accept.
let go: Mock<(url: string) => void>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  go = vi.fn<(url: string) => void>();
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
    await pettyCashFetch("/x", { method: "PUT", json: { a: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("sends a multipart body as it stands, leaving its Content-Type to the browser", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(201, { line: {} }));
    const form = new FormData();
    form.append("amount", "12.5");
    await pettyCashFetch("/reports/expenses/lines", { method: "POST", form });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
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

  it("never calls with no company - it goes for a token instead", async () => {
    await expect(pettyCashFetch("")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe("pettyCashPublicFetch - a shared report, read by anyone", () => {
  const PATH = "/api/petty-cash/v1/public/share/OV/13_Oct_2026/s3cr3t";

  it("sends no bearer even to a signed-in person, no cookies and no referrer", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(answer(200, { ok: 1 }));
    await expect(pettyCashPublicFetch(PATH)).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:8010${PATH}`);
    expect((init.headers as Headers).has("Authorization")).toBe(false);
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.cache).toBe("no-store");
  });

  it("rejects with the status and never goes through Flask, even on a 401", async () => {
    fetchMock.mockResolvedValueOnce(answer(410, { error: "expired" }));
    await expect(pettyCashPublicFetch(PATH)).rejects.toMatchObject({
      name: "ApiError",
      status: 410,
    });
    fetchMock.mockResolvedValueOnce(answer(401, null));
    await expect(pettyCashPublicFetch(PATH)).rejects.toMatchObject({ status: 401 });
    expect(go).not.toHaveBeenCalled();
  });

  it("refuses a path outside the public surface", async () => {
    await expect(pettyCashPublicFetch("/api/petty-cash/v1/companies/x/home")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pettyCashBlob", () => {
  it("reads a file's bytes with the bearer, typed by the answer", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const blob = await pettyCashBlob("/expense-lines/l/receipts/r");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(4);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/expense-lines/l/receipts/r`,
    );
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("fails with the API's sentence, and a 401 goes back through Flask", async () => {
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

describe("pettyCashDownload", () => {
  it("reads a download with the bearer and the query, named by its Content-Disposition", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValue(
      new Response("Date,Amount", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=reports_2026-10-01_to_2026-10-13.csv",
        },
      }),
    );
    const file = await pettyCashDownload("/reports/export.csv", {
      query: { start_date: "2026-10-01", end_date: "2026-10-13" },
    });
    expect(file.filename).toBe("reports_2026-10-01_to_2026-10-13.csv");
    expect(await file.blob.text()).toBe("Date,Amount");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://localhost:8010/api/petty-cash/v1/companies/${ENTITY}/reports/export.csv?start_date=2026-10-01&end_date=2026-10-13`,
    );
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok");
  });

  it("has no name when the answer gives none, and a refusal is the API's sentence", async () => {
    setAuth("tok", ENTITY, "n");
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    expect((await pettyCashDownload("/x")).filename).toBeNull();
    fetchMock.mockResolvedValueOnce(
      answer(422, { error: "Choose a start date on or before the end date." }),
    );
    await expect(pettyCashDownload("/x")).rejects.toMatchObject({
      status: 422,
      message: "Choose a start date on or before the end date.",
    });
  });
});

describe("filenameFromDisposition", () => {
  it.each([
    ["attachment; filename=reports.csv", "reports.csv"],
    ['attachment; filename="report one.csv"', "report one.csv"],
    ["attachment; filename*=UTF-8''caf%C3%A9.csv; filename=cafe.csv", "café.csv"],
    ["attachment", null],
    [null, null],
  ])("%s -> %s", (header, name) => {
    expect(filenameFromDisposition(header)).toBe(name);
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
