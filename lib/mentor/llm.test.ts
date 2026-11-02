/**
 * Unit: маппинг ошибок / ретраев Gemini + DeepSeek + failover (I7-08, 13b).
 * Без live-сети — только мок fetch / мок клиентов.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFailoverLlmClient,
  generateWithDeepSeek,
  generateWithGemini,
  type LlmClient,
} from "./llm";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

describe("generateWithGemini (I7-08)", () => {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_HTTP_RETRIES;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODELS;
  });

  it("без ключа → no_key и без fetch", async () => {
    const r = await generateWithGemini({
      system: "s",
      user: "u",
      apiKey: null,
    });
    expect(r).toEqual({ ok: false, reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("успех: отдаёт trim-текст кандидатов", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "  привет  " }] } }],
      }),
    );
    const r = await generateWithGemini({
      system: "sys",
      user: "ask",
      apiKey: "test-key",
      model: "gemini-test",
    });
    expect(r).toEqual({ ok: true, text: "привет" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models/gemini-test:generateContent");
    expect(String(url)).not.toContain("test-key");
    expect(String(url)).not.toMatch(/key=/i);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("HTTP 400 → http без ретрая", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("bad", 400));
    const r = await generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
      model: "m",
    });
    expect(r).toEqual({ ok: false, reason: "http", detail: "400" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("пустой candidates → empty", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "   " }] } }],
        promptFeedback: { blockReason: "SAFETY" },
      }),
    );
    const r = await generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
    });
    expect(r).toEqual({ ok: false, reason: "empty", detail: "SAFETY" });
  });

  it("AbortError → timeout", async () => {
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const err = new Error("aborted");
      err.name = "AbortError";
      if (init?.signal?.aborted) throw err;
      throw err;
    });
    const r = await generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
      timeoutMs: 5,
    });
    expect(r).toEqual({ ok: false, reason: "timeout" });
  });

  it("прочий throw → network", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
    });
    expect(r).toEqual({
      ok: false,
      reason: "network",
      detail: "ECONNRESET",
    });
  });

  it("503 затем успех — ретрай и ok", async () => {
    process.env.GEMINI_HTTP_RETRIES = "3";
    fetchMock
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "ok-after-retry" }] } }],
        }),
      );

    const pending = generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
      model: "m",
    });
    await vi.runAllTimersAsync();
    const r = await pending;

    expect(r).toEqual({ ok: true, text: "ok-after-retry" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("429 исчерпывает ретраи → http 429", async () => {
    process.env.GEMINI_HTTP_RETRIES = "2";
    fetchMock
      .mockResolvedValueOnce(textResponse("limit", 429))
      .mockResolvedValueOnce(textResponse("limit", 429));

    const pending = generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
      model: "m",
    });
    await vi.runAllTimersAsync();
    const r = await pending;

    expect(r).toEqual({ ok: false, reason: "http", detail: "429" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("503 на primary env-модели → успех на fallback-модели", async () => {
    process.env.GEMINI_MODEL = "gemini-primary";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-alt";
    process.env.GEMINI_HTTP_RETRIES = "1";
    fetchMock
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "from-alt" }] } }],
        }),
      );

    const pending = generateWithGemini({
      system: "s",
      user: "u",
      apiKey: "k",
      // без input.model — включается каскад
    });
    await vi.runAllTimersAsync();
    const r = await pending;

    expect(r).toEqual({ ok: true, text: "from-alt" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("gemini-primary");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gemini-alt");
  });

  it("404 (модель снята) на primary → сразу следующая модель, без ретраев", async () => {
    process.env.GEMINI_MODEL = "gemini-retired";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-alt";
    process.env.GEMINI_HTTP_RETRIES = "3";
    fetchMock
      .mockResolvedValueOnce(textResponse("not found", 404))
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: "ok-alt" }] } }] }),
      );

    const pending = generateWithGemini({ system: "s", user: "u", apiKey: "k" });
    await vi.runAllTimersAsync();
    const r = await pending;

    expect(r).toEqual({ ok: true, text: "ok-alt" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gemini-alt");
  });

  it("400 (геоблок) — общий для всех моделей: каскад не запускается", async () => {
    process.env.GEMINI_MODEL = "gemini-primary";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-alt";
    fetchMock.mockResolvedValueOnce(
      textResponse('{"error":{"message":"User location is not supported"}}', 400),
    );

    const r = await generateWithGemini({ system: "s", user: "u", apiKey: "k" });

    expect(r).toEqual({ ok: false, reason: "http", detail: "400" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("запасные модели — по одной попытке (ретраи только у primary)", async () => {
    process.env.GEMINI_MODEL = "gemini-primary";
    process.env.GEMINI_FALLBACK_MODELS = "gemini-alt-1,gemini-alt-2";
    process.env.GEMINI_HTTP_RETRIES = "2";
    fetchMock
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(textResponse("busy", 503));

    const pending = generateWithGemini({ system: "s", user: "u", apiKey: "k" });
    await vi.runAllTimersAsync();
    const r = await pending;

    expect(r).toEqual({ ok: false, reason: "http", detail: "503" });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("gemini-primary"))).toHaveLength(2);
    expect(urls.filter((u) => u.includes("gemini-alt-1"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("gemini-alt-2"))).toHaveLength(1);
  });
});

describe("generateWithDeepSeek (13b)", () => {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("без ключа → no_key и без fetch", async () => {
    const r = await generateWithDeepSeek({
      system: "s",
      user: "u",
      apiKey: null,
    });
    expect(r).toEqual({ ok: false, reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("успех: choices[0].message.content", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "  ответ DS  " } }],
      }),
    );
    const r = await generateWithDeepSeek({
      system: "sys",
      user: "ask",
      apiKey: "ds-key",
      model: "deepseek-test",
    });
    expect(r).toEqual({ ok: true, text: "ответ DS" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("api.deepseek.com/chat/completions");
    expect(String(url)).not.toContain("ds-key");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer ds-key",
    );
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("deepseek-test");
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "ask" });
  });

  it("HTTP 429 → http", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("limit", 429));
    const r = await generateWithDeepSeek({
      system: "s",
      user: "u",
      apiKey: "k",
    });
    expect(r).toEqual({ ok: false, reason: "http", detail: "429" });
  });

  it("пустой content → empty", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "   " } }] }),
    );
    const r = await generateWithDeepSeek({
      system: "s",
      user: "u",
      apiKey: "k",
    });
    expect(r).toEqual({ ok: false, reason: "empty" });
  });

  it("AbortError → timeout", async () => {
    fetchMock.mockImplementationOnce(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const r = await generateWithDeepSeek({
      system: "s",
      user: "u",
      apiKey: "k",
      timeoutMs: 5,
    });
    expect(r).toEqual({ ok: false, reason: "timeout" });
  });

  it("прочий throw → network", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await generateWithDeepSeek({
      system: "s",
      user: "u",
      apiKey: "k",
    });
    expect(r).toEqual({
      ok: false,
      reason: "network",
      detail: "ECONNRESET",
    });
  });
});

describe("createFailoverLlmClient (13b)", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("primary ok → secondary не зовём", async () => {
    const primary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: true, text: "from-primary" }),
    };
    const secondary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: true, text: "from-secondary" }),
    };
    const chain = createFailoverLlmClient(primary, secondary);
    const r = await chain.generate({ system: "s", user: "u" });
    expect(r).toEqual({ ok: true, text: "from-primary" });
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it("primary fail → secondary ok", async () => {
    const primary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "timeout" }),
    };
    const secondary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: true, text: "from-secondary" }),
    };
    const chain = createFailoverLlmClient(primary, secondary);
    const r = await chain.generate({
      system: "s",
      user: "u",
      apiKey: "gemini-only",
      model: "gemini-x",
    });
    expect(r).toEqual({ ok: true, text: "from-secondary" });
    expect(secondary.generate).toHaveBeenCalledWith({
      system: "s",
      user: "u",
      timeoutMs: undefined,
    });
  });

  it("оба fail → причина secondary", async () => {
    const primary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "http", detail: "429" }),
    };
    const secondary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "no_key" }),
    };
    const chain = createFailoverLlmClient(primary, secondary);
    const r = await chain.generate({ system: "s", user: "u" });
    expect(r).toEqual({ ok: false, reason: "no_key" });
  });

  it("primary 503 + secondary 402 → оставляем 503 для текста fallback", async () => {
    const primary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "http", detail: "503" }),
    };
    const secondary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "http", detail: "402" }),
    };
    const chain = createFailoverLlmClient(primary, secondary);
    const r = await chain.generate({ system: "s", user: "u" });
    expect(r).toEqual({ ok: false, reason: "http", detail: "503" });
  });

  it("primary no_key → secondary без ключа → no_key", async () => {
    const primary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "no_key" }),
    };
    const secondary: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "no_key" }),
    };
    const chain = createFailoverLlmClient(primary, secondary);
    const r = await chain.generate({ system: "s", user: "u" });
    expect(r).toEqual({ ok: false, reason: "no_key" });
    expect(secondary.generate).toHaveBeenCalledOnce();
  });
});
