/**
 * Unit: наставник — фильтр, промпт, fallback, turn с моком LLM (REQ-MNT-07).
 */
import { describe, expect, it, vi } from "vitest";
import { buildFallbackReply } from "./fallback";
import { filterMentorReply, filterMentorReplyForTaskGroups } from "./filter";
import {
  MENTOR_SYSTEM_PROMPT,
  buildMentorTopicUserPrompt,
  buildMentorUserPrompt,
  promptContainsForbiddenPii,
  scrubForbiddenPii,
} from "./prompt";
import { runMentorTopicTurn, runMentorTurn } from "./turn";
import type { LlmClient } from "./llm";

describe("filterMentorReply", () => {
  it("пропускает текст при revealAllowed", () => {
    const r = filterMentorReply("Ответ: 42", ["42"], true);
    expect(r.redacted).toBe(false);
    expect(r.text).toContain("42");
  });

  it("вырезает длинный эталон без reveal (INV-08)", () => {
    const r = filterMentorReply(
      "Значит правильный ответ — никогда, запомни.",
      ["нет", "никогда"],
      false,
    );
    expect(r.redacted).toBe(true);
    expect(r.text.toLowerCase()).not.toContain("никогда");
    expect(r.text).toContain("скрыто");
  });

  it("срезает вердикт «итоговый ответ … абсолютно верный» (REQ-MNT-03)", () => {
    const raw = [
      "Отличный ход мысли!",
      "А твой итоговый ответ нет — абсолютно верный!",
      "Подумай над крайним случаем.",
    ].join(" ");
    const r = filterMentorReply(raw, ["нет", "no"], false);
    expect(r.redacted).toBe(true);
    expect(r.text.toLowerCase()).not.toMatch(/абсолютно\s+верн/);
    expect(r.text.toLowerCase()).not.toMatch(/итоговый\s+ответ\s+нет/);
    expect(r.text).toMatch(/ход мысли|крайним/i);
  });

  it("не режет наводящее «верно ли…»", () => {
    const r = filterMentorReply(
      "Верно ли, что если все пришли вовремя, то «не все опоздали» тоже правда?",
      ["нет"],
      false,
    );
    expect(r.redacted).toBe(false);
    expect(r.text).toContain("Верно ли");
  });

  it("для number режет самостоятельный токен и cue (I5-01)", () => {
    const r = filterMentorReply(
      "Получается максимум таких ребят трое, то есть 3. Разбери 3 случая отдельно.",
      ["3"],
      false,
      "number",
    );
    expect(r.redacted).toBe(true);
    expect(r.text).not.toMatch(/(?<![\d.,])3(?![\d.,])/);
    expect(r.text).toContain("скрыто");
  });

  it("для да/нет ловит «получается нет» (I5-01)", () => {
    const r = filterMentorReply("У тебя получается нет.", ["нет"], false, "text");
    expect(r.redacted).toBe(true);
    expect(r.text.toLowerCase()).not.toMatch(/получается\s+нет/);
  });
});

describe("scrubForbiddenPii / INV-09", () => {
  it("вычищает имя из промпта без отказа", () => {
    const cleaned = scrubForbiddenPii(
      "Меня зовут Nikita, помоги с задачей",
      ["Nikita", "user_abc"],
    );
    expect(cleaned.toLowerCase()).not.toContain("nikita");
    expect(cleaned).toContain("помоги");
  });
});

describe("buildMentorUserPrompt / PII", () => {
  it("не включает login/имя и не содержит forbidden", () => {
    const prompt = buildMentorUserPrompt({
      taskTitle: "Тест",
      taskStatement: "Условие",
      relatedDocSlugs: ["t1-true-false"],
      relatedDocTitles: ["Истина и ложь"],
      recentAttempts: [{ submittedAnswer: "да", isCorrect: false }],
      hintsOpenedCount: 1,
      hintStepsTotal: 3,
      revealAllowed: false,
      history: [],
      userMessage: "Не понимаю",
    });
    expect(prompt).toContain("Условие");
    expect(prompt).toContain("slug:t1-true-false");
    expect(promptContainsForbiddenPii(prompt, ["nikita", "user_abc", "secret@mail"])).toBe(
      false,
    );
    expect(MENTOR_SYSTEM_PROMPT).toContain("наводящие");
  });
});

describe("buildFallbackReply", () => {
  it("объясняет отсутствие ключа и ссылается на ступени", () => {
    const text = buildFallbackReply({
      reason: "no_key",
      relatedDocs: [{ slug: "doc-1", title: "Статья" }],
      hintsOpenedCount: 0,
      hintStepsTotal: 3,
      visibleHintTexts: [],
    });
    expect(text).toMatch(/нет ключа|недоступен/i);
    expect(text).toContain("[Статья](slug:doc-1)");
    expect(text).toContain("Открыть подсказку");
  });

  it("для http подсказывает повторить / опору на контент, без env", () => {
    const text = buildFallbackReply({
      reason: "http",
      relatedDocs: [],
      hintsOpenedCount: 0,
      hintStepsTotal: 0,
      visibleHintTexts: [],
    });
    expect(text).toMatch(/не ответил|попробуй|подсказк/i);
    expect(text).not.toMatch(/GEMINI_|DEEPSEEK_|\.env/i);
  });

  it("для 503 объясняет перегрузку, а не модель", () => {
    const text = buildFallbackReply({
      reason: "http",
      httpDetail: "503",
      relatedDocs: [],
      hintsOpenedCount: 0,
      hintStepsTotal: 0,
      visibleHintTexts: [],
    });
    expect(text).toMatch(/перегружен/i);
    expect(text).not.toMatch(/GEMINI_MODEL/);
  });
});

describe("runMentorTurn", () => {
  it("при ok LLM фильтрует эталон", async () => {
    const llm: LlmClient = {
      generate: vi.fn().mockResolvedValue({
        ok: true,
        text: "Правильный ответ — никогда.",
      }),
    };
    const result = await runMentorTurn(
      {
        taskTitle: "T",
        taskStatement: "S",
        relatedDocSlugs: [],
        relatedDocTitles: [],
        relatedDocs: [],
        recentAttempts: [],
        hintsOpenedCount: 0,
        hintStepsTotal: 3,
        visibleHintTexts: [],
        revealAllowed: false,
        acceptedAnswers: ["нет", "никогда"],
        answerType: "text",
        history: [],
        userMessage: "Подскажи ответ",
      },
      llm,
    );
    expect(result.mode).toBe("llm");
    expect(result.body.toLowerCase()).not.toContain("никогда");
  });

  it("вычищает PII из промпта до LLM (I5-02)", async () => {
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      text: "Давай разберём условие шагами.",
    });
    const llm: LlmClient = { generate };
    await runMentorTurn(
      {
        taskTitle: "T",
        taskStatement: "S",
        relatedDocSlugs: [],
        relatedDocTitles: [],
        relatedDocs: [],
        recentAttempts: [],
        hintsOpenedCount: 0,
        hintStepsTotal: 3,
        visibleHintTexts: [],
        revealAllowed: false,
        acceptedAnswers: ["42"],
        answerType: "number",
        history: [],
        userMessage: "Меня зовут Nikita",
        piiForbidden: ["Nikita"],
      },
      llm,
    );
    const userArg = (generate.mock.calls[0] as [{ user: string }])[0].user;
    expect(userArg.toLowerCase()).not.toContain("nikita");
  });

  it("без ключа уходит в fallback", async () => {
    const llm: LlmClient = {
      generate: vi.fn().mockResolvedValue({ ok: false, reason: "no_key" }),
    };
    const result = await runMentorTurn(
      {
        taskTitle: "T",
        taskStatement: "S",
        relatedDocSlugs: ["a"],
        relatedDocTitles: ["A"],
        relatedDocs: [{ slug: "a", title: "A" }],
        recentAttempts: [],
        hintsOpenedCount: 1,
        hintStepsTotal: 3,
        visibleHintTexts: ["Первая ступень"],
        revealAllowed: false,
        acceptedAnswers: ["42"],
        history: [],
        userMessage: "Помоги",
      },
      llm,
    );
    expect(result.mode).toBe("fallback");
    expect(result.body).toMatch(/нет ключа|недоступен/i);
  });

  it("forceFallback не зовёт LLM (I13B-02)", async () => {
    const generate = vi.fn().mockResolvedValue({ ok: true, text: "не должен" });
    const llm: LlmClient = { generate };
    const result = await runMentorTurn(
      {
        taskTitle: "T",
        taskStatement: "S",
        relatedDocSlugs: [],
        relatedDocTitles: [],
        relatedDocs: [{ slug: "d", title: "D" }],
        recentAttempts: [],
        hintsOpenedCount: 0,
        hintStepsTotal: 2,
        visibleHintTexts: [],
        revealAllowed: false,
        acceptedAnswers: ["42"],
        history: [],
        userMessage: "Ещё вопрос",
        forceFallback: true,
        forceFallbackReason: "rate_limited",
      },
      llm,
    );
    expect(generate).not.toHaveBeenCalled();
    expect(result.mode).toBe("fallback");
    expect(result.body).toMatch(/хватит вопросов к ИИ/i);
  });
});

describe("buildMentorTopicUserPrompt / runMentorTopicTurn (REQ-MNT-01)", () => {
  it("промпт темы без эталонов и без условий задач", () => {
    const prompt = buildMentorTopicUserPrompt({
      topicTitle: "Логика",
      topicDescription: "Рассуждения",
      articleSlugs: ["t1-true-false"],
      articleTitles: ["Истина и ложь"],
      history: [],
      userMessage: "С чего начать?",
    });
    expect(prompt).toContain("Тема: Логика");
    expect(prompt).toContain("slug:t1-true-false");
    expect(prompt).toMatch(/чат по теме/i);
    expect(prompt.toLowerCase()).not.toContain("accepted");
    expect(prompt).not.toMatch(/эталон:\s*\[/i);
  });

  it("topic fallback без ступеней задачи", () => {
    const text = buildFallbackReply({
      reason: "rate_limited",
      relatedDocs: [{ slug: "a", title: "A" }],
      hintsOpenedCount: 0,
      hintStepsTotal: 0,
      visibleHintTexts: [],
      scope: "topic",
    });
    expect(text).toMatch(/по этой теме/i);
    expect(text).not.toMatch(/Открыть подсказку/);
  });

  it("topic turn фильтрует короткий канон второй задачи (BC-01)", async () => {
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      text: "Получается 3 — это ответ похожей задачи.",
    });
    const llm: LlmClient = { generate };
    const result = await runMentorTopicTurn(
      {
        topicTitle: "Логика",
        topicDescription: "Описание",
        articleSlugs: ["doc-a"],
        articleTitles: ["Doc A"],
        relatedDocs: [{ slug: "doc-a", title: "Doc A" }],
        // Первая задача — «нет»; вторая — число «3». Плоский leakDictionary потерял бы «3».
        topicAnswerGroups: [
          ["нет", "no"],
          ["3"],
        ],
        history: [],
        userMessage: "Подскажи ответ",
      },
      llm,
    );
    expect(result.mode).toBe("llm");
    expect(result.body).not.toMatch(/(?<![\d.,])3(?![\d.,])/);
    const userArg = (generate.mock.calls[0] as [{ user: string }])[0].user;
    expect(userArg).not.toContain("acceptedAnswers");
    expect(userArg.toLowerCase()).not.toContain("«3»");
  });

  it("filterMentorReplyForTaskGroups сохраняет каноны обеих задач", () => {
    const r = filterMentorReplyForTaskGroups(
      "Значит, нет — и получается 3.",
      [
        ["нет", "no"],
        ["3"],
      ],
      false,
      "topic",
    );
    expect(r.redacted).toBe(true);
    expect(r.text.toLowerCase()).not.toMatch(/значит,\s*нет/);
    expect(r.text).not.toMatch(/(?<![\d.,])3(?![\d.,])/);
    expect(r.text).not.toMatch(/кнопкой A|этой задачи/i);
    expect(r.text).toMatch(/задач банка|общий приём/i);
  });

  it("topic turn redact без кнопки A (BCF-01)", async () => {
    const llm: LlmClient = {
      generate: vi.fn().mockResolvedValue({
        ok: true,
        text: "Правильный ответ — никогда.",
      }),
    };
    const result = await runMentorTopicTurn(
      {
        topicTitle: "Логика",
        topicDescription: "Описание",
        articleSlugs: [],
        articleTitles: [],
        relatedDocs: [],
        topicAnswerGroups: [["нет", "никогда"]],
        history: [],
        userMessage: "Ответ?",
      },
      llm,
    );
    expect(result.body).not.toMatch(/кнопкой A|этой задачи/i);
    expect(result.body).toMatch(/задач банка|общий приём|статьям темы/i);
  });

  it("topic HTTP 503 fallback без ступеней задачи (BC-04)", () => {
    const text = buildFallbackReply({
      reason: "http",
      httpDetail: "503",
      relatedDocs: [{ slug: "a", title: "A" }],
      hintsOpenedCount: 0,
      hintStepsTotal: 0,
      visibleHintTexts: [],
      scope: "topic",
    });
    expect(text).toMatch(/перегружен/i);
    expect(text).toMatch(/статьи темы/i);
    expect(text).not.toMatch(/ступень|подсказк/i);
    expect(text).not.toMatch(/в условии/);
  });

  it("topic forceFallback не зовёт LLM (I13B-02)", async () => {
    const generate = vi.fn().mockResolvedValue({ ok: true, text: "не должен" });
    const llm: LlmClient = { generate };
    const result = await runMentorTopicTurn(
      {
        topicTitle: "Логика",
        topicDescription: "Описание",
        articleSlugs: ["doc-a"],
        articleTitles: ["Doc A"],
        relatedDocs: [{ slug: "doc-a", title: "Doc A" }],
        topicAnswerGroups: [["нет"]],
        history: [],
        userMessage: "Ещё",
        forceFallback: true,
        forceFallbackReason: "rate_limited",
      },
      llm,
    );
    expect(generate).not.toHaveBeenCalled();
    expect(result.mode).toBe("fallback");
    expect(result.body).toMatch(/по этой теме/i);
  });
});
