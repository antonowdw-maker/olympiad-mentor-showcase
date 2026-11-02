/**
 * Unit: завершённость учебного пакета (13A).
 */
import { describe, expect, it } from "vitest";
import {
  collectTopicSlugsFromPlanItems,
  findLastCompletedLearnPackage,
  isGatherPlanScope,
  isLearnPackageComplete,
  PLAN_SCOPE_GATHER,
} from "./learn-session";
import type { PlanItem } from "./build";

const items: PlanItem[] = [
  { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
  { kind: "task", slug: "b", title: "B", estMinutes: 6, topicSlug: "t1" },
  { kind: "article", slug: "doc", title: "D", estMinutes: 8, topicSlug: "t1" },
];

describe("isLearnPackageComplete", () => {
  it("false пока не все задачи верны", () => {
    expect(isLearnPackageComplete(items, new Set(["a"]))).toBe(false);
    expect(isLearnPackageComplete(items, new Set())).toBe(false);
  });

  it("true когда все задачи пакета решены (статьи не мешают)", () => {
    expect(isLearnPackageComplete(items, new Set(["a", "b"]))).toBe(true);
  });

  it("false на пустом списке задач", () => {
    expect(
      isLearnPackageComplete(
        [{ kind: "article", slug: "d", title: "D", estMinutes: 8, topicSlug: "t1" }],
        new Set(),
      ),
    ).toBe(false);
  });
});

describe("isGatherPlanScope", () => {
  it("recognizes gather", () => {
    expect(isGatherPlanScope(PLAN_SCOPE_GATHER)).toBe(true);
    expect(isGatherPlanScope("mixed")).toBe(false);
  });
});

describe("collectTopicSlugsFromPlanItems", () => {
  it("собирает уникальные темы", () => {
    expect(
      collectTopicSlugsFromPlanItems([
        { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
        { kind: "task", slug: "b", title: "B", estMinutes: 6, topicSlug: "t2" },
        { kind: "task", slug: "c", title: "C", estMinutes: 6, topicSlug: "t1" },
      ]).sort(),
    ).toEqual(["t1", "t2"]);
  });
});

describe("findLastCompletedLearnPackage", () => {
  it("находит последний пройденный normal, даже если current — review", () => {
    const packages = [
      {
        id: "p1",
        status: "normal" as const,
        items: [
          { kind: "task" as const, slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
        ],
      },
      {
        id: "p2",
        status: "caught_up" as const,
        items: [
          { kind: "article" as const, slug: "d", title: "D", estMinutes: 8, topicSlug: "t1" },
        ],
      },
    ];
    const found = findLastCompletedLearnPackage(packages, new Set(["a"]));
    expect(found?.id).toBe("p1");
  });

  it("null если normal не завершён", () => {
    const packages = [
      {
        id: "p1",
        status: "normal" as const,
        items: [
          { kind: "task" as const, slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
          { kind: "task" as const, slug: "b", title: "B", estMinutes: 6, topicSlug: "t1" },
        ],
      },
    ];
    expect(findLastCompletedLearnPackage(packages, new Set(["a"]))).toBeNull();
  });
});
