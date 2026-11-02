/**
 * Клиент LLM: Gemini + DeepSeek + failover-цепочка (13b).
 * Ошибка провайдеров → вызывающий (turn) делает content-fallback.
 *
 * Gemini при 503/429: ретраи на модели, затем запасные (`GEMINI_FALLBACK_MODELS`),
 * затем DeepSeek.
 */
import "server-only";

export type LlmMessage = { role: "user" | "model"; text: string };

export type LlmGenerateInput = {
  system: string;
  user: string;
  /** Для тестов / DI */
  timeoutMs?: number;
  apiKey?: string | null;
  model?: string;
};

export type LlmGenerateResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no_key" | "timeout" | "http" | "empty" | "network"; detail?: string };

export type LlmClient = {
  generate: (input: LlmGenerateInput) => Promise<LlmGenerateResult>;
};

/**
 * Для новых ключей AI Studio (2026): gemini-2.5-* часто 404; gemini-3.6-flash
 * на чат-промптах часто >45с → timeout/fallback. Дефолт для наставника: 3.5-flash.
 * Переопределение: GEMINI_MODEL (например gemini-3.1-flash-lite — стабильнее при 503).
 */
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

/**
 * Запасные Gemini при 503/429/404 на primary (через запятую).
 * 2026-09: 3.5-flash и 3.1-flash-lite часто 503; 3.5-flash-lite / 3-flash-preview
 * отвечают ~1 с, 3.6-flash ~5 с. 3.8-flash не берём: не поддерживает thinkingLevel minimal.
 */
const DEFAULT_GEMINI_FALLBACK_MODELS =
  "gemini-3.5-flash-lite,gemini-3-flash-preview,gemini-3.6-flash,gemini-3.1-flash-lite";

/** Актуальный ID DeepSeek (не legacy deepseek-chat). Переопределение: DEEPSEEK_MODEL. */
const DEFAULT_DEEPSEEK_MODEL =
  process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";

/**
 * Цепочка моделей Gemini.
 * Явный `input.model` (тесты / DI) — только он, без каскада.
 */
export function resolveGeminiModelChain(explicitModel?: string | null): string[] {
  const forced = explicitModel?.trim();
  if (forced) return [forced];

  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const extras = (
    process.env.GEMINI_FALLBACK_MODELS?.trim() || DEFAULT_GEMINI_FALLBACK_MODELS
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const m of [primary, ...extras]) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

function isRetriableGeminiHttp(detail: string | undefined): boolean {
  return detail === "503" || detail === "429";
}

/**
 * Имеет ли смысл следующая модель цепочки: перегрузка (503/429) или модель снята (404).
 * 400 (в т.ч. геоблок «User location is not supported») — общий для всех моделей → сразу к DeepSeek.
 */
function shouldTryNextGeminiModel(result: LlmGenerateResult): boolean {
  if (result.ok || result.reason !== "http") return false;
  return isRetriableGeminiHttp(result.detail) || result.detail === "404";
}

/** Gemini через fetch; ключ только из аргумента / env на вызывающей стороне. */
export async function generateWithGemini(input: LlmGenerateInput): Promise<LlmGenerateResult> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "no_key" };
  }

  // 3.x + cold start: запас; при 3.6 всё равно лучше сменить модель в env
  const timeoutMs =
    input.timeoutMs ??
    (Number(process.env.GEMINI_TIMEOUT_MS) || 60000);

  const models = resolveGeminiModelChain(input.model);
  const maxAttempts = Number(process.env.GEMINI_HTTP_RETRIES) || 3;
  let lastFail: LlmGenerateResult | null = null;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi]!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Ретраи с паузой — только на primary; запасные по одной попытке, чтобы цепочка не тянулась.
    const attemptsForModel = mi === 0 ? maxAttempts : 1;
    for (let attempt = 1; attempt <= attemptsForModel; attempt++) {
      const result = await generateWithGeminiOnce({
        url,
        apiKey,
        model,
        timeoutMs,
        system: input.system,
        user: input.user,
      });
      if (result.ok) return result;

      lastFail = result;
      const retriable =
        result.reason === "http" && isRetriableGeminiHttp(result.detail);
      if (!retriable || attempt === attemptsForModel) break;

      // Перегрузка 503: короткие 400ms почти бесполезны — ждём дольше.
      const waitMs = 1000 * attempt;
      console.warn(
        `[mentor/llm] retry ${attempt}/${maxAttempts - 1} after HTTP ${result.detail} model=${model} wait=${waitMs}ms`,
      );
      await sleep(waitMs);
    }

    const canTryNext =
      lastFail !== null && shouldTryNextGeminiModel(lastFail) && mi < models.length - 1;
    if (canTryNext) {
      console.warn(
        `[mentor/llm] model ${model} exhausted on ${lastFail && !lastFail.ok ? lastFail.detail : ""} → try ${models[mi + 1]}`,
      );
      continue;
    }
    break;
  }

  return lastFail ?? { ok: false, reason: "http", detail: "unknown" };
}

/**
 * DeepSeek OpenAI-compatible chat/completions; opt-in по DEEPSEEK_API_KEY.
 * Без внутренних ретраев — один запрос; failover уже сменил провайдера.
 */
export async function generateWithDeepSeek(
  input: LlmGenerateInput,
): Promise<LlmGenerateResult> {
  const apiKey = input.apiKey ?? process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "no_key" };
  }

  const timeoutMs =
    input.timeoutMs ??
    (Number(process.env.DEEPSEEK_TIMEOUT_MS) ||
      Number(process.env.GEMINI_TIMEOUT_MS) ||
      60000);

  const model = input.model?.trim() || DEFAULT_DEEPSEEK_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[mentor/llm] deepseek HTTP ${res.status} model=${model}:`,
        detail.slice(0, 300),
      );
      return { ok: false, reason: "http", detail: `${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!String(text).trim()) {
      console.error(`[mentor/llm] deepseek empty response model=${model}`);
      return { ok: false, reason: "empty" };
    }
    return { ok: true, text: String(text).trim() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    console.error(
      `[mentor/llm] deepseek network model=${model}:`,
      e instanceof Error ? e.message : e,
    );
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithGeminiOnce(opts: {
  url: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  system: string;
  user: string;
}): Promise<LlmGenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        // Gemini 3: temperature игнорируется; minimal — низкая латентность для чата.
        generationConfig: {
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Не логируем ключ; обрезаем тело ответа API
      console.error(
        `[mentor/llm] HTTP ${res.status} model=${opts.model}:`,
        detail.slice(0, 300),
      );
      return { ok: false, reason: "http", detail: `${res.status}` };
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      const block = data.promptFeedback?.blockReason;
      console.error(`[mentor/llm] empty response model=${opts.model}`, block ?? "");
      return { ok: false, reason: "empty", detail: block };
    }
    return { ok: true, text: text.trim() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    console.error(
      `[mentor/llm] network model=${opts.model}:`,
      e instanceof Error ? e.message : e,
    );
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const geminiLlmClient: LlmClient = {
  generate: generateWithGemini,
};

export const deepseekLlmClient: LlmClient = {
  generate: generateWithDeepSeek,
};

/**
 * Gemini → DeepSeek (один переход). При успехе primary вторичный не зовём.
 * Во вторичный не протаскиваем apiKey/model primary (у каждого свои env).
 * Если secondary = 402 (биллинг), а primary был 503/429 — возвращаем primary,
 * чтобы fallback-текст говорил про перегрузку, а не «не ответил».
 */
export function createFailoverLlmClient(
  primary: LlmClient,
  secondary: LlmClient,
): LlmClient {
  return {
    async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
      const first = await primary.generate(input);
      if (first.ok) return first;

      console.warn(
        `[mentor/llm] primary fail reason=${first.reason}` +
          (first.detail ? ` detail=${first.detail.slice(0, 80)}` : "") +
          " → try secondary",
      );

      const second = await secondary.generate({
        system: input.system,
        user: input.user,
        timeoutMs: input.timeoutMs,
      });

      if (second.ok) {
        console.warn("[mentor/llm] secondary ok");
        return second;
      }

      console.warn(
        `[mentor/llm] secondary fail reason=${second.reason}` +
          (second.detail ? ` detail=${second.detail.slice(0, 80)}` : ""),
      );

      const secondaryBilling =
        second.reason === "http" && second.detail === "402";
      const primaryOverloaded =
        first.reason === "http" && isRetriableGeminiHttp(first.detail);
      if (secondaryBilling && primaryOverloaded) {
        return first;
      }

      // Причина для текста fallback — от последнего провайдера в цепочке
      return second;
    },
  };
}

/** Дефолт наставника: Gemini → DeepSeek → (turn) content fallback. */
export const mentorLlmClient: LlmClient = createFailoverLlmClient(
  geminiLlmClient,
  deepseekLlmClient,
);
