/**
 * Unit: награда за закрепление — MODE-09 порог + I13BC-02.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueSession,
  updateUser,
  findUniqueUser,
  updateManySession,
  findManyItems,
  findManyTasks,
  createBadge,
  transaction,
} = vi.hoisted(() => ({
  findUniqueSession: vi.fn(),
  updateUser: vi.fn(),
  findUniqueUser: vi.fn(),
  updateManySession: vi.fn(),
  findManyItems: vi.fn(),
  findManyTasks: vi.fn(),
  createBadge: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  reinforceSession: { findUnique: findUniqueSession, updateMany: updateManySession },
  reinforceSessionItem: { findMany: findManyItems },
  task: { findMany: findManyTasks },
  user: { update: updateUser, findUnique: findUniqueUser },
  userBadge: { create: createBadge },
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: transaction },
}));

import { awardReinforceSessionReward } from "./award";
import {
  SESSION_REINFORCE_XP,
  sessionReinforcedBadgeCode,
  sessionReinforcedBadgeTitle,
} from "@/lib/progress/xp";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  createBadge.mockResolvedValue({});
  findManyItems.mockResolvedValue([
    { answeredAt: new Date(), isCorrect: true, taskId: "t1" },
  ]);
  findManyTasks.mockResolvedValue([{ id: "t1", grade: "mid" }]);
  updateManySession.mockResolvedValue({ count: 1 });
  findUniqueUser.mockResolvedValue({ totalXp: 25 });
});

describe("awardReinforceSessionReward", () => {
  const input = {
    userId: "u1",
    sessionId: "s1",
    sourcePackageId: "pkg-1",
  };

  it("сдан (все верно): claim → +XP + бейдж", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: null,
      status: "active",
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
    });
    updateUser.mockResolvedValue({ totalXp: 35 });

    const r = await awardReinforceSessionReward(input);
    expect(r.xpGained).toBe(SESSION_REINFORCE_XP);
    expect(SESSION_REINFORCE_XP).toBe(10);
    expect(r.rewarded).toBe(true);
    expect(r.completed).toBe(true);
    expect(r.pass?.passed).toBe(true);
    expect(r.badge).toEqual({
      code: sessionReinforcedBadgeCode("pkg-1"),
      title: sessionReinforcedBadgeTitle(),
    });
    expect(updateManySession).toHaveBeenCalledWith({
      where: {
        id: "s1",
        userId: "u1",
        status: "active",
      },
      data: expect.objectContaining({
        status: "completed",
        rewardGrantedAt: expect.any(Date),
      }),
    });
  });

  it("ниже порога: completed без XP/бейджа", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: null,
      status: "active",
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
    });
    findManyItems.mockResolvedValue([
      { answeredAt: new Date(), isCorrect: true, taskId: "t1" },
      { answeredAt: new Date(), isCorrect: false, taskId: "t2" },
      { answeredAt: new Date(), isCorrect: false, taskId: "t3" },
      { answeredAt: new Date(), isCorrect: false, taskId: "t4" },
    ]);
    findManyTasks.mockResolvedValue([
      { id: "t1", grade: "mid" },
      { id: "t2", grade: "mid" },
      { id: "t3", grade: "mid" },
      { id: "t4", grade: "mid" },
    ]);

    const r = await awardReinforceSessionReward(input);
    expect(r).toMatchObject({
      xpGained: 0,
      completed: true,
      rewarded: false,
      badge: null,
    });
    expect(r.pass).toEqual({ score: 2, maxScore: 8, threshold: 6, passed: false });
    expect(updateUser).not.toHaveBeenCalled();
    expect(createBadge).not.toHaveBeenCalled();
  });

  it("порог набран при ошибке: награда есть", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: null,
      status: "active",
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
    });
    findManyItems.mockResolvedValue([
      { answeredAt: new Date(), isCorrect: true, taskId: "t1" },
      { answeredAt: new Date(), isCorrect: true, taskId: "t2" },
      { answeredAt: new Date(), isCorrect: true, taskId: "t3" },
      { answeredAt: new Date(), isCorrect: false, taskId: "t4" },
    ]);
    findManyTasks.mockResolvedValue([
      { id: "t1", grade: "mid" },
      { id: "t2", grade: "mid" },
      { id: "t3", grade: "mid" },
      { id: "t4", grade: "mid" },
    ]);
    updateUser.mockResolvedValue({ totalXp: 35 });

    const r = await awardReinforceSessionReward(input);
    expect(r.rewarded).toBe(true);
    expect(r.xpGained).toBe(10);
    expect(r.pass?.passed).toBe(true);
    expect(updateUser).toHaveBeenCalled();
  });

  it("повтор после rewardGrantedAt → 0 XP", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: new Date(),
      status: "completed",
    });

    const r = await awardReinforceSessionReward(input);
    expect(r.xpGained).toBe(0);
    expect(r.rewarded).toBe(false);
    expect(updateManySession).not.toHaveBeenCalled();
  });

  it("status skipped → 0 XP", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: null,
      status: "skipped",
    });

    const r = await awardReinforceSessionReward(input);
    expect(r.xpGained).toBe(0);
    expect(r.completed).toBe(false);
    expect(updateManySession).not.toHaveBeenCalled();
  });

  it("не все вопросы отвечены → 0 XP, не completed", async () => {
    findUniqueSession.mockResolvedValue({
      id: "s1",
      userId: "u1",
      rewardGrantedAt: null,
      status: "active",
      createdAt: new Date("2026-09-19T10:00:00.000Z"),
    });
    findManyItems.mockResolvedValue([
      { answeredAt: new Date(), isCorrect: true, taskId: "t1" },
      { answeredAt: null, isCorrect: null, taskId: "t2" },
    ]);
    findManyTasks.mockResolvedValue([
      { id: "t1", grade: "mid" },
      { id: "t2", grade: "mid" },
    ]);

    const r = await awardReinforceSessionReward(input);
    expect(r).toMatchObject({ xpGained: 0, completed: false, rewarded: false, pass: null });
    expect(updateManySession).not.toHaveBeenCalled();
  });
});
