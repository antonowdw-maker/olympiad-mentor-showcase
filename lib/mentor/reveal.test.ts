/**
 * Unit: reveal эталона по кнопке A (REQ-TRN-09, INV-07, I12A-01) — мок Prisma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueReveal,
  createReveal,
  findUniqueInstReveal,
  createInstReveal,
  findFirstTask,
  createAttempt,
  getHintsOpenedCountMock,
  requireBoundMock,
} = vi.hoisted(() => ({
  findUniqueReveal: vi.fn(),
  createReveal: vi.fn(),
  findUniqueInstReveal: vi.fn(),
  createInstReveal: vi.fn(),
  findFirstTask: vi.fn(),
  createAttempt: vi.fn(),
  getHintsOpenedCountMock: vi.fn(),
  requireBoundMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    taskReveal: {
      findUnique: findUniqueReveal,
      create: createReveal,
    },
    taskInstanceReveal: {
      findUnique: findUniqueInstReveal,
      create: createInstReveal,
    },
    task: {
      findFirst: findFirstTask,
    },
    attempt: {
      create: createAttempt,
    },
  },
}));

vi.mock("@/lib/trainer/hint-progress", () => ({
  getHintsOpenedCount: getHintsOpenedCountMock,
}));

vi.mock("@/lib/content/instance-binding", () => ({
  requireBoundTaskContent: requireBoundMock,
}));

import { hasTaskReveal, revealTaskSolution } from "./reveal";

const canonTask = {
  id: "tid",
  statement: "s",
  acceptedAnswers: JSON.stringify(["да"]),
  options: null,
  hintSteps: "[]",
};

beforeEach(() => {
  vi.clearAllMocks();
  getHintsOpenedCountMock.mockResolvedValue(1);
  createReveal.mockResolvedValue({ id: "rev-1" });
  createInstReveal.mockResolvedValue({ id: "irev-1" });
  createAttempt.mockResolvedValue({ id: "att-1" });
  findFirstTask.mockResolvedValue(canonTask);
});

describe("hasTaskReveal", () => {
  it("канон: true если TaskReveal есть", async () => {
    findUniqueReveal.mockResolvedValue({ id: "r1" });
    await expect(hasTaskReveal("u1", "t1")).resolves.toBe(true);
  });

  it("instance: смотрит TaskInstanceReveal", async () => {
    findUniqueInstReveal.mockResolvedValue({ id: "ir1" });
    await expect(hasTaskReveal("u1", "t1", "inst-1")).resolves.toBe(true);
    expect(findUniqueInstReveal).toHaveBeenCalled();
    expect(findUniqueReveal).not.toHaveBeenCalled();
  });
});

describe("revealTaskSolution", () => {
  it("ошибка если задача не найдена", async () => {
    findFirstTask.mockResolvedValue(null);
    const r = await revealTaskSolution("u1", "t1-logic", "missing");
    expect(r).toEqual({ ok: false, error: "Задача не найдена" });
  });

  it("ошибка binding пробрасывается", async () => {
    requireBoundMock.mockResolvedValue({
      ok: false,
      error: "Вариант задачи устарел — обновите страницу",
    });
    const r = await revealTaskSolution("u1", "t1-logic", "x", "old");
    expect(r.ok).toBe(false);
  });

  it("канон: создаёт TaskReveal + Attempt", async () => {
    requireBoundMock.mockResolvedValue({
      ok: true,
      binding: {
        taskId: "tid",
        instanceId: null,
        statement: "s",
        acceptedAnswers: JSON.stringify(["да", "yes"]),
        options: null,
        hintSteps: "[]",
        openedCount: 1,
      },
    });
    findUniqueReveal.mockResolvedValue(null);

    const r = await revealTaskSolution("u1", "t1-logic", "t1-x");
    expect(r).toEqual({ ok: true, acceptedAnswers: ["да", "yes"] });
    expect(createReveal).toHaveBeenCalledWith({
      data: { userId: "u1", taskId: "tid" },
    });
    expect(createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        solutionRevealed: true,
        taskId: "tid",
        userId: "u1",
      }),
    });
    expect(createAttempt.mock.calls[0]![0].data.taskInstanceId).toBeUndefined();
  });

  it("instance: эталон из binding, TaskInstanceReveal", async () => {
    requireBoundMock.mockResolvedValue({
      ok: true,
      binding: {
        taskId: "tid",
        instanceId: "inst-2",
        statement: "вариант",
        acceptedAnswers: JSON.stringify(["ложно"]),
        options: null,
        hintSteps: "[]",
        openedCount: 0,
      },
    });
    findUniqueInstReveal.mockResolvedValue(null);

    const r = await revealTaskSolution("u1", "t1-logic", "t1-x", "inst-2");
    expect(r).toEqual({ ok: true, acceptedAnswers: ["ложно"] });
    expect(createInstReveal).toHaveBeenCalledWith({
      data: { userId: "u1", taskInstanceId: "inst-2" },
    });
    expect(createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskInstanceId: "inst-2",
        solutionRevealed: true,
        submittedAnswer: "[reveal]",
      }),
    });
    expect(createReveal).not.toHaveBeenCalled();
  });
});
