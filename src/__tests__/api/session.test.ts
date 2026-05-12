import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/../app/api/session/route";

interface FakeRequest {
  json: () => Promise<unknown>;
}

const makeReq = (body: unknown): FakeRequest => ({
  json: async () => body,
});

describe("POST /api/session", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ client_secret: { value: "ek_test" } }),
      }),
    );
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT enable input transcription (single-model mode)", async () => {
    await POST(makeReq({ targetLanguage: "en" }) as unknown as Parameters<typeof POST>[0]);

    const fetchMock = vi.mocked(global.fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.session.audio.input.transcription).toBeUndefined();
  });

  it("passes targetLanguage as audio.output.language", async () => {
    await POST(makeReq({ targetLanguage: "de" }) as unknown as Parameters<typeof POST>[0]);

    const fetchMock = vi.mocked(global.fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.session.audio.output.language).toBe("de");
  });

  it("rejects unsupported target languages with 400", async () => {
    const res = await POST(makeReq({ targetLanguage: "xx" }) as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
