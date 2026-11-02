/**
 * Unit: сессии наставника + парсинг эталонов темы (BC-01/02/03).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert, count, findMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    mentorSession: { findUnique, upsert },
    mentorMessage: { count, findMany },
  },
}));

import {
  getOrCreateTaskMentorSession,
  getOrCreateTopicMentorSession,
  loadMentorPromptHistory,
  mentorTaskScopeKey,
  mentorTopicScopeKey,
  parseTopicAnswerGroups,
} from "./session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scopeKey helpers", () => {
  it("строит стабильные ключи", () => {
    expect(mentorTaskScopeKey("t1")).toBe("task:t1");
    expect(mentorTaskScopeKey("t1", "i2")).toBe("task:t1:inst:i2");
    expect(mentorTopicScopeKey("top1")).toBe("topic:top1");
  });
});

describe("getOrCreateTopicMentorSession", () => {
  it("upsert по userId+scopeKey topic", async () => {
    upsert.mockResolvedValue({ id: "sess-1" });
    const s = await getOrCreateTopicMentorSession("u1", "topic-1");
    expect(s).toEqual({ id: "sess-1" });
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_scopeKey: { userId: "u1", scopeKey: "topic:topic-1" } },
      create: {
        userId: "u1",
        topicId: "topic-1",
        taskId: null,
        scopeKey: "topic:topic-1",
      },
      update: {},
      select: { id: true },
    });
  });
});

describe("getOrCreateTaskMentorSession", () => {
  it("upsert по userId+scopeKey task", async () => {
    upsert.mockResolvedValue({ id: "sess-t" });
    const s = await getOrCreateTaskMentorSession("u1", "task-1", "topic-1");
    expect(s).toEqual({ id: "sess-t" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_scopeKey: { userId: "u1", scopeKey: "task:task-1" } },
      }),
    );
  });

  it("отдельный scopeKey для instance", async () => {
    upsert.mockResolvedValue({ id: "sess-i" });
    await getOrCreateTaskMentorSession("u1", "task-1", "topic-1", "inst-2");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_scopeKey: {
            userId: "u1",
            scopeKey: "task:task-1:inst:inst-2",
          },
        },
      }),
    );
  });
});

describe("loadMentorPromptHistory (BC-03)", () => {
  it("считает userTurns отдельно от take истории", async () => {
    count.mockResolvedValue(35);
    findMany.mockResolvedValue([
      { role: "assistant", body: "a2" },
      { role: "user", body: "u2" },
      { role: "assistant", body: "a1" },
      { role: "user", body: "u1" },
    ]);
    const r = await loadMentorPromptHistory("sess-1", 4);
    expect(r.userTurns).toBe(35);
    expect(r.history).toEqual([
      { role: "user", body: "u1" },
      { role: "assistant", body: "a1" },
      { role: "user", body: "u2" },
      { role: "assistant", body: "a2" },
    ]);
    expect(count).toHaveBeenCalledWith({
      where: { sessionId: "sess-1", role: "user" },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    );
  });
});

describe("parseTopicAnswerGroups (BC-01 fail closed)", () => {
  it("собирает группы по задачам", () => {
    const r = parseTopicAnswerGroups([
      { acceptedAnswers: JSON.stringify(["нет", "no"]) },
      { acceptedAnswers: JSON.stringify(["3"]) },
    ]);
    expect(r).toEqual({
      ok: true,
      groups: [
        ["нет", "no"],
        ["3"],
      ],
    });
  });

  it("отклоняет битый JSON", () => {
    const r = parseTopicAnswerGroups([{ acceptedAnswers: "{bad" }]);
    expect(r.ok).toBe(false);
  });

  it("отклоняет не-массив", () => {
    const r = parseTopicAnswerGroups([{ acceptedAnswers: JSON.stringify("да") }]);
    expect(r.ok).toBe(false);
  });
});
