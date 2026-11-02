/**
 * Unit: start / skip / submit закрепления — мок Prisma (I13BC-01/03/04).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findFirstPackage,
  findUniqueSession,
  createSession,
  findFirstSession,
  updateSession,
  findManyTasks,
  findManyInstances,
  findManyShows,
  upsertShow,
  findUniqueInstance,
  createAttempt,
  updateItem,
  findManyItems,
  findUniqueOrThrowSession,
  getSolvedSlugs,
  pickUnsolved,
  isAnswerCorrect,
  awardInTx,
  awardReward,
  transaction,
  findUniqueUser,
} = vi.hoisted(() => ({
  findFirstPackage: vi.fn(),
  findUniqueSession: vi.fn(),
  createSession: vi.fn(),
  findFirstSession: vi.fn(),
  updateSession: vi.fn(),
  findManyTasks: vi.fn(),
  findManyInstances: vi.fn(),
  findManyShows: vi.fn(),
  upsertShow: vi.fn(),
  findUniqueInstance: vi.fn(),
  createAttempt: vi.fn(),
  updateItem: vi.fn(),
  findManyItems: vi.fn(),
  findUniqueOrThrowSession: vi.fn(),
  getSolvedSlugs: vi.fn(),
  pickUnsolved: vi.fn(),
  isAnswerCorrect: vi.fn(),
  awardInTx: vi.fn(),
  awardReward: vi.fn(),
  transaction: vi.fn(),
  findUniqueUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    dayPlanPackage: { findFirst: findFirstPackage },
    reinforceSession: {
      findUnique: findUniqueSession,
      findFirst: findFirstSession,
      create: createSession,
      update: updateSession,
      findUniqueOrThrow: findUniqueOrThrowSession,
    },
    reinforceSessionItem: {
      update: updateItem,
      findMany: findManyItems,
    },
    task: { findMany: findManyTasks },
    taskInstance: {
      findMany: findManyInstances,
      findUnique: findUniqueInstance,
    },
    userTaskInstanceShow: {
      findMany: findManyShows,
      upsert: upsertShow,
    },
    attempt: { create: createAttempt },
    user: { findUnique: findUniqueUser },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/plan/service", () => ({
  getSolvedTaskSlugsForTopicSlugs: getSolvedSlugs,
}));

vi.mock("@/lib/content/instance-resolve", () => ({
  getCorrectlySolvedInstanceIdsForTask: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/lib/content/instance-select", () => ({
  pickUnsolvedTaskInstance: pickUnsolved,
}));

vi.mock("@/lib/trainer/answer", () => ({
  isAnswerCorrect: isAnswerCorrect,
}));

vi.mock("@/lib/reinforce/award", () => ({
  awardReinforceSessionReward: awardReward,
  awardReinforceSessionRewardInTx: awardInTx,
}));

import {
  skipReinforceSession,
  startReinforceSession,
  submitReinforceAnswer,
} from "./service";

const pkgItems = JSON.stringify([
  { kind: "task", slug: "t-a", title: "A", estMinutes: 6, topicSlug: "topic-1" },
  { kind: "task", slug: "t-b", title: "B", estMinutes: 6, topicSlug: "topic-1" },
]);

function mockSessionDto(overrides?: {
  status?: string;
  items?: {
    id: string;
    ord: number;
    taskId: string;
    taskInstanceId: string;
    answeredAt: Date | null;
    isCorrect: boolean | null;
  }[];
  rewardGrantedAt?: Date | null;
}) {
  const items = overrides?.items ?? [
    {
      id: "item-1",
      ord: 0,
      taskId: "task-a",
      taskInstanceId: "inst-1",
      answeredAt: null,
      isCorrect: null,
    },
  ];
  findUniqueOrThrowSession.mockResolvedValue({
    id: "sess-1",
    userId: "u1",
    status: overrides?.status ?? "active",
    sourcePackageId: "pkg-1",
    rewardGrantedAt: overrides?.rewardGrantedAt ?? null,
    createdAt: new Date("2026-09-19T10:00:00.000Z"),
    completedAt:
      overrides?.status === "completed" || overrides?.status === "skipped"
        ? new Date("2026-09-19T10:01:00.000Z")
        : null,
    durationSec: overrides?.status === "completed" ? 60 : null,
    sourcePackage: { id: "pkg-1", seq: 1 },
    items,
  });
  findManyInstances.mockResolvedValue(
    items.map((i, idx) => ({
      id: i.taskInstanceId,
      statement: `Q${idx}?`,
      options: null,
      task: {
        slug: "t-a",
        title: "A",
        answerType: "text",
        options: null,
        grade: "mid",
        topic: { slug: "topic-1" },
      },
    })),
  );
  findUniqueUser.mockResolvedValue({ totalXp: 15 });
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertShow.mockResolvedValue({});
  pickUnsolved.mockReturnValue({ id: "inst-a2", order: 1 });
  getSolvedSlugs.mockResolvedValue(new Set(["t-a", "t-b"]));
  transaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
    const tx = {
      reinforceSession: { findFirst: findFirstSession },
      reinforceSessionItem: { update: updateItem, findMany: findManyItems },
      taskInstance: { findUnique: findUniqueInstance },
      attempt: { create: createAttempt },
    };
    return fn(tx);
  });
});

describe("startReinforceSession", () => {
  it("reject incomplete package", async () => {
    findFirstPackage.mockResolvedValue({
      id: "pkg-1",
      userId: "u1",
      status: "normal",
      items: pkgItems,
      seq: 1,
    });
    findUniqueSession.mockResolvedValue(null);
    getSolvedSlugs.mockResolvedValue(new Set(["t-a"]));

    await expect(startReinforceSession("u1", "pkg-1")).rejects.toThrow("INCOMPLETE");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("SKIPPED на старте → throw", async () => {
    findFirstPackage.mockResolvedValue({
      id: "pkg-1",
      userId: "u1",
      status: "normal",
      items: pkgItems,
      seq: 1,
    });
    findUniqueSession.mockResolvedValue({
      id: "sess-old",
      status: "skipped",
      items: [],
    });

    await expect(startReinforceSession("u1", "pkg-1")).rejects.toThrow("SKIPPED");
  });

  it("resume active → тот же sessionId без create", async () => {
    findFirstPackage.mockResolvedValue({
      id: "pkg-1",
      userId: "u1",
      status: "normal",
      items: pkgItems,
      seq: 1,
    });
    findUniqueSession.mockResolvedValue({
      id: "sess-1",
      status: "active",
      items: [{ answeredAt: null }],
    });
    mockSessionDto();

    const dto = await startReinforceSession("u1", "pkg-1");
    expect(dto.id).toBe("sess-1");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("NO_TESTABLE_TASKS если нет пула ≥2", async () => {
    findFirstPackage.mockResolvedValue({
      id: "pkg-1",
      userId: "u1",
      status: "normal",
      items: pkgItems,
      seq: 1,
    });
    findUniqueSession.mockResolvedValue(null);
    findManyTasks.mockResolvedValue([
      { id: "task-a", slug: "t-a", title: "A", topic: { slug: "topic-1" } },
      { id: "task-b", slug: "t-b", title: "B", topic: { slug: "topic-1" } },
    ]);
    findManyInstances.mockResolvedValue([{ id: "only-one", order: 0 }]);
    findManyShows.mockResolvedValue([]);

    await expect(startReinforceSession("u1", "pkg-1")).rejects.toThrow("NO_TESTABLE_TASKS");
  });
});

describe("skipReinforceSession", () => {
  it("ставит skipped без award", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
    });
    updateSession.mockResolvedValue({});
    await skipReinforceSession("u1", "sess-1");
    expect(updateSession).toHaveBeenCalledWith({
      where: { id: "sess-1" },
      data: { status: "skipped", completedAt: expect.any(Date) },
    });
    expect(awardReward).not.toHaveBeenCalled();
    expect(awardInTx).not.toHaveBeenCalled();
  });
});

describe("submitReinforceAnswer", () => {
  it("промежуточный ответ: Attempt есть, award нет", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
      sourcePackageId: "pkg-1",
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: null,
          isCorrect: null,
        },
        {
          id: "item-2",
          ord: 1,
          taskId: "task-b",
          taskInstanceId: "inst-2",
          answeredAt: null,
          isCorrect: null,
        },
      ],
    });
    findUniqueInstance.mockResolvedValue({
      id: "inst-1",
      acceptedAnswers: JSON.stringify(["42"]),
      task: { id: "task-a", slug: "t-a", answerType: "text", acceptedAnswers: "[]" },
    });
    isAnswerCorrect.mockReturnValue(true);
    createAttempt.mockResolvedValue({ id: "att-1" });
    updateItem.mockResolvedValue({});
    findManyItems.mockResolvedValue([
      { answeredAt: new Date() },
      { answeredAt: null },
    ]);
    mockSessionDto({
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: new Date(),
          isCorrect: true,
        },
        {
          id: "item-2",
          ord: 1,
          taskId: "task-b",
          taskInstanceId: "inst-2",
          answeredAt: null,
          isCorrect: null,
        },
      ],
    });

    const r = await submitReinforceAnswer({
      userId: "u1",
      sessionId: "sess-1",
      itemId: "item-1",
      answer: "42",
    });
    expect(r.isCorrect).toBe(true);
    expect(createAttempt).toHaveBeenCalled();
    expect(awardInTx).not.toHaveBeenCalled();
    expect(r.reward).toBeNull();
  });

  it("последний ответ: awardInTx в той же transaction", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
      sourcePackageId: "pkg-1",
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: null,
          isCorrect: null,
        },
      ],
    });
    findUniqueInstance.mockResolvedValue({
      id: "inst-1",
      acceptedAnswers: JSON.stringify(["42"]),
      task: { id: "task-a", slug: "t-a", answerType: "text", acceptedAnswers: "[]" },
    });
    isAnswerCorrect.mockReturnValue(true);
    createAttempt.mockResolvedValue({ id: "att-1" });
    updateItem.mockResolvedValue({});
    findManyItems.mockResolvedValue([{ answeredAt: new Date() }]);
    awardInTx.mockResolvedValue({
      xpGained: 10,
      totalXp: 25,
      badge: { code: "session_reinforced:pkg-1", title: "Материал закреплён" },
      completed: true,
      rewarded: true,
      pass: { score: 2, maxScore: 2, threshold: 2, passed: true },
    });
    mockSessionDto({
      status: "completed",
      rewardGrantedAt: new Date(),
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: new Date(),
          isCorrect: true,
        },
      ],
    });

    const r = await submitReinforceAnswer({
      userId: "u1",
      sessionId: "sess-1",
      itemId: "item-1",
      answer: "42",
    });
    expect(awardInTx).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "u1",
        sessionId: "sess-1",
        sourcePackageId: "pkg-1",
      },
    );
    expect(r.reward?.xpGained).toBe(10);
    expect(r.session.pass).toEqual({
      score: 2,
      maxScore: 2,
      threshold: 2,
      passed: true,
    });
    expect(r.session.questions[0]?.grade).toBe("mid");
    expect(transaction).toHaveBeenCalled();
  });

  it("последний ответ с ошибкой: awardInTx без XP (ниже порога)", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
      sourcePackageId: "pkg-1",
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: null,
          isCorrect: null,
        },
      ],
    });
    findUniqueInstance.mockResolvedValue({
      id: "inst-1",
      acceptedAnswers: JSON.stringify(["42"]),
      task: { id: "task-a", slug: "t-a", answerType: "text", acceptedAnswers: "[]" },
    });
    isAnswerCorrect.mockReturnValue(false);
    createAttempt.mockResolvedValue({ id: "att-1" });
    updateItem.mockResolvedValue({});
    findManyItems.mockResolvedValue([{ answeredAt: new Date(), isCorrect: false }]);
    awardInTx.mockResolvedValue({
      xpGained: 0,
      totalXp: 10,
      badge: null,
      completed: true,
      rewarded: false,
      pass: { score: 0, maxScore: 2, threshold: 2, passed: false },
    });
    mockSessionDto({
      status: "completed",
      rewardGrantedAt: null,
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: new Date(),
          isCorrect: false,
        },
      ],
    });

    const r = await submitReinforceAnswer({
      userId: "u1",
      sessionId: "sess-1",
      itemId: "item-1",
      answer: "0",
    });
    expect(r.isCorrect).toBe(false);
    expect(r.reward?.xpGained).toBe(0);
    expect(r.reward?.rewarded).toBe(false);
    expect(r.session.pass).toEqual({
      score: 0,
      maxScore: 2,
      threshold: 2,
      passed: false,
    });
    expect(r.session.questions[0]?.grade).toBe("mid");
    expect(r.session.questions[0]?.isCorrect).toBe(false);
    expect(awardInTx).toHaveBeenCalled();
  });

  it("повторный ответ на тот же item → ALREADY_ANSWERED", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
      sourcePackageId: "pkg-1",
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: new Date(),
          isCorrect: false,
        },
      ],
    });
    await expect(
      submitReinforceAnswer({
        userId: "u1",
        sessionId: "sess-1",
        itemId: "item-1",
        answer: "1",
      }),
    ).rejects.toThrow("ALREADY_ANSWERED");
    expect(createAttempt).not.toHaveBeenCalled();
    expect(awardInTx).not.toHaveBeenCalled();
  });

  it("неполная таблица → TABLE_INCOMPLETE, попытка не тратится", async () => {
    findFirstSession.mockResolvedValue({
      id: "sess-1",
      userId: "u1",
      status: "active",
      sourcePackageId: "pkg-1",
      items: [
        {
          id: "item-1",
          ord: 0,
          taskId: "task-a",
          taskInstanceId: "inst-1",
          answeredAt: null,
          isCorrect: null,
        },
      ],
    });
    findUniqueInstance.mockResolvedValue({
      id: "inst-1",
      acceptedAnswers: JSON.stringify(["7; 6"]),
      options: null,
      task: {
        id: "task-a",
        slug: "t-a",
        answerType: "table",
        acceptedAnswers: "[]",
        options: JSON.stringify({
          rowHeader: "Ученик",
          rows: ["Аня", "Боря"],
          columns: [{ title: "Класс", values: ["6", "7"] }],
        }),
      },
    });
    await expect(
      submitReinforceAnswer({
        userId: "u1",
        sessionId: "sess-1",
        itemId: "item-1",
        answer: "7; ",
      }),
    ).rejects.toThrow("TABLE_INCOMPLETE");
    expect(createAttempt).not.toHaveBeenCalled();
  });
});
