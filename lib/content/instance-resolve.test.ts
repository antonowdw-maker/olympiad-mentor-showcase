/**
 * Unit: выбор instance при заходе с плана (PPV-02) и после верного ответа (REQ-INST-02).
 * Верный ответ «только что» не должен подменять вариант — дальше кнопка «Другой вариант».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { instanceFindMany, showFindMany, showUpsert, attemptFindMany, attemptFindFirst } =
  vi.hoisted(() => ({
    instanceFindMany: vi.fn(),
    showFindMany: vi.fn(),
    showUpsert: vi.fn(),
    attemptFindMany: vi.fn(),
    attemptFindFirst: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    taskInstance: { findMany: instanceFindMany },
    userTaskInstanceShow: { findMany: showFindMany, upsert: showUpsert },
    attempt: { findMany: attemptFindMany, findFirst: attemptFindFirst },
  },
}));

import { resolveTaskInstance } from "./instance-resolve";

const inst = (id: string, order: number) => ({
  id,
  slug: `i${order}`,
  order,
  statement: `условие ${id}`,
  acceptedAnswers: "[]",
  options: null,
  hintSteps: "[]",
});

const PLAN_CREATED = new Date("2026-09-25T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  instanceFindMany.mockResolvedValue([inst("a", 0), inst("b", 1), inst("c", 2)]);
  // Последний показ — «a», он решён верно.
  showFindMany.mockResolvedValue([
    { taskInstanceId: "a", shownAt: new Date("2026-09-25T09:00:00Z"), openedCount: 0 },
  ]);
  attemptFindMany.mockResolvedValue([{ taskInstanceId: "a" }]);
  showUpsert.mockResolvedValue({ openedCount: 0 });
});

describe("resolveTaskInstance — заход с плана", () => {
  it("вариант решён только что (после создания пакета) — остаётся тем же", async () => {
    attemptFindFirst.mockResolvedValue({ createdAt: new Date("2026-09-25T10:30:00Z") });

    const r = await resolveTaskInstance("task-1", "u1", { unstickIfSolvedBefore: PLAN_CREATED });

    expect(r?.id).toBe("a");
    expect(showUpsert).not.toHaveBeenCalled();
  });

  it("вариант решён до создания пакета — выдаётся нерешённый (PPV-02)", async () => {
    attemptFindFirst.mockResolvedValue({ createdAt: new Date("2026-09-24T18:00:00Z") });

    const r = await resolveTaskInstance("task-1", "u1", { unstickIfSolvedBefore: PLAN_CREATED });

    expect(r?.id).not.toBe("a");
    expect(showUpsert).toHaveBeenCalledTimes(1);
  });

  it("без плана решённый вариант держится (revalidate после «Проверить»)", async () => {
    const r = await resolveTaskInstance("task-1", "u1");

    expect(r?.id).toBe("a");
    expect(attemptFindFirst).not.toHaveBeenCalled();
    expect(showUpsert).not.toHaveBeenCalled();
  });
});
