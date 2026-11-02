/**
 * Unit: парсинг и валидация LLM-черновиков instance (12b) — без live Gemini.
 */
import { describe, expect, it } from "vitest";
import {
  buildInstanceDraftPrompt,
  extractJsonPayload,
  parseInstanceDraftJson,
  validateInstanceDraftsAgainstTask,
} from "./instance-draft";
import type { InstanceDraftCanon } from "./instance-draft";

const canon: InstanceDraftCanon = {
  slug: "t1-demo",
  title: "Демо",
  statement: "Сумма двух нечётных — чётная. Истинно или ложно?",
  acceptedAnswers: ["истинно", "истина"],
  answerType: "text",
  difficulty: "5",
  grade: "low",
  relatedDocSlugs: ["t1-parity", "t1-true-false"],
  hintSteps: [
    { text: "Возьми 1 и 3", docSlug: "t1-parity" },
    { text: "Посмотри чётность суммы" },
    { text: "Сравни с утверждением", docSlug: "t1-true-false" },
  ],
  sourceHint: "original · test",
};

const goodInstances = [
  {
    slug: "i0",
    order: 0,
    statement: "Сумма 5 и 7 чётная. Истинно или ложно?",
    acceptedAnswers: ["истинно"],
    hintSteps: [
      { text: "Сложи 5 и 7", docSlug: "t1-parity" },
      { text: "Чётное или нет?" },
      { text: "Сравни с фразой", docSlug: "t1-true-false" },
    ],
  },
  {
    slug: "i1",
    order: 1,
    statement: "Сумма 9 и 11 чётная. Истинно или ложно?",
    acceptedAnswers: ["истинно"],
    hintSteps: [
      { text: "Пример с другими нечётными", docSlug: "t1-parity" },
      { text: "Какая чётность?" },
      { text: "Вывод по утверждению" },
    ],
  },
  {
    slug: "i2",
    order: 2,
    statement: "Сумма 3 и 8 чётная. Истинно или ложно?",
    acceptedAnswers: ["ложно"],
    hintSteps: [
      { text: "Одно чётное — что с суммой?", docSlug: "t1-parity" },
      { text: "Посчитай 3+8" },
      { text: "Совпадает ли с «чётная»?" },
    ],
  },
];

describe("buildInstanceDraftPrompt", () => {
  it("просит ≥3 и перечисляет relatedDocSlugs", () => {
    const { system, user } = buildInstanceDraftPrompt({ task: canon, count: 3 });
    expect(system).toMatch(/ИЗОМОРФ/i);
    expect(user).toContain("t1-parity");
    expect(user).toContain("ровно 3");
  });
});

describe("extractJsonPayload / parseInstanceDraftJson", () => {
  it("достаёт массив из fence", () => {
    const raw = "Вот:\n```json\n" + JSON.stringify(goodInstances) + "\n```\nготово";
    expect(extractJsonPayload(raw).startsWith("[")).toBe(true);
    const r = parseInstanceDraftJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.instances).toHaveLength(3);
  });

  it("принимает обёртку { instances }", () => {
    const r = parseInstanceDraftJson(JSON.stringify({ instances: goodInstances }));
    expect(r.ok).toBe(true);
  });

  it("отклоняет <3 элементов", () => {
    const r = parseInstanceDraftJson(JSON.stringify(goodInstances.slice(0, 2)));
    expect(r.ok).toBe(false);
  });

  it("отклоняет битый JSON", () => {
    expect(parseInstanceDraftJson("не json").ok).toBe(false);
  });
});

describe("validateInstanceDraftsAgainstTask", () => {
  it("принимает корректный пул", () => {
    const r = validateInstanceDraftsAgainstTask(canon, goodInstances);
    expect(r.ok).toBe(true);
  });

  it("ловит утечку эталона в подсказке", () => {
    const bad = structuredClone(goodInstances);
    bad[0]!.hintSteps[0]!.text = "Ответ: истинно";
    const r = validateInstanceDraftsAgainstTask(canon, bad);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "INSTANCE_HINT_LEAK")).toBe(true);
  });

  it("ловит дубли slug", () => {
    const bad = structuredClone(goodInstances);
    bad[1]!.slug = "i0";
    const r = validateInstanceDraftsAgainstTask(canon, bad);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "INSTANCE_SLUG_DUP")).toBe(true);
  });
});
