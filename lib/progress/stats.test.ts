/**
 * Unit: агрегации статистики (iter 14).
 */
import { describe, expect, it } from "vitest";
import {
  attemptDayKey,
  buildPersonalStats,
  buildTopicStatsRow,
  countActiveDays,
  countTopicsComplete,
  countUniqueSolvedInBank,
  rankFamilyMembers,
} from "./stats";

describe("attemptDayKey / countActiveDays", () => {
  it("считает уникальные UTC-дни", () => {
    expect(attemptDayKey(new Date("2026-09-14T10:00:00.000Z"))).toBe("2026-09-14");
    expect(
      countActiveDays([
        { createdAt: "2026-09-14T01:00:00.000Z" },
        { createdAt: "2026-09-14T23:00:00.000Z" },
        { createdAt: "2026-09-15T00:30:00.000Z" },
      ]),
    ).toBe(2);
  });
});

describe("buildTopicStatsRow", () => {
  const tasks = [
    { id: "a", grade: "low" },
    { id: "b", grade: "mid" },
    { id: "c", grade: "high" },
  ];

  it("прогресс, ошибки, reveal, estMinutes по решённым", () => {
    const row = buildTopicStatsRow({
      topicSlug: "t1",
      topicTitle: "Логика",
      topicOrder: 1,
      tasks,
      attempts: [
        { taskId: "a", isCorrect: false, createdAt: "2026-09-14T10:00:00.000Z" },
        { taskId: "a", isCorrect: false, createdAt: "2026-09-14T11:00:00.000Z" },
        { taskId: "a", isCorrect: true, createdAt: "2026-09-14T12:00:00.000Z" },
        { taskId: "b", isCorrect: true, createdAt: "2026-09-15T12:00:00.000Z" },
      ],
      revealedTaskIds: ["a", "c"],
    });
    expect(row.totalTasks).toBe(3);
    expect(row.solvedTasks).toBe(2);
    expect(row.percent).toBe(66);
    expect(row.wrongAttempts).toBe(2);
    expect(row.revealedTasks).toBe(2);
    // low 2 + mid 6
    expect(row.estimatedMinutes).toBe(8);
  });

  it("игнорирует Attempt чужих taskId", () => {
    const row = buildTopicStatsRow({
      topicSlug: "t1",
      topicTitle: "T",
      topicOrder: 0,
      tasks: [{ id: "a", grade: "low" }],
      attempts: [{ taskId: "other", isCorrect: false, createdAt: "2026-09-14T10:00:00.000Z" }],
      revealedTaskIds: ["other"],
    });
    expect(row.wrongAttempts).toBe(0);
    expect(row.revealedTasks).toBe(0);
    expect(row.solvedTasks).toBe(0);
  });
});

describe("buildPersonalStats", () => {
  it("суммирует темы, дни, reinforce-бейджи", () => {
    const summary = buildPersonalStats({
      totalXp: 40,
      allAttempts: [
        { createdAt: "2026-09-14T10:00:00.000Z" },
        { createdAt: "2026-09-15T10:00:00.000Z" },
      ],
      badgeCodes: ["debut", "session_reinforced:pkg-1", "session_reinforced:pkg-2", "steady"],
      topics: [
        {
          topicSlug: "t2",
          topicTitle: "B",
          topicOrder: 2,
          tasks: [{ id: "x", grade: "low" }],
          attempts: [{ taskId: "x", isCorrect: true, createdAt: "2026-09-15T10:00:00.000Z" }],
          revealedTaskIds: [],
        },
        {
          topicSlug: "t1",
          topicTitle: "A",
          topicOrder: 1,
          tasks: [
            { id: "a", grade: "low" },
            { id: "b", grade: "low" },
          ],
          attempts: [{ taskId: "a", isCorrect: true, createdAt: "2026-09-14T10:00:00.000Z" }],
          revealedTaskIds: [],
        },
      ],
    });
    expect(summary.totalXp).toBe(40);
    expect(summary.activeDays).toBe(2);
    expect(summary.reinforceCompletions).toBe(2);
    expect(summary.uniqueTasksSolved).toBe(2);
    expect(summary.topics.map((t) => t.topicSlug)).toEqual(["t1", "t2"]);
    expect(summary.reinforceRuns).toEqual([]);
  });
});

describe("rankFamilyMembers / countTopicsComplete / countUniqueSolvedInBank", () => {
  it("сортирует по XP, затем по уникальным", () => {
    const ranked = rankFamilyMembers(
      [
        { userId: "u2", displayLabel: "Б", totalXp: 10, uniqueTasksSolved: 5, topicsComplete: 0 },
        { userId: "u1", displayLabel: "А", totalXp: 30, uniqueTasksSolved: 2, topicsComplete: 1 },
        { userId: "u3", displayLabel: "В", totalXp: 10, uniqueTasksSolved: 9, topicsComplete: 0 },
      ],
      "u3",
    );
    expect(ranked.map((r) => r.userId)).toEqual(["u1", "u3", "u2"]);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.isCurrent).toBe(true);
    expect(ranked[1]!.rank).toBe(2);
  });

  it("countTopicsComplete только пройденные темы с задачами", () => {
    expect(
      countTopicsComplete([
        { percent: 100, totalTasks: 10 },
        { percent: 100, totalTasks: 0 },
        { percent: 90, totalTasks: 10 },
      ]),
    ).toBe(1);
    expect(
      countTopicsComplete([
        { totalTasks: 10, solvedTasks: 10 },
        { totalTasks: 5, solvedTasks: 4 },
        { totalTasks: 0, solvedTasks: 0 },
      ]),
    ).toBe(1);
    // При наличии solvedTasks percent не решает (не MODE-09 / не % floor).
    expect(
      countTopicsComplete([{ percent: 100, totalTasks: 10, solvedTasks: 9 }]),
    ).toBe(0);
  });

  it("I14-01: unique в банке = сумма solvedTasks тем (не orphan Attempt)", () => {
    const rows = [
      buildTopicStatsRow({
        topicSlug: "t1",
        topicTitle: "A",
        topicOrder: 1,
        tasks: [{ id: "a", grade: "low" }],
        attempts: [
          { taskId: "a", isCorrect: true, createdAt: "2026-09-14T10:00:00.000Z" },
          { taskId: "deleted-orphan", isCorrect: true, createdAt: "2026-09-14T11:00:00.000Z" },
        ],
        revealedTaskIds: [],
      }),
    ];
    expect(rows[0]!.solvedTasks).toBe(1);
    expect(countUniqueSolvedInBank(rows)).toBe(1);
  });
});
