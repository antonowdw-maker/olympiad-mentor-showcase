/**
 * Unit: серверный binding instance (I12A-02/03).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  countInstances,
  findHint,
  findCorrect,
  resolveMock,
} = vi.hoisted(() => ({
  countInstances: vi.fn(),
  findHint: vi.fn(),
  findCorrect: vi.fn(),
  resolveMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    taskInstance: { count: countInstances },
    taskHintProgress: { findUnique: findHint },
    attempt: { findFirst: findCorrect },
  },
}));

vi.mock("@/lib/content/instance-resolve", () => ({
  resolveTaskInstance: resolveMock,
}));

import {
  getCurrentBoundContent,
  hasCanonicalCorrectAttempt,
  requireBoundTaskContent,
} from "./instance-binding";

const task = {
  id: "tid",
  statement: "canon",
  acceptedAnswers: '["1"]',
  options: null,
  hintSteps: "[]",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireBoundTaskContent", () => {
  it("без пула: отклоняет чужой instanceId", async () => {
    countInstances.mockResolvedValue(0);
    resolveMock.mockResolvedValue(null);
    findHint.mockResolvedValue({ openedCount: 0 });
    const r = await requireBoundTaskContent("u1", task, "ghost");
    expect(r.ok).toBe(false);
  });

  it("без пула: принимает отсутствие instanceId", async () => {
    countInstances.mockResolvedValue(0);
    resolveMock.mockResolvedValue(null);
    findHint.mockResolvedValue({ openedCount: 2 });
    const r = await requireBoundTaskContent("u1", task, undefined);
    expect(r).toEqual({
      ok: true,
      binding: expect.objectContaining({
        instanceId: null,
        openedCount: 2,
        statement: "canon",
      }),
    });
  });

  it("с пулом: требует instanceId", async () => {
    countInstances.mockResolvedValue(3);
    resolveMock.mockResolvedValue({
      id: "i1",
      slug: "i0",
      order: 0,
      statement: "v1",
      acceptedAnswers: '["2"]',
      options: null,
      hintSteps: "[]",
      openedCount: 0,
    });
    const r = await requireBoundTaskContent("u1", task, undefined);
    expect(r).toEqual({ ok: false, error: "Нужен текущий вариант задачи" });
  });

  it("с пулом: отклоняет устаревший instanceId", async () => {
    countInstances.mockResolvedValue(3);
    resolveMock.mockResolvedValue({
      id: "i1",
      slug: "i0",
      order: 0,
      statement: "v1",
      acceptedAnswers: '["2"]',
      options: null,
      hintSteps: "[]",
      openedCount: 1,
    });
    const r = await requireBoundTaskContent("u1", task, "old-id");
    expect(r.ok).toBe(false);
  });

  it("с пулом: принимает текущий sticky", async () => {
    countInstances.mockResolvedValue(3);
    resolveMock.mockResolvedValue({
      id: "i1",
      slug: "i0",
      order: 0,
      statement: "v1",
      acceptedAnswers: '["2"]',
      options: null,
      hintSteps: "[]",
      openedCount: 1,
    });
    const r = await requireBoundTaskContent("u1", task, "i1");
    expect(r).toEqual({
      ok: true,
      binding: expect.objectContaining({
        instanceId: "i1",
        statement: "v1",
        openedCount: 1,
      }),
    });
  });
});

describe("getCurrentBoundContent", () => {
  it("берёт поля из resolved instance", async () => {
    resolveMock.mockResolvedValue({
      id: "i2",
      slug: "i1",
      order: 1,
      statement: "iso",
      acceptedAnswers: '["ложь"]',
      options: null,
      hintSteps: "[]",
      openedCount: 0,
    });
    const b = await getCurrentBoundContent("u1", task);
    expect(b.instanceId).toBe("i2");
    expect(b.statement).toBe("iso");
  });
});

describe("hasCanonicalCorrectAttempt", () => {
  it("true при верном Attempt", async () => {
    findCorrect.mockResolvedValue({ id: "a1" });
    await expect(hasCanonicalCorrectAttempt("u1", "tid")).resolves.toBe(true);
  });

  it("false если нет", async () => {
    findCorrect.mockResolvedValue(null);
    await expect(hasCanonicalCorrectAttempt("u1", "tid")).resolves.toBe(false);
  });
});
