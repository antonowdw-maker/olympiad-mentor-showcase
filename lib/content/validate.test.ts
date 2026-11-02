/**
 * Unit: валидация контента T1 (поведение, INV-02 / REQ-CNT-*).
 * Политика коротких ответов: только шаблоны «ответ/значит/итог» (вариант A).
 */
import { describe, expect, it } from "vitest";
import { DEMO_TOPICS } from "../../content/seed/demo-topics";
import { shouldOfferReinforce } from "@/lib/trainer/hints";
import type { TopicSeed, TaskSeed } from "./schemas";
import {
  leakDictionary,
  leakDictionaryFromTaskGroups,
  textLeaksAnswer,
  taskHintsAreSafe,
  titleNumbersMissingInStatement,
  validateTopicContent,
} from "./validate";

const t2ParitySeed = DEMO_TOPICS[0]!;
const t5AlgorithmsSeed = DEMO_TOPICS[1]!;

const THREE_HINTS = [
  { text: "Подумай ещё раз", docSlug: "doc-1" },
  { text: "Разбери случаи", docSlug: "doc-1" },
  { text: "Сверь с определением", docSlug: "doc-1" },
];

function baseTopic(overrides?: Partial<TopicSeed>): TopicSeed {
  const articles = Array.from({ length: 5 }, (_, i) => ({
    slug: `doc-${i + 1}`,
    title: `Статья ${i + 1}`,
    body: `Текст статьи ${i + 1}`,
    order: i + 1,
  }));

  const tasks: TaskSeed[] = Array.from({ length: 15 }, (_, i) => ({
    slug: `task-${i + 1}`,
    title: `Задача ${i + 1}`,
    statement: `Условие ${i + 1}`,
    acceptedAnswers: [`ответ${i + 1}`],
    answerType: "text" as const,
    difficulty: "5" as const,
    grade: "low" as const,
    order: i + 1,
    relatedDocSlugs: ["doc-1"],
    hintSteps: THREE_HINTS,
    sourceHint: "original · test",
  }));

  return {
    slug: "t-test",
    title: "Тест",
    description: "Описание",
    order: 1,
    classLevels: ["5"],
    articles,
    tasks,
    ...overrides,
  };
}

/** Патч одной задачи без двойного вызова baseTopic. */
function withTask(index: number, patch: Partial<TaskSeed>): TopicSeed {
  const topic = baseTopic();
  const tasks = topic.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t));
  return { ...topic, tasks };
}

describe("textLeaksAnswer", () => {
  it("не считает отдельное «нет» в обычной фразе утечкой (политика A)", () => {
    expect(textLeaksAnswer("Здесь нет противоречия", ["нет", "no"])).toBe(false);
  });

  it("ловит короткий ответ в шаблоне «ответ на похожую:»", () => {
    expect(textLeaksAnswer("Ответ на похожую: нет, не следует", ["нет", "no"])).toBe(true);
  });

  it("ловит «значит, нет» с правой границей", () => {
    expect(textLeaksAnswer("Значит, нет — дождь не шёл", ["нет"])).toBe(true);
  });

  it("ловит «получается нет» (расширенные cue I5-01)", () => {
    expect(textLeaksAnswer("У тебя получается нет", ["нет"])).toBe(true);
  });

  it("не ловит голую цифру без cue в контенте («разбери 3 случая»)", () => {
    expect(textLeaksAnswer("Разбери 3 случая", ["3"])).toBe(false);
    expect(textLeaksAnswer("Значит, 3", ["3"])).toBe(true);
  });

  it("не ловит «Значит, дальше…» (U-03)", () => {
    expect(textLeaksAnswer("Значит, дальше проверь условие", ["да"])).toBe(false);
  });

  it("ловит однобуквенный кириллический ответ (U-04)", () => {
    expect(textLeaksAnswer("Ответ: б", ["б", "b"])).toBe(true);
    expect(textLeaksAnswer("Ответ: А.", ["а"])).toBe(true);
  });

  it("ловит длинный эталон как целое слово", () => {
    expect(textLeaksAnswer("Он точно лжец в этом случае", ["лжец"])).toBe(true);
  });

  it("не ловит «лжец» внутри «лжецы» (граница слова)", () => {
    expect(textLeaksAnswer("Там одни лжецы", ["лжец"])).toBe(false);
  });

  it("длинный эталон (>6) через includes: «истинности» содержит «истинно»", () => {
    expect(textLeaksAnswer("Проверь истинности утверждения", ["истинно"])).toBe(true);
  });

  it("ловит падежные формы «первый»/«второй» (WG-10)", () => {
    expect(textLeaksAnswer("позиция для первого", ["первый"])).toBe(true);
    expect(textLeaksAnswer("ходит сейчас первым", ["первый"])).toBe(true);
    expect(textLeaksAnswer("ответ второго игрока", ["второй"])).toBe(true);
  });

  it("не ловит чужие корни вместо «первый»/«второй»", () => {
    expect(textLeaksAnswer("Сделай перебор случаев", ["первый"])).toBe(false);
    expect(textLeaksAnswer("Это вторично для задачи", ["второй"])).toBe(false);
  });
});

describe("leakDictionary", () => {
  it("канон + длинные синонимы (>6), короткие синонимы отбрасывает", () => {
    expect(leakDictionary(["нет", "no", "никогда"])).toEqual(["нет", "никогда"]);
    expect(leakDictionary(["истинно", "истина", "верно", "true"])).toEqual(["истинно"]);
  });

  it("leakDictionaryFromTaskGroups сохраняет короткий канон каждой задачи (BC-01)", () => {
    expect(
      leakDictionaryFromTaskGroups([
        ["нет", "no"],
        ["3"],
        ["артём", "артем"],
      ]),
    ).toEqual(["нет", "3", "артём"]);
  });
});

describe("validateTopicContent", () => {
  it("принимает сид T2 чётность: только 5-6/6 (W-B + M6-O1 + M6-A11)", () => {
    const result = validateTopicContent(t2ParitySeed, { minArticles: 5, minTasks: 15 });
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => (i.severity ?? "error") === "error")).toEqual([]);
    expect(result.data?.articles).toHaveLength(8);
    expect(result.data?.tasks).toHaveLength(23);
    expect(t2ParitySeed.classLevels.every((c) => c === "5-6" || c === "6")).toBe(true);
    for (const t of t2ParitySeed.tasks) {
      expect(["5-6", "6"]).toContain(t.difficulty);
      expect(["low", "mid", "high"]).toContain(t.grade);
      expect(t.hintSteps.length).toBeGreaterThanOrEqual(3);
      expect(t.sourceHint?.trim().length).toBeGreaterThan(0);
      expect(t.instances?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("принимает сид T5 алгоритмы: только 5-6/6 (W-E + S6-D/C + O1 + O12 + M6-A8…A11 + A13)", () => {
    const result = validateTopicContent(t5AlgorithmsSeed, { minArticles: 5, minTasks: 15 });
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => (i.severity ?? "error") === "error")).toEqual([]);
    expect(result.data?.articles).toHaveLength(8);
    expect(result.data?.tasks).toHaveLength(21);
    expect(t5AlgorithmsSeed.classLevels.every((c) => c === "5-6" || c === "6")).toBe(true);
    for (const t of t5AlgorithmsSeed.tasks) {
      expect(["5-6", "6"]).toContain(t.difficulty);
      expect(["low", "mid", "high"]).toContain(t.grade);
      expect(t.hintSteps.length).toBeGreaterThanOrEqual(3);
      expect(t.sourceHint?.trim().length).toBeGreaterThan(0);
      expect(t.instances?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("warn SIMILAR_HARDER если закрепляющая сложнее исходной", () => {
    const topic = baseTopic();
    const tasks = topic.tasks.map((t, i) => {
      if (i === 0) return { ...t, grade: "low" as const, similarTaskSlug: "task-2" };
      if (i === 1) return { ...t, grade: "high" as const };
      return t;
    });
    const result = validateTopicContent({ ...topic, tasks });
    expect(result.ok).toBe(true);
    expect(result.issues.some((x) => x.code === "SIMILAR_HARDER")).toBe(true);
  });

  it("не возвращает data при ошибках (W-09)", () => {
    const result = validateTopicContent(withTask(0, { relatedDocSlugs: ["missing-doc"] }));
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.issues.some((x) => x.code === "MISSING_DOC")).toBe(true);
  });

  it("запрещает reserved slug темы gather/mixed (I13A-R2-05)", () => {
    const topic = baseTopic();
    for (const slug of ["gather", "mixed"]) {
      const result = validateTopicContent({ ...topic, slug });
      expect(result.ok).toBe(false);
      expect(result.issues.some((x) => x.code === "RESERVED_TOPIC_SLUG")).toBe(true);
    }
  });

  it("ломается на HINT_LEAK при «ответ: нет»", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["нет", "no"],
        hintSteps: [
          { text: "Ответ: нет — не открывай сразу" },
          { text: "2" },
          { text: "3" },
        ],
      }),
    );
    expect(result.issues.some((x) => x.code === "HINT_LEAK")).toBe(true);
  });

  it("ловит длинный синоним в подсказке (WA-05)", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["нет", "никогда"],
        hintSteps: [
          { text: "Такой случай никогда не бывает" },
          { text: "2" },
          { text: "3" },
        ],
      }),
    );
    expect(result.issues.some((x) => x.code === "HINT_LEAK")).toBe(true);
  });

  it("не считает HINT_LEAK фразу «здесь нет противоречия»", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["нет", "no"],
        hintSteps: [
          { text: "Здесь нет противоречия — разбери случаи" },
          { text: "2" },
          { text: "3" },
        ],
      }),
    );
    expect(result.issues.some((x) => x.code === "HINT_LEAK")).toBe(false);
  });

  it("ломается на WORKED_EXAMPLE_LEAK", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["нет"],
        workedExample: "Ответ на похожую: нет",
      }),
    );
    expect(result.issues.some((x) => x.code === "WORKED_EXAMPLE_LEAK")).toBe(true);
  });

  it("синоним «верно» в подсказке не утечка, если канон — «истинно» (U-05)", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["истинно", "истина", "верно", "true"],
        hintSteps: [
          { text: "Проверь, верно ли утверждение на примере" },
          { text: "2" },
          { text: "3" },
        ],
      }),
    );
    expect(result.issues.some((x) => x.code === "HINT_LEAK")).toBe(false);
  });

  it("требует options для choice и ответ ∈ options", () => {
    expect(
      validateTopicContent(
        withTask(0, { answerType: "choice", acceptedAnswers: ["б"], options: undefined }),
      ).issues.some((x) => x.code === "CHOICE_OPTIONS"),
    ).toBe(true);

    expect(
      validateTopicContent(
        withTask(0, {
          answerType: "choice",
          acceptedAnswers: ["г"],
          options: ["а", "б", "в"],
        }),
      ).issues.some((x) => x.code === "CHOICE_ANSWER_NOT_IN_OPTIONS"),
    ).toBe(true);
  });

  it("запрещает дубли а/a б/b в options (UI)", () => {
    expect(
      validateTopicContent(
        withTask(0, {
          answerType: "choice",
          acceptedAnswers: ["б"],
          options: ["а", "б", "в", "a", "b", "c"],
        }),
      ).issues.some((x) => x.code === "CHOICE_OPTIONS_LATIN_DUP"),
    ).toBe(true);
  });

  it("требует числовые acceptedAnswers для number", () => {
    const result = validateTopicContent(
      withTask(0, { answerType: "number", acceptedAnswers: ["два"] }),
    );
    expect(result.issues.some((x) => x.code === "ANSWER_TYPE_MISMATCH")).toBe(true);
  });

  it("ловит дубли slug задач", () => {
    const topic = baseTopic();
    const tasks = [...topic.tasks];
    tasks[1] = { ...tasks[1], slug: tasks[0].slug };
    expect(validateTopicContent({ ...topic, tasks }).issues.some((x) => x.code === "DUPLICATE_SLUG")).toBe(
      true,
    );
  });

  it("ловит DUPLICATE_ANSWER", () => {
    const result = validateTopicContent(
      withTask(0, { acceptedAnswers: ["нет", "Нет"] }),
    );
    expect(result.issues.some((x) => x.code === "DUPLICATE_ANSWER")).toBe(true);
  });

  it("ловит MISSING_HINT_DOC", () => {
    const result = validateTopicContent(
      withTask(0, {
        hintSteps: [
          { text: "Смотри док", docSlug: "no-doc" },
          { text: "2" },
          { text: "3" },
        ],
      }),
    );
    expect(result.issues.some((x) => x.code === "MISSING_HINT_DOC")).toBe(true);
  });

  it("HINT_STEPS_MIN при <3 ступенях (WA-03)", () => {
    const result = validateTopicContent(
      withTask(0, { hintSteps: [{ text: "Одна ступень" }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "HINT_STEPS_MIN")).toBe(true);
  });

  it("MISSING_SOURCE_HINT без sourceHint (WA-03)", () => {
    const result = validateTopicContent(
      withTask(0, { sourceHint: undefined }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "MISSING_SOURCE_HINT")).toBe(true);
  });

  it("ловит missing similarTaskSlug", () => {
    const result = validateTopicContent(
      withTask(0, {
        similarTaskSlug: "no-such-task",
        hintSteps: [{ text: "1" }, { text: "2" }, { text: "3" }],
      }),
    );
    expect(result.issues.some((x) => x.code === "MISSING_SIMILAR")).toBe(true);
  });

  it("SCHEMA: пустой acceptedAnswers → ok=false без data", () => {
    const topic = withTask(0, { acceptedAnswers: [] as unknown as string[] });
    const raw = JSON.parse(JSON.stringify(topic));
    raw.tasks[0].acceptedAnswers = [];
    const result = validateTopicContent(raw);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.issues.some((x) => x.code === "SCHEMA")).toBe(true);
  });

  it("ARTICLE_COUNT при minArticles=5 и 4 статьях", () => {
    const topic = baseTopic();
    topic.articles = topic.articles.slice(0, 4);
    const result = validateTopicContent(topic, { minArticles: 5, minTasks: 3 });
    expect(result.issues.some((x) => x.code === "ARTICLE_COUNT")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("TASK_COUNT при minTasks=15 и 14 задачах", () => {
    const topic = baseTopic();
    topic.tasks = topic.tasks.slice(0, 14);
    const result = validateTopicContent(topic, { minArticles: 1, minTasks: 15 });
    expect(result.issues.some((x) => x.code === "TASK_COUNT")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("малый объём темы ок с дефолтными минимумами (WA-04)", () => {
    const topic = baseTopic({
      articles: baseTopic().articles.slice(0, 1),
      tasks: baseTopic().tasks.slice(0, 3),
    });
    const result = validateTopicContent(topic);
    expect(result.ok).toBe(true);
  });

  it("TASK_COUNT_LARGE — warn, ok остаётся true (WA-04)", () => {
    const topic = baseTopic();
    const extra = Array.from({ length: 26 }, (_, i) => ({
      ...topic.tasks[0],
      slug: `extra-${i}`,
      order: 100 + i,
    }));
    const result = validateTopicContent({ ...topic, tasks: [...topic.tasks, ...extra] });
    expect(result.issues.some((x) => x.code === "TASK_COUNT_LARGE" && x.severity === "warn")).toBe(
      true,
    );
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("HINT_DOC_UNRELATED — docSlug канона вне relatedDocSlugs (warn, не валит)", () => {
    const result = validateTopicContent(
      withTask(0, {
        relatedDocSlugs: ["doc-1"],
        hintSteps: [
          { text: "Шаг 1", docSlug: "doc-1" },
          { text: "Шаг 2", docSlug: "doc-2" },
          { text: "Шаг 3", docSlug: "doc-1" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(
      result.issues.some((x) => x.code === "HINT_DOC_UNRELATED" && x.severity === "warn"),
    ).toBe(true);
  });

  it("INSTANCE_HINT_DOC_UNRELATED — docSlug instance вне relatedDocSlugs", () => {
    const result = validateTopicContent(
      withTask(0, {
        relatedDocSlugs: ["doc-1"],
        instances: [
          {
            slug: "i0",
            order: 0,
            statement: "Условие i0",
            acceptedAnswers: ["ответ1"],
            hintSteps: [
              { text: "a", docSlug: "doc-1" },
              { text: "b", docSlug: "doc-2" },
              { text: "c", docSlug: "doc-1" },
            ],
          },
          {
            slug: "i1",
            order: 1,
            statement: "Условие i1",
            acceptedAnswers: ["ответ1"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Условие i2",
            acceptedAnswers: ["ответ1"],
            hintSteps: THREE_HINTS,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "INSTANCE_HINT_DOC_UNRELATED")).toBe(true);
  });

  it("INSTANCE_CHOICE_ANSWER — эталон instance вне options", () => {
    const result = validateTopicContent(
      withTask(0, {
        answerType: "choice",
        options: ["а", "б", "в"],
        acceptedAnswers: ["б"],
        instances: [
          {
            slug: "i0",
            order: 0,
            statement: "Выбор",
            acceptedAnswers: ["г"],
            options: ["а", "б", "в"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i1",
            order: 1,
            statement: "Выбор 2",
            acceptedAnswers: ["а"],
            options: ["а", "б", "в"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Выбор 3",
            acceptedAnswers: ["в"],
            options: ["а", "б", "в"],
            hintSteps: THREE_HINTS,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "INSTANCE_CHOICE_ANSWER")).toBe(true);
  });

  it("INSTANCE_CHOICE_OPTIONS — нет options ни у task, ни у instance", () => {
    const result = validateTopicContent(
      withTask(0, {
        answerType: "choice",
        options: undefined,
        acceptedAnswers: ["б"],
        instances: [
          {
            slug: "i0",
            order: 0,
            statement: "Выбор",
            acceptedAnswers: ["б"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i1",
            order: 1,
            statement: "Выбор 2",
            acceptedAnswers: ["а"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Выбор 3",
            acceptedAnswers: ["в"],
            hintSteps: THREE_HINTS,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "INSTANCE_CHOICE_OPTIONS")).toBe(true);
  });

  it("INSTANCE_CHOICE_OPTIONS_LATIN_DUP — a и а вместе в instance options", () => {
    const result = validateTopicContent(
      withTask(0, {
        answerType: "choice",
        options: ["а", "б", "в"],
        acceptedAnswers: ["б"],
        instances: [
          {
            slug: "i0",
            order: 0,
            statement: "Выбор",
            acceptedAnswers: ["а"],
            options: ["а", "a", "б"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i1",
            order: 1,
            statement: "Выбор 2",
            acceptedAnswers: ["б"],
            options: ["а", "б", "в"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Выбор 3",
            acceptedAnswers: ["в"],
            options: ["а", "б", "в"],
            hintSteps: THREE_HINTS,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((x) => x.code === "INSTANCE_CHOICE_OPTIONS_LATIN_DUP")).toBe(
      true,
    );
  });

  it("warn INSTANCE_ANSWER_MONOTONE если у всех instance один главный эталон", () => {
    const result = validateTopicContent(
      withTask(0, {
        acceptedAnswers: ["нет"],
        instances: [
          {
            slug: "i0",
            order: 0,
            statement: "Условие 1 (а)",
            acceptedAnswers: ["нет", "no"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i1",
            order: 1,
            statement: "Условие 1 (б)",
            acceptedAnswers: ["нет"],
            hintSteps: THREE_HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Условие 1 (в)",
            acceptedAnswers: ["нет", "no"],
            hintSteps: THREE_HINTS,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(
      result.issues.some(
        (x) => x.code === "INSTANCE_ANSWER_MONOTONE" && x.severity === "warn",
      ),
    ).toBe(true);
  });
});

describe("taskHintsAreSafe", () => {
  it("true если подсказки без эталона", () => {
    expect(
      taskHintsAreSafe({
        slug: "x",
        title: "x",
        statement: "s",
        acceptedAnswers: ["нет"],
        answerType: "text",
        difficulty: "5",
        grade: "low",
        order: 1,
        relatedDocSlugs: ["d"],
        hintSteps: [{ text: "Подумай про кванторы" }],
        sourceHint: "original · test",
      }),
    ).toBe(true);
  });

  it("false если подсказка спойлерит шаблоном", () => {
    expect(
      taskHintsAreSafe({
        slug: "x",
        title: "x",
        statement: "s",
        acceptedAnswers: ["нет"],
        answerType: "text",
        difficulty: "5",
        grade: "low",
        order: 1,
        relatedDocSlugs: ["d"],
        hintSteps: [{ text: "Итог: нет" }],
        sourceHint: "original · test",
      }),
    ).toBe(false);
  });
});

describe("INSTANCE_TITLE_MISMATCH — название варианта vs условие", () => {
  const inst = (slug: string, order: number, statement: string, title?: string) => ({
    slug,
    order,
    statement,
    ...(title ? { title } : {}),
    acceptedAnswers: [`о${order}`],
    hintSteps: THREE_HINTS,
  });

  it("titleNumbersMissingInStatement: отдельные числа, не части других", () => {
    expect(titleNumbersMissingInStatement("Разрезать 3×4 поровну?", "прямоугольник 4×5")).toEqual([
      "3",
    ]);
    expect(titleNumbersMissingInStatement("Ребус 17", "82+93=175")).toEqual(["17"]);
    expect(titleNumbersMissingInStatement("Кучи 5 и 3", "Кучи 5 и 3, ход")).toEqual([]);
    expect(titleNumbersMissingInStatement("Без чисел", "что угодно")).toEqual([]);
  });

  it("вариант с другими числами без своего title → error", () => {
    const topic = withTask(0, {
      title: "Разрезать 3×4 поровну?",
      statement: "Прямоугольник 3×4",
      instances: [
        inst("i0", 0, "Прямоугольник 3×4"),
        inst("i1", 1, "Прямоугольник 4×5"),
        inst("i2", 2, "Прямоугольник 3×4, другие площади"),
      ],
    });
    const r = validateTopicContent(topic, { minArticles: 1, minTasks: 15 });
    const hits = r.issues.filter((i) => i.code === "INSTANCE_TITLE_MISMATCH");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.path).toContain("instances.i1");
    expect(hits[0]!.severity).toBe("error");
  });

  it("свой title, согласованный с условием, → без ошибки; несогласованный → error", () => {
    const ok = withTask(0, {
      title: "Разрезать 3×4 поровну?",
      statement: "Прямоугольник 3×4",
      instances: [
        inst("i0", 0, "Прямоугольник 3×4"),
        inst("i1", 1, "Прямоугольник 4×5", "Разрезать 4×5 поровну?"),
        inst("i2", 2, "Прямоугольник 2×6", "Разрезать 2×6 поровну?"),
      ],
    });
    expect(
      validateTopicContent(ok, { minArticles: 1, minTasks: 15 }).issues.some(
        (i) => i.code === "INSTANCE_TITLE_MISMATCH",
      ),
    ).toBe(false);

    const bad = withTask(0, {
      title: "Разрезать 3×4 поровну?",
      statement: "Прямоугольник 3×4",
      instances: [
        inst("i0", 0, "Прямоугольник 3×4"),
        inst("i1", 1, "Прямоугольник 4×5", "Разрезать 5×6 поровну?"),
        inst("i2", 2, "Прямоугольник 2×6", "Разрезать 2×6 поровну?"),
      ],
    });
    expect(
      validateTopicContent(bad, { minArticles: 1, minTasks: 15 }).issues.filter(
        (i) => i.code === "INSTANCE_TITLE_MISMATCH",
      ),
    ).toHaveLength(1);
  });

});
