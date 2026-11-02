/**
 * Unit: серверный контур подсказок (I4-01) — мок Prisma / auth.
 * Инварианты: потолок без записи в БД; Attempt из TaskHintProgress; DTO без закрытых текстов.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueProgress,
  upsertProgress,
  findFirstTask,
  countTask,
  findFirstAttempt,
  countAttempt,
  createAttempt,
  findManyArticles,
  findUniqueUser,
  findManyTaskInstance,
  countTaskInstance,
  authMock,
  revalidatePathMock,
  awardXpMock,
} = vi.hoisted(() => ({
  findUniqueProgress: vi.fn(),
  upsertProgress: vi.fn(),
  findFirstTask: vi.fn(),
  countTask: vi.fn(),
  findFirstAttempt: vi.fn(),
  countAttempt: vi.fn(),
  createAttempt: vi.fn(),
  findManyArticles: vi.fn(),
  findUniqueUser: vi.fn(),
  findManyTaskInstance: vi.fn(),
  countTaskInstance: vi.fn(),
  authMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  awardXpMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    taskHintProgress: {
      findUnique: findUniqueProgress,
      upsert: upsertProgress,
    },
    task: {
      findFirst: findFirstTask,
      count: countTask,
    },
    attempt: {
      findFirst: findFirstAttempt,
      count: countAttempt,
      create: createAttempt,
    },
    docArticle: {
      findMany: findManyArticles,
    },
    user: {
      findUnique: findUniqueUser,
    },
    taskInstance: {
      findMany: findManyTaskInstance,
      findFirst: vi.fn(),
      count: countTaskInstance,
    },
    userTaskInstanceShow: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/progress/award", () => ({
  awardXpForCorrectSolve: awardXpMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { getTaskPublic } from "@/lib/content/queries";
import {
  countWrongAttemptsAfterLastCorrect,
  getTaskHelpState,
  openNextHintStep,
} from "@/lib/trainer/hint-progress";
import { submitAnswerAction } from "@/lib/trainer/submit-answer";

beforeEach(() => {
  vi.clearAllMocks();
  findManyArticles.mockResolvedValue([]);
  createAttempt.mockResolvedValue({ id: "att-1" });
  upsertProgress.mockResolvedValue({});
  countTask.mockResolvedValue(0);
  findUniqueUser.mockResolvedValue({ totalXp: 0 });
  awardXpMock.mockResolvedValue({ xpGained: 10, totalXp: 10, newBadges: [] });
  findManyTaskInstance.mockResolvedValue([]);
  countTaskInstance.mockResolvedValue(0);
});

describe("openNextHintStep (I4-01a)", () => {
  it("на потолке не пишет в БД и отдаёт advanced: false", async () => {
    findUniqueProgress.mockResolvedValue({ openedCount: 3 });
    const result = await openNextHintStep("u1", "t1", 3);
    expect(result).toEqual({ openedCount: 3, advanced: false });
    expect(upsertProgress).not.toHaveBeenCalled();
  });

  it("открывает следующую и делает upsert", async () => {
    findUniqueProgress.mockResolvedValue({ openedCount: 1 });
    const result = await openNextHintStep("u1", "t1", 3);
    expect(result).toEqual({ openedCount: 2, advanced: true });
    expect(upsertProgress).toHaveBeenCalledOnce();
  });
});

describe("submitAnswerAction (I4-01b / I4-02)", () => {
  it("кладёт в Attempt счётчик из TaskHintProgress и игнорирует поле формы", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findFirstTask.mockResolvedValue({
      id: "task-1",
      topicId: "topic-1",
      grade: "low",
      acceptedAnswers: JSON.stringify(["42"]),
      answerType: "number",
      hintSteps: JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]),
      similarTaskSlug: null,
      topic: { id: "topic-1", slug: "t1-logic", title: "Логика" },
    });
    findUniqueProgress.mockResolvedValue({ openedCount: 2 });
    findFirstAttempt.mockResolvedValue(null);
    countAttempt.mockResolvedValue(0);

    const fd = new FormData();
    fd.set("topicSlug", "t1-logic");
    fd.set("taskSlug", "task-x");
    fd.set("answer", "42");
    fd.set("hintsOpenedCount", "99");

    const result = await submitAnswerAction(fd);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hintsOpenedCount).toBe(2);
    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hintsOpenedCount: 2,
          isCorrect: true,
        }),
      }),
    );
  });

  it("клампит openedCount по длине hintSteps (I4-02)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findFirstTask.mockResolvedValue({
      id: "task-1",
      topicId: "topic-1",
      grade: "mid",
      acceptedAnswers: JSON.stringify(["нет"]),
      answerType: "text",
      hintSteps: JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]),
      similarTaskSlug: null,
      topic: { id: "topic-1", slug: "t1-logic", title: "Логика" },
    });
    findUniqueProgress.mockResolvedValue({ openedCount: 9 });
    findFirstAttempt.mockResolvedValue(null);
    countAttempt.mockResolvedValue(1);

    const fd = new FormData();
    fd.set("topicSlug", "t1-logic");
    fd.set("taskSlug", "task-x");
    fd.set("answer", "да");

    const result = await submitAnswerAction(fd);
    expect(result.ok).toBe(true);
    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hintsOpenedCount: 3 }),
      }),
    );
    expect(awardXpMock).not.toHaveBeenCalled();
  });
});

describe("getTaskPublic (I4-01c)", () => {
  it("при opened=1, total=3 отдаёт один текст и hasMoreHints", async () => {
    findFirstTask.mockResolvedValue({
      id: "task-1",
      topicId: "topic-1",
      slug: "task-x",
      title: "Задача",
      statement: "Условие",
      answerType: "text",
      options: null,
      difficulty: "5",
      grade: "low",
      order: 1,
      relatedDocSlugs: JSON.stringify(["doc-a"]),
      hintSteps: JSON.stringify([
        { text: "открытая ступень", docSlug: "doc-open" },
        { text: "секретная ступень два", docSlug: "doc-secret" },
        { text: "секретная ступень три" },
      ]),
      similarTaskSlug: null,
      workedExample: null,
    });
    findUniqueProgress.mockResolvedValue({ openedCount: 1 });
    findManyArticles.mockResolvedValue([
      { slug: "doc-a", title: "Статья A", body: "тело A" },
      { slug: "doc-open", title: "Открытая", body: "тело open" },
    ]);

    const { task, error } = await getTaskPublic("t1-logic", "task-x", "u1");
    expect(error).toBeNull();
    expect(task).not.toBeNull();
    expect(task!.hintStepsTotal).toBe(3);
    expect(task!.hintsOpenedCount).toBe(1);
    expect(task!.hasMoreHints).toBe(true);
    expect(task!.hintSteps).toHaveLength(1);
    expect(task!.hintSteps[0].text).toBe("открытая ступень");
    expect(JSON.stringify(task)).not.toContain("секретная");
    // Превью не тянет доки закрытых ступеней
    expect(task!.articlePreviews.map((a) => a.slug).sort()).toEqual(["doc-a", "doc-open"]);
  });

  it("без ?reinforce=1 цель similar сохраняет полный total (FUA-01)", async () => {
    findFirstTask.mockResolvedValue({
      id: "task-r",
      topicId: "topic-1",
      slug: "reinforce-x",
      title: "Закрепление",
      statement: "Условие",
      answerType: "text",
      options: null,
      difficulty: "5",
      grade: "low",
      order: 2,
      relatedDocSlugs: JSON.stringify([]),
      hintSteps: JSON.stringify([
        { text: "ступень 1" },
        { text: "ступень 2" },
        { text: "ступень 3" },
      ]),
      similarTaskSlug: null,
      workedExample: null,
    });
    countTask.mockResolvedValue(1); // на slug ссылается другая задача
    findUniqueProgress.mockResolvedValue({ openedCount: 0 });

    const { task, error } = await getTaskPublic("t1-logic", "reinforce-x", "u1");
    expect(error).toBeNull();
    expect(task!.hintStepsTotal).toBe(3);
    expect(task!.hasMoreHints).toBe(true);
  });

  it("с ?reinforce=1 цель similar: hintStepsTotal ≤ 1 (I4-08)", async () => {
    findFirstTask.mockResolvedValue({
      id: "task-r",
      topicId: "topic-1",
      slug: "reinforce-x",
      title: "Закрепление",
      statement: "Условие",
      answerType: "text",
      options: null,
      difficulty: "5",
      grade: "low",
      order: 2,
      relatedDocSlugs: JSON.stringify([]),
      hintSteps: JSON.stringify([
        { text: "ступень 1" },
        { text: "ступень 2" },
        { text: "ступень 3" },
      ]),
      similarTaskSlug: null,
      workedExample: null,
    });
    countTask.mockResolvedValue(1);
    findUniqueProgress.mockResolvedValue({ openedCount: 0 });

    const { task, error } = await getTaskPublic("t1-logic", "reinforce-x", "u1", {
      reinforce: "1",
    });
    expect(error).toBeNull();
    expect(task!.hintStepsTotal).toBe(1);
    expect(task!.hasMoreHints).toBe(true);
    expect(task!.hintSteps).toHaveLength(0);
  });
});

describe("openHintStepAction (I4-08 / FUA-04)", () => {
  it("на обычном визите цели similar открывает до полного total", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findFirstTask.mockResolvedValue({
      id: "task-r",
      topicId: "topic-1",
      slug: "reinforce-x",
      hintSteps: JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]),
    });
    countTask.mockResolvedValue(1);
    findUniqueProgress.mockResolvedValue({ openedCount: 0 });

    const { openHintStepAction } = await import("@/lib/trainer/open-hint");
    const result = await openHintStepAction("t1-logic", "reinforce-x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hintStepsTotal).toBe(3);
    expect(result.openedCount).toBe(1);
  });

  it("при reinforce=1 режет total до 1", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findFirstTask.mockResolvedValue({
      id: "task-r",
      topicId: "topic-1",
      slug: "reinforce-x",
      hintSteps: JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]),
    });
    countTask.mockResolvedValue(1);
    findUniqueProgress.mockResolvedValue({ openedCount: 0 });

    const { openHintStepAction } = await import("@/lib/trainer/open-hint");
    const result = await openHintStepAction("t1-logic", "reinforce-x", "1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hintStepsTotal).toBe(1);
    expect(result.openedCount).toBe(1);
    expect(result.hasMoreHints).toBe(false);
  });
});

describe("submitAnswerAction reinforce clamp (FUA-03)", () => {
  it("при reinforce=1 клампит Attempt по effective total=1", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findFirstTask.mockResolvedValue({
      id: "task-1",
      topicId: "topic-1",
      grade: "low",
      acceptedAnswers: JSON.stringify(["нет"]),
      answerType: "text",
      hintSteps: JSON.stringify([{ text: "a" }, { text: "b" }, { text: "c" }]),
      similarTaskSlug: null,
      topic: { id: "topic-1", slug: "t1-logic", title: "Логика" },
    });
    countTask.mockResolvedValue(1);
    findUniqueProgress.mockResolvedValue({ openedCount: 3 });
    findFirstAttempt.mockResolvedValue(null);
    countAttempt.mockResolvedValue(0);

    const fd = new FormData();
    fd.set("topicSlug", "t1-logic");
    fd.set("taskSlug", "reinforce-x");
    fd.set("answer", "нет");
    fd.set("reinforce", "1");

    const result = await submitAnswerAction(fd);
    expect(result.ok).toBe(true);
    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hintsOpenedCount: 1 }),
      }),
    );
  });
});

describe("countWrongAttemptsAfterLastCorrect / getTaskHelpState (I4-03/04)", () => {
  it("считает неверные только после последней верной", async () => {
    const since = new Date("2026-01-02T00:00:00Z");
    findFirstAttempt.mockResolvedValue({ createdAt: since });
    countAttempt.mockResolvedValue(2);

    const n = await countWrongAttemptsAfterLastCorrect("u1", "t1");
    expect(n).toBe(2);
    expect(countAttempt).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        taskId: "t1",
        isCorrect: false,
        solutionRevealed: false,
        createdAt: { gt: since },
      },
    });
  });

  it("getTaskHelpState: boost false при <3 неверных после верной", async () => {
    findFirstTask.mockResolvedValue({ id: "task-1" });
    findFirstAttempt.mockResolvedValue({ createdAt: new Date() });
    countAttempt.mockResolvedValue(1);

    const state = await getTaskHelpState("u1", "t1-logic", "task-x");
    expect(state).toEqual({ taskId: "task-1", boostHelp: false });
  });
});
