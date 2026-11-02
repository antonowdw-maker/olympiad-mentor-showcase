import { describe, expect, it } from "vitest";
import { calculateTopicProgress, isTopicCompleted } from "@/lib/progress/calculate";

describe("isTopicCompleted", () => {
  it("false при пустой теме или нулевом total", () => {
    expect(isTopicCompleted({ totalTasks: 0, solvedTasks: 0 })).toBe(false);
    expect(isTopicCompleted({ totalTasks: 0, solvedTasks: 5 })).toBe(false);
  });

  it("false пока не все каноны решены", () => {
    expect(isTopicCompleted({ totalTasks: 30, solvedTasks: 0 })).toBe(false);
    expect(isTopicCompleted({ totalTasks: 30, solvedTasks: 29 })).toBe(false);
  });

  it("true когда все каноны решены", () => {
    expect(isTopicCompleted({ totalTasks: 30, solvedTasks: 30 })).toBe(true);
    expect(isTopicCompleted({ totalTasks: 1, solvedTasks: 2 })).toBe(true);
  });
});

describe("calculateTopicProgress", () => {
  it("возвращает 0 при пустой теме", () => {
    expect(calculateTopicProgress({ totalTasks: 0, solvedTaskIds: [] })).toEqual({
      totalTasks: 0,
      solvedTasks: 0,
      percent: 0,
    });
  });

  it("считает долю решённых задач с округлением вниз", () => {
    expect(
      calculateTopicProgress({
        totalTasks: 3,
        solvedTaskIds: ["a"],
      }),
    ).toEqual({ totalTasks: 3, solvedTasks: 1, percent: 33 });
  });

  it("дедуплицирует id задач", () => {
    expect(
      calculateTopicProgress({
        totalTasks: 2,
        solvedTaskIds: ["a", "a", "b"],
      }),
    ).toEqual({ totalTasks: 2, solvedTasks: 2, percent: 100 });
  });

  it("не даёт solvedTasks больше totalTasks", () => {
    expect(
      calculateTopicProgress({
        totalTasks: 1,
        solvedTaskIds: ["a", "b"],
      }),
    ).toEqual({ totalTasks: 1, solvedTasks: 1, percent: 100 });
  });
});
