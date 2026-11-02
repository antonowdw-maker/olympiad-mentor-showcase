/**
 * Сборка промпта наставника без PII (INV-09).
 */

export type MentorPromptInput = {
  taskTitle: string;
  taskStatement: string;
  relatedDocSlugs: string[];
  relatedDocTitles: string[];
  recentAttempts: { submittedAnswer: string; isCorrect: boolean }[];
  hintsOpenedCount: number;
  hintStepsTotal: number;
  revealAllowed: boolean;
  /** Эталон — только если revealAllowed */
  acceptedAnswers?: string[];
  history: { role: "user" | "assistant"; body: string }[];
  userMessage: string;
};

/** Контекст чата на уровне темы (без конкретной задачи / эталона). */
export type MentorTopicPromptInput = {
  topicTitle: string;
  topicDescription: string;
  articleSlugs: string[];
  articleTitles: string[];
  history: { role: "user" | "assistant"; body: string }[];
  userMessage: string;
};

export const MENTOR_SYSTEM_PROMPT = `Ты — наставник по олимпиадной математике для ученика 6 класса (русский язык).
Тон: спокойный ментор, иногда строгий коуч — коротко и по делу.
Правила:
- Задавай наводящие вопросы, не выдавай готовый ответ задачи, пока явно не сказано, что эталон уже открыт учеником.
- Пока эталон НЕ открыт: не подтверждай и не опровергай итоговый ответ ученика («верно», «неверно», «абсолютно верный», «ты прав насчёт ответа»). Можно хвалить ход мысли и уточнять нюансы вопросами — без вердикта по ответу.
- Ссылайся на внутренние статьи только по их slug из списка (формат: [название](slug:article-slug)).
- Не проси и не используй имя, логин, email или id ученика.
- Не выдумывай внешние ссылки как основной путь.
- Отвечай на русском, 2–6 коротких абзацев или списка.`;

/** Собирает user-контент для LLM (без login/name/id). */
export function buildMentorUserPrompt(input: MentorPromptInput): string {
  const docs =
    input.relatedDocSlugs.length === 0
      ? "(нет связанных статей)"
      : input.relatedDocSlugs
          .map((slug, i) => `- ${input.relatedDocTitles[i] ?? slug} → slug:${slug}`)
          .join("\n");

  const attempts =
    input.recentAttempts.length === 0
      ? "(попыток ещё не было)"
      : input.recentAttempts
          .map(
            (a, i) =>
              `${i + 1}) «${a.submittedAnswer}» — ${a.isCorrect ? "верно" : "неверно"}`,
          )
          .join("\n");

  const revealBlock = input.revealAllowed
    ? `Эталон УЖЕ открыт учеником (кнопка A). Можно обсуждать ответ. Эталон: ${JSON.stringify(input.acceptedAnswers ?? [])}`
    : [
        "Эталон НЕ открыт.",
        "Не называй правильный ответ.",
        "Не пиши, что ответ/итоговый ответ ученика верный, правильный или неверный.",
        "Не закрывай задачу фразами вроде «абсолютно верный».",
        "Веди вопросами; вердикт — только через проверку ответа в тренажёре или кнопку A.",
      ].join(" ");

  const hist =
    input.history.length === 0
      ? "(пусто)"
      : input.history
          .slice(-12)
          .map((m) => `${m.role === "user" ? "Ученик" : "Наставник"}: ${m.body}`)
          .join("\n");

  return [
    `Задача: ${input.taskTitle}`,
    `Условие:\n${input.taskStatement}`,
    `Связанные статьи:\n${docs}`,
    `Подсказки открыто: ${input.hintsOpenedCount} из ${input.hintStepsTotal}`,
    `Недавние попытки:\n${attempts}`,
    revealBlock,
    `История чата:\n${hist}`,
    `Сообщение ученика:\n${input.userMessage}`,
  ].join("\n\n");
}

/** User-промпт для чата по теме: без эталонов и без условий конкретных задач. */
export function buildMentorTopicUserPrompt(input: MentorTopicPromptInput): string {
  const docs =
    input.articleSlugs.length === 0
      ? "(статей пока нет)"
      : input.articleSlugs
          .map((slug, i) => `- ${input.articleTitles[i] ?? slug} → slug:${slug}`)
          .join("\n");

  const hist =
    input.history.length === 0
      ? "(пусто)"
      : input.history
          .slice(-12)
          .map((m) => `${m.role === "user" ? "Ученик" : "Наставник"}: ${m.body}`)
          .join("\n");

  return [
    `Тема: ${input.topicTitle}`,
    `Описание темы:\n${input.topicDescription}`,
    "Контекст: чат по теме целиком, не по одной задаче.",
    "Не называй ответы конкретных задач банка. Веди к статьям и общим приёмам.",
    "Эталон любой задачи НЕ открыт — не подтверждай и не опровергай итоговые ответы.",
    `Статьи темы:\n${docs}`,
    `История чата:\n${hist}`,
    `Сообщение ученика:\n${input.userMessage}`,
  ].join("\n\n");
}

/** Проверка: в промпте нет типичных PII-ключей из сессии. */
export function promptContainsForbiddenPii(
  prompt: string,
  forbidden: string[],
): boolean {
  const lower = prompt.toLowerCase();
  return forbidden.some((f) => {
    const t = f.trim().toLowerCase();
    return t.length >= 2 && lower.includes(t);
  });
}

/**
 * Вычищает forbidden из текста (INV-09): замена, не отказ обслуживать.
 * Длинные токены сначала, чтобы не резать куски id по частям дважды бессмысленно.
 */
export function scrubForbiddenPii(text: string, forbidden: string[]): string {
  const tokens = [...new Set(forbidden.map((f) => f.trim()).filter((f) => f.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const t of tokens) {
    const re = new RegExp(escapeRe(t), "giu");
    out = out.replace(re, "…");
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
