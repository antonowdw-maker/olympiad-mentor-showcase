/**
 * Unit: начисление XP/бейджей — TaskXpAward unique + P2002 (мок Prisma).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createXpAward,
  updateUser,
  findUniqueUser,
  findManyAttempt,
  createBadge,
  transaction,
} = vi.hoisted(() => ({
  createXpAward: vi.fn(),
  updateUser: vi.fn(),
  findUniqueUser: vi.fn(),
  findManyAttempt: vi.fn(),
  createBadge: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  taskXpAward: { create: createXpAward },
  user: { update: updateUser, findUnique: findUniqueUser },
  attempt: { findMany: findManyAttempt },
  userBadge: { create: createBadge },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
    user: { findUnique: findUniqueUser },
    userBadge: { findMany: vi.fn() },
  },
}));

import { awardXpForCorrectSolve, isPrismaUniqueConflict } from "@/lib/progress/award";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  createBadge.mockResolvedValue({});
});

describe("isPrismaUniqueConflict", () => {
  it("true только для code P2002", () => {
    expect(isPrismaUniqueConflict({ code: "P2002" })).toBe(true);
    expect(isPrismaUniqueConflict(Object.assign(new Error("Unique"), { code: "P2002" }))).toBe(
      true,
    );
    expect(isPrismaUniqueConflict(new Error("unique"))).toBe(false);
    expect(isPrismaUniqueConflict({ code: "P2003" })).toBe(false);
  });
});

describe("awardXpForCorrectSolve", () => {
  const base = {
    userId: "u1",
    taskId: "task-1",
    topicId: "topic-1",
    topicSlug: "t1-logic",
    topicTitle: "Логика",
    grade: "low" as const,
    hintsOpenedCount: 0,
    wrongAttemptCount: 0,
  };

  it("первое начисление: create TaskXpAward + increment и debut", async () => {
    createXpAward.mockResolvedValue({ id: "aw-1" });
    updateUser.mockResolvedValue({ totalXp: 10 });
    findManyAttempt
      .mockResolvedValueOnce([{ taskId: "task-1" }])
      .mockResolvedValueOnce([{ taskId: "task-1" }]);

    const r = await awardXpForCorrectSolve(base);
    expect(r.xpGained).toBe(10);
    expect(r.totalXp).toBe(10);
    expect(r.newBadges.map((b) => b.code)).toEqual(["debut"]);
    expect(createXpAward).toHaveBeenCalledWith({
      data: { userId: "u1", taskId: "task-1", xpAmount: 10 },
    });
  });

  it("штрафы уменьшают XP (ceil)", async () => {
    createXpAward.mockResolvedValue({ id: "aw-1" });
    // mid 20 × 80% = 16
    updateUser.mockResolvedValue({ totalXp: 16 });
    findManyAttempt
      .mockResolvedValueOnce([{ taskId: "task-1" }])
      .mockResolvedValueOnce([{ taskId: "task-1" }]);

    const r = await awardXpForCorrectSolve({
      ...base,
      grade: "mid",
      hintsOpenedCount: 1,
      wrongAttemptCount: 1,
    });
    expect(r.xpGained).toBe(16);
    expect(createXpAward).toHaveBeenCalledWith({
      data: { userId: "u1", taskId: "task-1", xpAmount: 16 },
    });
  });

  it("P2002 на TaskXpAward — 0 XP (повтор / гонка)", async () => {
    createXpAward.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    findUniqueUser.mockResolvedValue({ totalXp: 10 });
    findManyAttempt
      .mockResolvedValueOnce([{ taskId: "task-1" }])
      .mockResolvedValueOnce([{ taskId: "task-1" }]);
    createBadge.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));

    const r = await awardXpForCorrectSolve(base);
    expect(r.xpGained).toBe(0);
    expect(r.totalXp).toBe(10);
    expect(r.newBadges).toEqual([]);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("не-P2002 при create award — пробрасывает", async () => {
    createXpAward.mockRejectedValue(Object.assign(new Error("IO"), { code: "P1001" }));
    await expect(awardXpForCorrectSolve(base)).rejects.toMatchObject({ code: "P1001" });
  });

  it("не-P2002 при create badge — пробрасывает", async () => {
    createXpAward.mockResolvedValue({ id: "aw-1" });
    updateUser.mockResolvedValue({ totalXp: 10 });
    findManyAttempt
      .mockResolvedValueOnce([{ taskId: "task-1" }])
      .mockResolvedValueOnce([{ taskId: "task-1" }]);
    createBadge.mockRejectedValue(Object.assign(new Error("FK"), { code: "P2003" }));

    await expect(awardXpForCorrectSolve(base)).rejects.toMatchObject({ code: "P2003" });
  });

  it("при ≥5 верных в теме выдаёт technique:<slug>", async () => {
    createXpAward.mockResolvedValue({ id: "aw-1" });
    updateUser.mockResolvedValue({ totalXp: 20 });
    const five = Array.from({ length: 5 }, (_, i) => ({ taskId: `t${i}` }));
    findManyAttempt.mockResolvedValueOnce(five).mockResolvedValueOnce(five);

    const r = await awardXpForCorrectSolve({ ...base, grade: "mid" });
    expect(r.xpGained).toBe(20);
    expect(r.newBadges.map((b) => b.code)).toContain("technique:t1-logic");
    expect(r.newBadges.find((b) => b.code === "technique:t1-logic")?.title).toBe(
      "Приёмы: Логика",
    );
  });
});
