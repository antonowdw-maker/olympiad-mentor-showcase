/**
 * Unit: сервис плана дня (REQ-PLN-02/03/04, I7-02, 10c scopeKey) — мок Prisma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  topicFindUnique,
  topicFindMany,
  taskFindMany,
  packageFindMany,
  packageCreate,
  packageDelete,
  packageDeleteMany,
  packageUpdateMany,
  attemptFindMany,
  userFindUnique,
  transaction,
  txPackageFindMany,
  listPlanTopicChoicesMock,
} = vi.hoisted(() => ({
  txPackageFindMany: vi.fn(),
  topicFindUnique: vi.fn(),
  topicFindMany: vi.fn(),
  taskFindMany: vi.fn(),
  packageFindMany: vi.fn(),
  packageCreate: vi.fn(),
  packageDelete: vi.fn(),
  packageDeleteMany: vi.fn(),
  packageUpdateMany: vi.fn(),
  attemptFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  listPlanTopicChoicesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const dayPlanPackage = {
    findMany: packageFindMany,
    create: packageCreate,
    delete: packageDelete,
    deleteMany: packageDeleteMany,
    updateMany: packageUpdateMany,
  };
  const prisma = {
    topic: { findUnique: topicFindUnique, findMany: topicFindMany },
    task: { findMany: taskFindMany },
    user: { findUnique: userFindUnique },
    dayPlanPackage,
    attempt: { findMany: attemptFindMany },
    $transaction: transaction,
  };
  return { prisma };
});

vi.mock("@/lib/plan/topic-choices", () => ({
  listPlanTopicChoices: (...args: unknown[]) => listPlanTopicChoicesMock(...args),
}));

import {
  createGatherLearnPackage,
  createNewDayPlanPackage,
  ensureDayPlanForToday,
  getSolvedTaskSlugsForSelection,
  listDayPlanPackages,
  listGatherPackages,
} from "./service";

const DATE = "2026-09-09";
const TOPIC = {
  id: "topic-1",
  slug: "t1-logic",
  order: 1,
  tasks: [
    {
      slug: "t1",
      title: "Задача 1",
      order: 1,
      relatedDocSlugs: JSON.stringify(["doc-a"]),
      grade: "high",
    },
    {
      slug: "t2",
      title: "Задача 2",
      order: 2,
      relatedDocSlugs: JSON.stringify(["doc-b"]),
      grade: "mid",
    },
  ],
  articles: [
    { slug: "doc-a", title: "A", order: 1 },
    { slug: "doc-b", title: "B", order: 2 },
  ],
};

const TOPIC_B = {
  id: "topic-2",
  slug: "t2-parity",
  order: 2,
  tasks: [
    {
      slug: "p1",
      title: "Parity 1",
      order: 1,
      relatedDocSlugs: JSON.stringify(["doc-p"]),
      grade: "low",
    },
  ],
  articles: [{ slug: "doc-p", title: "P", order: 1 }],
};

function pkgRow(partial: {
  id: string;
  seq: number;
  status: string;
  items: unknown[];
  scopeKey?: string;
  topicId?: string;
}) {
  return {
    id: partial.id,
    seq: partial.seq,
    date: DATE,
    status: partial.status,
    items: JSON.stringify(partial.items),
    createdAt: new Date("2026-09-09T10:00:00Z"),
    userId: "u1",
    topicId: partial.topicId ?? TOPIC.id,
    scopeKey: partial.scopeKey ?? "topic:t1-logic",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  packageUpdateMany.mockResolvedValue({ count: 0 });
  userFindUnique.mockResolvedValue({ id: "u1" });
  // P-PLAN-UNSOLVED: и progress (id+slug), и exhausted (instances) в одном ответе.
  taskFindMany.mockResolvedValue([
    { id: "tid-t1", slug: "t1", instances: [{ id: "i1" }, { id: "i1b" }] },
    { id: "tid-t2", slug: "t2", instances: [{ id: "i2" }, { id: "i2b" }] },
    { id: "tid-p1", slug: "p1", instances: [{ id: "ip1" }, { id: "ip1b" }] },
  ]);
  listPlanTopicChoicesMock.mockResolvedValue([
    { slug: "t1-logic", title: "L", order: 1, hasUnsolved: true },
  ]);
  // В транзакции — только свежее чтение seq и create (тяжёлые чтения вне её).
  txPackageFindMany.mockResolvedValue([]);
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      dayPlanPackage: {
        findMany: txPackageFindMany,
        create: packageCreate,
      },
    };
    return fn(tx);
  });
});

describe("ensureDayPlanForToday (REQ-PLN-03)", () => {
  it("повторный ensure не создаёт второй пакет, если день уже есть", async () => {
    const existing = pkgRow({
      id: "p1",
      seq: 1,
      status: "normal",
      items: [
        { kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" },
        { kind: "article", slug: "doc-a", title: "A", estMinutes: 8, topicSlug: "t1-logic" },
      ],
    });

    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValue([existing]);
    attemptFindMany.mockResolvedValue([]);

    const result = await ensureDayPlanForToday("u1", "t1-logic", DATE);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p1");
    expect(packageCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("удаляет преждевременный caught_up, если в пакетах дня есть нерешённые", async () => {
    const normal = pkgRow({
      id: "p1",
      seq: 1,
      status: "normal",
      items: [{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" }],
    });
    const caught = pkgRow({
      id: "p2",
      seq: 2,
      status: "caught_up",
      items: [{ kind: "article", slug: "doc-a", title: "A", estMinutes: 8, topicSlug: "t1-logic" }],
    });

    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockImplementation(async () => {
      if (packageDelete.mock.calls.length > 0) return [normal];
      return [normal, caught];
    });
    attemptFindMany.mockResolvedValue([]);
    packageDelete.mockResolvedValue({ id: "p2" });

    const result = await ensureDayPlanForToday("u1", "t1-logic", DATE);
    expect(packageDelete).toHaveBeenCalledWith({ where: { id: "p2" } });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("normal");
    expect(packageCreate).not.toHaveBeenCalled();
  });
});

describe("createNewDayPlanPackage", () => {
  it("кнопочный путь: CURRENT_INCOMPLETE, если текущий пакет не закрыт", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    const incomplete = pkgRow({
      id: "p1",
      seq: 1,
      status: "normal",
      items: [
        { kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" },
        { kind: "task", slug: "t2", title: "2", estMinutes: 12, topicSlug: "t1-logic" },
      ],
    });
    packageFindMany.mockResolvedValue([incomplete]);
    attemptFindMany.mockResolvedValue([{ task: { slug: "t1" } }]);

    await expect(createNewDayPlanPackage("u1", "t1-logic", DATE)).rejects.toThrow(
      "CURRENT_INCOMPLETE",
    );
    expect(packageCreate).not.toHaveBeenCalled();
  });

  it("пишет scopeKey topic:<slug> при создании", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    attemptFindMany.mockResolvedValue([]);
    packageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new",
      ...data,
      createdAt: new Date("2026-09-09T10:00:00Z"),
    }));

    const dto = await createNewDayPlanPackage("u1", "t1-logic", DATE, {
      allowEmptyReview: true,
    });
    expect(packageCreate).toHaveBeenCalled();
    const data = packageCreate.mock.calls[0]![0].data;
    expect(data.scopeKey).toBe("topic:t1-logic");
    expect(dto.items.every((i) => i.topicSlug === "t1-logic")).toBe(true);
    // Короткая транзакция с увеличенным таймаутом: только seq + create.
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
      maxWait: 10_000,
    });
    expect(txPackageFindMany).toHaveBeenCalledTimes(1);
  });

  it("если пока считали пакет, параллельно дописали seq — create не вызывается (гонка до записи)", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    const winner = pkgRow({
      id: "won",
      seq: 1,
      status: "normal",
      items: [{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" }],
    });
    // pre-read [] → progress [] → после конфликта [winner]
    packageFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([winner]);
    txPackageFindMany.mockResolvedValueOnce([{ seq: 1 }]);
    attemptFindMany.mockResolvedValue([]);

    const dto = await createNewDayPlanPackage("u1", "t1-logic", DATE, {
      allowEmptyReview: true,
    });
    expect(dto.id).toBe("won");
    expect(packageCreate).not.toHaveBeenCalled();
  });

  it("FK-ошибка при create → USER_GONE", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValue([]);
    attemptFindMany.mockResolvedValue([]);
    packageCreate.mockRejectedValueOnce(
      Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }),
    );

    await expect(
      createNewDayPlanPackage("u1", "t1-logic", DATE, { allowEmptyReview: true }),
    ).rejects.toThrow("USER_GONE");
  });

  it("P2002 при ensure возвращает уже созданный пакет, не пишет seq+1 (10C-05)", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    const winner = pkgRow({
      id: "won",
      seq: 1,
      status: "normal",
      items: [{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" }],
    });
    // progress → pre-create → after P2002
    packageFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([winner]);
    attemptFindMany.mockResolvedValue([]);
    const err = Object.assign(new Error("Unique"), { code: "P2002" });
    packageCreate.mockRejectedValueOnce(err);

    const dto = await createNewDayPlanPackage("u1", "t1-logic", DATE, {
      allowEmptyReview: true,
    });
    expect(dto.id).toBe("won");
    expect(packageCreate).toHaveBeenCalledTimes(1);
  });

  it("P2002 при кнопке не создаёт дубликат seq+1 (10C-05)", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    const closed = pkgRow({
      id: "p1",
      seq: 1,
      status: "normal",
      items: [{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" }],
    });
    const raced = pkgRow({
      id: "p2",
      seq: 2,
      status: "normal",
      items: [{ kind: "task", slug: "t2", title: "2", estMinutes: 6, topicSlug: "t1-logic" }],
    });
    // pre-read(closed) → progress(closed) → after P2002(closed+raced) → progressNow
    packageFindMany
      .mockResolvedValueOnce([closed])
      .mockResolvedValueOnce([closed])
      .mockResolvedValueOnce([closed, raced])
      .mockResolvedValueOnce([closed, raced]);
    txPackageFindMany.mockResolvedValueOnce([{ seq: 1 }]);
    attemptFindMany.mockResolvedValue([{ taskId: "tid-t1" }]);
    packageCreate.mockRejectedValueOnce(Object.assign(new Error("Unique"), { code: "P2002" }));

    await expect(createNewDayPlanPackage("u1", "t1-logic", DATE)).rejects.toThrow(
      "CURRENT_INCOMPLETE",
    );
    expect(packageCreate).toHaveBeenCalledTimes(1);
  });
});

describe("mixed scope (10c)", () => {
  it("solved для mixed включает Attempt закрытой темы (10C-01)", async () => {
    // Открыта только t2; Attempt от закрытой t1 всё равно в наборе
    listPlanTopicChoicesMock.mockResolvedValue([
      { slug: "t1-logic", title: "L", order: 1, hasUnsolved: false },
      { slug: "t2-parity", title: "P", order: 2, hasUnsolved: true },
    ]);
    attemptFindMany.mockResolvedValue([
      { task: { slug: "t1" } },
      { task: { slug: "p1" } },
    ]);

    const solved = await getSolvedTaskSlugsForSelection("u1", "mixed");
    expect(solved.has("t1")).toBe(true);
    expect(solved.has("p1")).toBe(true);
    // Не фильтруем по open topicId
    expect(attemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", isCorrect: true },
      }),
    );
  });

  it("создаёт пакет с scopeKey=mixed из нескольких тем", async () => {
    listPlanTopicChoicesMock.mockResolvedValue([
      { slug: "t1-logic", title: "L", order: 1, hasUnsolved: true },
      { slug: "t2-parity", title: "P", order: 2, hasUnsolved: true },
    ]);
    topicFindMany.mockResolvedValue([TOPIC, TOPIC_B]);
    // progress + pre-create
    packageFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    attemptFindMany.mockResolvedValue([]);
    packageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "mx",
      ...data,
      createdAt: new Date("2026-09-09T10:00:00Z"),
    }));

    const dto = await createNewDayPlanPackage("u1", "mixed", DATE, { allowEmptyReview: true });
    expect(packageCreate.mock.calls[0]![0].data.scopeKey).toBe("mixed");
    expect(dto.scopeKey).toBe("mixed");
    const taskTopics = new Set(
      dto.items.filter((i) => i.kind === "task").map((i) => i.topicSlug),
    );
    expect(taskTopics.size).toBeGreaterThanOrEqual(2);
    expect(taskTopics.has("t1-logic")).toBe(true);
    expect(taskTopics.has("t2-parity")).toBe(true);
  });
});

describe("createGatherLearnPackage (13A)", () => {
  it("первый gather пишет scopeKey=gather", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    topicFindMany.mockResolvedValue([{ id: TOPIC.id }]);
    attemptFindMany.mockResolvedValue([]);
    packageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "g1",
      ...data,
      createdAt: new Date("2026-09-09T10:00:00Z"),
    }));

    const dto = await createGatherLearnPackage("u1", ["t1-logic"], DATE);
    expect(packageCreate.mock.calls[0]![0].data.scopeKey).toBe("gather");
    expect(dto.scopeKey).toBe("gather");
    expect(dto.items.some((i) => i.kind === "task")).toBe(true);
  });

  it("неполный текущий gather → CURRENT_INCOMPLETE", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValue([
      pkgRow({
        id: "g1",
        seq: 1,
        status: "normal",
        scopeKey: "gather",
        items: [
          { kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" },
          { kind: "task", slug: "t2", title: "2", estMinutes: 12, topicSlug: "t1-logic" },
        ],
      }),
    ]);
    topicFindMany.mockResolvedValue([{ id: TOPIC.id }]);
    attemptFindMany.mockResolvedValue([{ task: { slug: "t1" } }]);

    await expect(createGatherLearnPackage("u1", ["t1-logic"], DATE)).rejects.toThrow(
      "CURRENT_INCOMPLETE",
    );
    expect(packageCreate).not.toHaveBeenCalled();
  });

  it("после полного gather по T1 позволяет новый сбор по T2 (I13A-01 / I13A-R2-01)", async () => {
    topicFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      if (where.slug === "t1-logic") return TOPIC;
      if (where.slug === "t2-parity") return TOPIC_B;
      return null;
    });
    packageFindMany.mockResolvedValue([
      pkgRow({
        id: "g1",
        seq: 1,
        status: "normal",
        scopeKey: "gather",
        items: [
          { kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" },
          { kind: "task", slug: "t2", title: "2", estMinutes: 12, topicSlug: "t1-logic" },
        ],
      }),
    ]);
    txPackageFindMany.mockResolvedValueOnce([{ seq: 1 }]);
    // Exhausted: topicFindMany по slug; progress: Attempt по taskId после создания пакета.
    topicFindMany.mockImplementation(async ({ where }: { where: { slug?: { in: string[] }; id?: string } }) => {
      if (where.slug?.in) {
        const slugs = where.slug.in;
        return [
          ...(slugs.includes("t1-logic") ? [{ id: TOPIC.id }] : []),
          ...(slugs.includes("t2-parity") ? [{ id: TOPIC_B.id }] : []),
        ];
      }
      return [];
    });
    attemptFindMany.mockResolvedValue([{ taskId: "tid-t1" }, { taskId: "tid-t2" }]);
    packageCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "g2",
      ...data,
      createdAt: new Date("2026-09-09T11:00:00Z"),
    }));

    const dto = await createGatherLearnPackage("u1", ["t2-parity"], DATE);
    expect(dto.id).toBe("g2");
    expect(packageCreate.mock.calls[0]![0].data.seq).toBe(2);
    expect(packageCreate.mock.calls[0]![0].data.scopeKey).toBe("gather");

    const gatingCall = topicFindMany.mock.calls.find(
      (c) => Array.isArray(c[0]?.where?.slug?.in),
    );
    expect(gatingCall).toBeTruthy();
    expect([...(gatingCall![0].where.slug.in as string[])].sort()).toEqual(
      ["t1-logic", "t2-parity"].sort(),
    );
  });

  it("смесь существующего и несуществующего slug → TOPIC_NOT_FOUND (I13A-04)", async () => {
    topicFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => {
      if (where.slug === "t1-logic") return TOPIC;
      return null;
    });

    await expect(
      createGatherLearnPackage("u1", ["t1-logic", "no-such-topic"], DATE),
    ).rejects.toThrow("TOPIC_NOT_FOUND");
    expect(packageCreate).not.toHaveBeenCalled();
  });

  it("P2002 при любой гонке → GATHER_RACE_CONFLICT (I13A-R3-01)", async () => {
    topicFindUnique.mockResolvedValue(TOPIC);
    packageFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    topicFindMany.mockResolvedValue([{ id: TOPIC.id }]);
    attemptFindMany.mockResolvedValue([]);
    packageCreate.mockRejectedValueOnce(Object.assign(new Error("Unique"), { code: "P2002" }));

    await expect(createGatherLearnPackage("u1", ["t1-logic"], DATE)).rejects.toThrow(
      "GATHER_RACE_CONFLICT",
    );
  });

  it("listGatherPackages фильтрует только gather", async () => {
    packageFindMany.mockResolvedValue([
      pkgRow({
        id: "g1",
        seq: 1,
        status: "normal",
        scopeKey: "gather",
        items: [{ kind: "task", slug: "t1", title: "1", estMinutes: 12, topicSlug: "t1-logic" }],
      }),
    ]);
    const list = await listGatherPackages("u1", DATE);
    expect(packageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", scopeKey: "gather", date: DATE },
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.scopeKey).toBe("gather");
  });

  it("listDayPlanPackages(gather) → GATHER_NOT_DAY_PLAN (I13A-R2-04)", async () => {
    await expect(listDayPlanPackages("u1", "gather", DATE)).rejects.toThrow("GATHER_NOT_DAY_PLAN");
    expect(packageFindMany).not.toHaveBeenCalled();
  });
});
