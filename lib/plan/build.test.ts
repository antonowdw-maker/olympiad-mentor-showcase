/**
 * Unit: сборка пакета плана дня (REQ-PLN-*, 10b грейд).
 */
import { describe, expect, it } from "vitest";
import {
  DAY_PLAN_BUDGET_MIN,
  MAX_TASKS_PER_PACKAGE,
  allOfferedTasksSolved,
  buildDayPlanPackage,
  buildTestDayPlanPackage,
  canRequestNewPackage,
  collectOfferedTaskSlugs,
  countAvailableTasks,
  countAvailableTestTasks,
  estMinutesForGrade,
  resolveCurrentPackage,
  type PlanTaskCandidate,
} from "./build";
import { calendarDateInTz } from "./date";

const articles = [
  { slug: "doc-a", title: "Статья A", order: 1, topicSlug: "t1" },
  { slug: "doc-b", title: "Статья B", order: 2, topicSlug: "t1" },
  { slug: "doc-c", title: "Статья C", order: 3, topicSlug: "t1" },
];

const tasks: PlanTaskCandidate[] = [
  { slug: "t1", title: "Задача 1", order: 1, cluster: "doc-a", grade: "high", topicSlug: "t1" },
  { slug: "t2", title: "Задача 2", order: 2, cluster: "doc-a", grade: "mid", topicSlug: "t1" },
  { slug: "t3", title: "Задача 3", order: 3, cluster: "doc-b", grade: "low", topicSlug: "t1" },
  { slug: "t4", title: "Задача 4", order: 4, cluster: "doc-c", grade: "high", topicSlug: "t1" },
  { slug: "t5", title: "Задача 5", order: 5, cluster: "doc-b", grade: "mid", topicSlug: "t1" },
  { slug: "t6", title: "Задача 6", order: 6, cluster: "doc-c", grade: "low", topicSlug: "t1" },
  { slug: "t7", title: "Задача 7", order: 7, cluster: "doc-a", grade: "mid", topicSlug: "t1" },
  { slug: "t8", title: "Задача 8", order: 8, cluster: "doc-b", grade: "high", topicSlug: "t1" },
  { slug: "t9", title: "Задача 9", order: 9, cluster: "doc-c", grade: "mid", topicSlug: "t1" },
  { slug: "t10", title: "Задача 10", order: 10, cluster: "doc-a", grade: "low", topicSlug: "t1" },
];

describe("estMinutesForGrade", () => {
  it("низкий / средний / высокий → 2 / 6 / 12", () => {
    expect(estMinutesForGrade("low")).toBe(2);
    expect(estMinutesForGrade("mid")).toBe(6);
    expect(estMinutesForGrade("high")).toBe(12);
  });
});

describe("buildDayPlanPackage", () => {
  it("не включает решённые и уже предложенные задачи", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(["t1"]),
      offeredTaskSlugs: new Set(["t3"]),
    });
    const taskSlugs = r.items.filter((i) => i.kind === "task").map((i) => i.slug);
    expect(taskSlugs).not.toContain("t1");
    expect(taskSlugs).not.toContain("t3");
    expect(r.status).toBe("normal");
  });

  it("ориентир ≥ budgetMin, если банк позволяет за ≤ maxTasks", () => {
    const heavies: PlanTaskCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      slug: `h${i + 1}`,
      title: `Тяжёлая ${i + 1}`,
      order: i + 1,
      cluster: `doc-${(i % 3) + 1}`,
      grade: "high" as const,
      topicSlug: "t1",
    }));
    const r = buildDayPlanPackage({
      tasks: heavies,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      budgetMin: DAY_PLAN_BUDGET_MIN,
    });
    const taskItems = r.items.filter((i) => i.kind === "task");
    const taskMin = taskItems.reduce((s, i) => s + i.estMinutes, 0);
    expect(taskItems.length).toBeLessThanOrEqual(MAX_TASKS_PER_PACKAGE);
    expect(taskMin).toBeGreaterThanOrEqual(DAY_PLAN_BUDGET_MIN);
  });

  it("не превышает потолок задач даже при банке из low (G-01)", () => {
    const lows: PlanTaskCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      slug: `l${i + 1}`,
      title: `Лёгкая ${i + 1}`,
      order: i + 1,
      cluster: `doc-${(i % 3) + 1}`,
      grade: "low" as const,
      topicSlug: "t1",
    }));
    const r = buildDayPlanPackage({
      tasks: lows,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      budgetMin: DAY_PLAN_BUDGET_MIN,
    });
    const taskItems = r.items.filter((i) => i.kind === "task");
    expect(taskItems.length).toBe(MAX_TASKS_PER_PACKAGE);
    expect(taskItems.length).toBeLessThanOrEqual(MAX_TASKS_PER_PACKAGE);
  });

  it("ставит estMinutes задачи по грейду", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      budgetMin: 12,
    });
    for (const item of r.items.filter((i) => i.kind === "task")) {
      const cand = tasks.find((t) => t.slug === item.slug)!;
      expect(item.estMinutes).toBe(estMinutesForGrade(cand.grade));
      expect(item.grade).toBe(cand.grade);
    }
  });

  it("разнообразит кластеры в начале набора", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      budgetMin: 30,
    });
    const taskSlugs = r.items.filter((i) => i.kind === "task").map((i) => i.slug);
    const clusters = taskSlugs.map((s) => tasks.find((t) => t.slug === s)!.cluster);
    expect(new Set(clusters).size).toBeGreaterThanOrEqual(2);
  });

  it("микширует грейды, пока банк позволяет", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      budgetMin: 40,
    });
    const grades = r.items
      .filter((i) => i.kind === "task")
      .map((i) => i.grade)
      .filter(Boolean);
    expect(new Set(grades).size).toBeGreaterThanOrEqual(2);
  });

  it("обычный смешанный банк: ≤ maxTasks и есть микс грейдов", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
    });
    const taskItems = r.items.filter((i) => i.kind === "task");
    expect(taskItems.length).toBeGreaterThan(0);
    expect(taskItems.length).toBeLessThanOrEqual(MAX_TASKS_PER_PACKAGE);
    expect(new Set(taskItems.map((i) => i.grade)).size).toBeGreaterThanOrEqual(2);
  });

  it("на свежей теме предпочитает лёгкие задачи, а не high первыми (WC-04)", () => {
    const bank: PlanTaskCandidate[] = [
      { slug: "h1", title: "H1", order: 1, cluster: "doc-a", grade: "high", topicSlug: "t1" },
      { slug: "m1", title: "M1", order: 2, cluster: "doc-b", grade: "mid", topicSlug: "t1" },
      { slug: "l1", title: "L1", order: 3, cluster: "doc-c", grade: "low", topicSlug: "t1" },
      { slug: "h2", title: "H2", order: 4, cluster: "doc-a", grade: "high", topicSlug: "t1" },
      { slug: "m2", title: "M2", order: 5, cluster: "doc-b", grade: "mid", topicSlug: "t1" },
      { slug: "l2", title: "L2", order: 6, cluster: "doc-c", grade: "low", topicSlug: "t1" },
    ];
    const r = buildDayPlanPackage({
      tasks: bank,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      maxTasks: 3,
      budgetMin: 100,
    });
    const first = r.items.find((i) => i.kind === "task");
    expect(first?.grade).toBe("low");
  });

  it("theme_closed: все решены → статьи повторения", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(tasks.map((t) => t.slug)),
      offeredTaskSlugs: new Set(),
    });
    expect(r.status).toBe("theme_closed");
    expect(r.items.every((i) => i.kind === "article")).toBe(true);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
  });

  it("caught_up: нерешённые есть, но все уже в пакетах дня", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(["t1"]),
      offeredTaskSlugs: new Set(tasks.map((t) => t.slug)),
    });
    expect(r.status).toBe("caught_up");
  });

  it("ставит задачи раньше статей в пакете", () => {
    const r = buildDayPlanPackage({
      tasks,
      articles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
    });
    const kinds = r.items.map((i) => i.kind);
    const firstTask = kinds.indexOf("task");
    const firstArticle = kinds.indexOf("article");
    expect(firstTask).toBeGreaterThanOrEqual(0);
    if (firstArticle >= 0) expect(firstTask).toBeLessThan(firstArticle);
  });

  it("микширует темы, пока банк позволяет (10c)", () => {
    const mixedBank: PlanTaskCandidate[] = [
      { slug: "a1", title: "A1", order: 1, cluster: "doc-a", grade: "low", topicSlug: "ta" },
      { slug: "b1", title: "B1", order: 2, cluster: "doc-b", grade: "low", topicSlug: "tb" },
      { slug: "a2", title: "A2", order: 3, cluster: "doc-a", grade: "mid", topicSlug: "ta" },
      { slug: "b2", title: "B2", order: 4, cluster: "doc-b", grade: "mid", topicSlug: "tb" },
      { slug: "a3", title: "A3", order: 5, cluster: "doc-c", grade: "high", topicSlug: "ta" },
      { slug: "b3", title: "B3", order: 6, cluster: "doc-c", grade: "high", topicSlug: "tb" },
    ];
    const mixedArticles = [
      { slug: "doc-a", title: "A", order: 1, topicSlug: "ta" },
      { slug: "doc-b", title: "B", order: 2, topicSlug: "tb" },
      { slug: "doc-c", title: "C", order: 3, topicSlug: "ta" },
    ];
    const r = buildDayPlanPackage({
      tasks: mixedBank,
      articles: mixedArticles,
      solvedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      maxTasks: 4,
      budgetMin: 100,
    });
    const topicSlugs = r.items.filter((i) => i.kind === "task").map((i) => i.topicSlug);
    expect(new Set(topicSlugs).size).toBeGreaterThanOrEqual(2);
    expect(r.items.every((i) => Boolean(i.topicSlug))).toBe(true);
  });

  it("countAvailableTasks считает остаток", () => {
    expect(
      countAvailableTasks({
        tasks,
        solvedTaskSlugs: new Set(["t1"]),
        offeredTaskSlugs: new Set(["t2"]),
      }),
    ).toBe(8);
  });

  it("canRequestNewPackage: только после решения всех задач текущего списка", () => {
    const pkg = {
      status: "normal" as const,
      items: [
        {
          kind: "task" as const,
          slug: "t1",
          title: "1",
          estMinutes: 12,
          grade: "high" as const,
          topicSlug: "t1",
        },
        {
          kind: "task" as const,
          slug: "t2",
          title: "2",
          estMinutes: 6,
          grade: "mid" as const,
          topicSlug: "t1",
        },
        { kind: "article" as const, slug: "doc-a", title: "A", estMinutes: 8, topicSlug: "t1" },
      ],
    };
    expect(canRequestNewPackage(null, new Set())).toBe(false);
    expect(canRequestNewPackage(pkg, new Set(["t1"]))).toBe(false);
    expect(canRequestNewPackage(pkg, new Set(["t1", "t2"]))).toBe(true);
    expect(canRequestNewPackage(pkg, new Set(["t1", "t2"]), 0)).toBe(false);
    expect(canRequestNewPackage({ ...pkg, status: "caught_up" }, new Set(["t1", "t2"]))).toBe(
      false,
    );
    expect(canRequestNewPackage({ ...pkg, status: "theme_closed" }, new Set(["t1", "t2"]))).toBe(
      false,
    );
  });

  it("resolveCurrentPackage: review (caught_up/theme_closed) — текущий", () => {
    const pkgs = [
      {
        id: "1",
        status: "normal" as const,
        items: [
          { kind: "task" as const, slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1" },
        ],
      },
      {
        id: "2",
        status: "caught_up" as const,
        items: [{ kind: "article" as const, slug: "a", title: "A", estMinutes: 8, topicSlug: "t1" }],
      },
    ];
    expect(resolveCurrentPackage(pkgs).current?.id).toBe("2");
    const withWork = resolveCurrentPackage(pkgs, new Set());
    expect(withWork.current?.id).toBe("1");
    expect(withWork.dayExhausted).toBe(false);
    expect(resolveCurrentPackage(pkgs, new Set(["t1"])).current?.id).toBe("2");
  });

  it("resolveCurrentPackage: один theme_closed — текущий", () => {
    const pkgs = [
      {
        id: "r",
        status: "theme_closed" as const,
        items: [{ kind: "article" as const, slug: "a", title: "A", estMinutes: 8, topicSlug: "t1" }],
      },
    ];
    const r = resolveCurrentPackage(pkgs);
    expect(r.current?.id).toBe("r");
    expect(r.dayExhausted).toBe(true);
  });

  it("allOfferedTasksSolved", () => {
    expect(
      allOfferedTasksSolved(
        [[{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1" }]],
        new Set(["t1"]),
      ),
    ).toBe(true);
    expect(
      allOfferedTasksSolved(
        [[{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1" }]],
        new Set(),
      ),
    ).toBe(false);
  });
});

describe("collectOfferedTaskSlugs", () => {
  it("собирает задачи из истории пакетов", () => {
    const set = collectOfferedTaskSlugs([
      [
        { kind: "article", slug: "doc-a", title: "A", estMinutes: 8, topicSlug: "t1" },
        { kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1" },
      ],
      [{ kind: "task", slug: "t2", title: "2", estMinutes: 12, topicSlug: "t1" }],
    ]);
    expect([...set].sort()).toEqual(["t1", "t2"]);
  });
});

describe("buildTestDayPlanPackage", () => {
  it("берёт только изученные и testable, без статей", () => {
    const built = buildTestDayPlanPackage({
      tasks,
      studiedTaskSlugs: new Set(["t1", "t2", "t3"]),
      offeredTaskSlugs: new Set(),
      testableTaskSlugs: new Set(["t1", "t3"]),
      budgetMin: 60,
    });
    expect(built.status).toBe("normal");
    expect(built.items.every((i) => i.kind === "task")).toBe(true);
    expect(built.items.map((i) => i.slug).sort()).toEqual(
      expect.arrayContaining(["t1", "t3"]),
    );
    expect(built.items.some((i) => i.slug === "t2")).toBe(false);
  });

  it("need_study если ничего не изучено", () => {
    const built = buildTestDayPlanPackage({
      tasks,
      studiedTaskSlugs: new Set(),
      offeredTaskSlugs: new Set(),
      testableTaskSlugs: new Set(["t1"]),
    });
    expect(built.status).toBe("need_study");
    expect(built.items).toHaveLength(0);
  });

  it("caught_up если изучено, но нечего тестировать", () => {
    const built = buildTestDayPlanPackage({
      tasks,
      studiedTaskSlugs: new Set(["t1"]),
      offeredTaskSlugs: new Set(["t1"]),
      testableTaskSlugs: new Set(["t1"]),
    });
    expect(built.status).toBe("caught_up");
  });

  it("countAvailableTestTasks считает пересечение", () => {
    expect(
      countAvailableTestTasks({
        tasks,
        studiedTaskSlugs: new Set(["t1", "t2"]),
        offeredTaskSlugs: new Set(["t1"]),
        testableTaskSlugs: new Set(["t1", "t2", "t3"]),
      }),
    ).toBe(1);
  });
});

describe("calendarDateInTz", () => {
  it("возвращает YYYY-MM-DD", () => {
    expect(calendarDateInTz(new Date("2026-09-09T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
