/**
 * Unit: P-VARIANT-AFTER-CORRECT — смена только после верного ответа на текущем instance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  findFirstTask,
  countInstances,
  findCorrect,
  resolveMock,
  revalidateMock,
  assertNotTestMock,
  readModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  findFirstTask: vi.fn(),
  countInstances: vi.fn(),
  findCorrect: vi.fn(),
  resolveMock: vi.fn(),
  revalidateMock: vi.fn(),
  assertNotTestMock: vi.fn(),
  readModeMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findFirst: findFirstTask },
    taskInstance: { count: countInstances },
    attempt: { findFirst: findCorrect },
  },
}));
vi.mock("@/lib/content/instance-resolve", () => ({
  resolveTaskInstance: resolveMock,
}));
vi.mock("@/lib/modes/assert-learn", () => ({
  assertNotTestMode: assertNotTestMock,
}));
vi.mock("@/lib/modes/actions", () => ({
  readBlockModeFromCookies: readModeMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { getOtherVariantUiState, requestOtherTaskVariantAction } from "./request-other-variant";

const LOCKED = {
  ok: false,
  error: "Сначала реши текущий вариант верно — потом можно сменить условие",
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  findFirstTask.mockResolvedValue({ id: "tid" });
  countInstances.mockResolvedValue(3);
  assertNotTestMock.mockResolvedValue({ ok: true });
  readModeMock.mockResolvedValue("learn");
  // clearAllMocks не чистит очередь mockResolvedValueOnce — иначе остаток «i2» перетекает в следующий тест.
  resolveMock.mockReset();
  resolveMock
    .mockResolvedValueOnce({ id: "i1" }) // current
    .mockResolvedValueOnce({ id: "i2" }); // after forceNew
  findCorrect.mockResolvedValue(null);
});

describe("requestOtherTaskVariantAction", () => {
  it("первый визит без верного ответа — отказ, forceNew не вызывается", async () => {
    const r = await requestOtherTaskVariantAction("t1-logic", "t1-bel20-squirrel-colors");
    expect(r).toEqual(LOCKED);
    expect(resolveMock).toHaveBeenCalledTimes(1); // только current
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("после верного на текущем — forceNew и новый instance", async () => {
    findCorrect.mockResolvedValue({ id: "a1" });
    const r = await requestOtherTaskVariantAction("t1-logic", "t1-bel20-squirrel-colors");
    expect(r).toEqual({ ok: true, instanceId: "i2" });
    expect(resolveMock).toHaveBeenLastCalledWith("tid", "u1", {
      forceNew: true,
      mode: "learn",
    });
  });

  it("верный ищется именно по текущему instance", async () => {
    findCorrect.mockResolvedValue({ id: "a1" });
    await requestOtherTaskVariantAction("t1-logic", "t1-bel20-squirrel-colors");
    expect(findCorrect).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", taskInstanceId: "i1", isCorrect: true }),
      }),
    );
  });

  it("пул < 2 — отказ без проверки попыток", async () => {
    countInstances.mockResolvedValue(1);
    const r = await requestOtherTaskVariantAction("t1-logic", "t1-bel20-squirrel-colors");
    expect(r).toEqual({ ok: false, error: "Для этой задачи нет других вариантов" });
    expect(findCorrect).not.toHaveBeenCalled();
  });
});

describe("getOtherVariantUiState", () => {
  it("allowed=false, пока на текущем нет верного", async () => {
    const s = await getOtherVariantUiState("u1", "tid", "i1");
    expect(s).toEqual({ allowed: false, poolSize: 3 });
  });

  it("allowed=true после верного на текущем", async () => {
    findCorrect.mockResolvedValue({ id: "a1" });
    const s = await getOtherVariantUiState("u1", "tid", "i1");
    expect(s).toEqual({ allowed: true, poolSize: 3 });
  });

  it("allowed=false без текущего instance", async () => {
    const s = await getOtherVariantUiState("u1", "tid", null);
    expect(s).toEqual({ allowed: false, poolSize: 3 });
    expect(findCorrect).not.toHaveBeenCalled();
  });
});
