/**
 * Fallback без LLM: опора на контентные подсказки (REQ-MNT-04).
 * Тексты нейтральны к провайдеру (13b: Gemini / DeepSeek).
 */

export type FallbackInput = {
  reason: "no_key" | "timeout" | "http" | "empty" | "network" | "rate_limited";
  /** HTTP-код при reason=http (например «503») — для текста fallback */
  httpDetail?: string;
  relatedDocs: { slug: string; title: string }[];
  hintsOpenedCount: number;
  hintStepsTotal: number;
  visibleHintTexts: string[];
  /** task (дефолт) | topic — формулировки без «ступени задачи» */
  scope?: "task" | "topic";
};

function httpReasonRu(detail: string | undefined, scope: "task" | "topic"): string {
  if (detail === "503" || detail === "429") {
    return scope === "topic"
      ? "Сервис ИИ сейчас перегружен (временно недоступен). Подожди минуту и напиши ещё раз — или открой статьи темы."
      : "Сервис ИИ сейчас перегружен (временно недоступен). Подожди минуту и напиши ещё раз — или открой ступень подсказки ниже.";
  }
  // Ученику не светим имена env / провайдеров (I13B-01); детали — в USER-GUIDE для родителя.
  if (detail === "404") {
    return scope === "topic"
      ? "Сервис ИИ временно недоступен. Подожди и напиши ещё раз — или открой статьи темы."
      : "Сервис ИИ временно недоступен. Подожди и напиши ещё раз — или открой ступень подсказки ниже.";
  }
  if (detail === "402") {
    return scope === "topic"
      ? "Резервный канал ИИ сейчас недоступен. Подожди и напиши ещё раз — или открой статьи темы."
      : "Резервный канал ИИ сейчас недоступен. Подожди и напиши ещё раз — или открой ступень подсказки ниже.";
  }
  return scope === "topic"
    ? "Сервис ИИ сейчас не ответил. Подожди минуту и попробуй ещё раз — или опирайся на статьи темы."
    : "Сервис ИИ сейчас не ответил. Подожди минуту и попробуй ещё раз — или открой ступень подсказки ниже.";
}

export function buildFallbackReply(input: FallbackInput): string {
  const scope = input.scope ?? "task";
  const reasonRu =
    input.reason === "no_key"
      ? "Сейчас ИИ-наставник недоступен (нет ключа API)."
      : input.reason === "timeout"
        ? "Наставник не успел ответить вовремя."
        : input.reason === "http"
          ? httpReasonRu(input.httpDetail, scope)
          : input.reason === "empty"
            ? "Сервис ИИ вернул пустой ответ (возможно, фильтр безопасности)."
            : input.reason === "rate_limited"
              ? scope === "topic"
                ? "На сегодня по этой теме хватит вопросов к ИИ — давай опираться на статьи."
                : "На сегодня по этой задаче хватит вопросов к ИИ — давай опираться на статьи и подсказки."
              : "Не удалось получить ответ ИИ (сеть).";

  const docs =
    input.relatedDocs.length > 0
      ? input.relatedDocs
          .slice(0, 3)
          .map((d) => `[${d.title}](slug:${d.slug})`)
          .join(", ")
      : "связанные статьи темы";

  const hintPart =
    scope === "topic"
      ? "Открой статьи темы из списка выше и перечитай определения — ответы задач сам не покажем."
      : input.hintStepsTotal === 0
        ? "Подсказок в задаче пока нет — перечитай условие и статьи."
        : input.hintsOpenedCount < input.hintStepsTotal
          ? `Открыто ступеней ${input.hintsOpenedCount} из ${input.hintStepsTotal}. Нажми «Открыть подсказку» в блоке ниже.`
          : "Все ступени подсказок уже открыты — перечитай их и статьи, эталон сам не появится (кнопка A — только если решишь посмотреть ответ).";

  const lastVisible =
    scope === "topic"
      ? ""
      : input.visibleHintTexts.length > 0
        ? `\n\nПоследняя открытая ступень:\n«${input.visibleHintTexts[input.visibleHintTexts.length - 1]}»`
        : "";

  const closing =
    scope === "topic"
      ? "Задай себе вопрос: какой приём из статей темы ещё не пробовал?"
      : "Задай себе вопрос: что именно в условии ещё не использовал?";

  return [
    reasonRu,
    "Давай без ИИ: опирайся на внутренние материалы.",
    `Полезно заглянуть: ${docs}.`,
    hintPart + lastVisible,
    closing,
  ].join("\n\n");
}
