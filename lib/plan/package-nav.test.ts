/**
 * Unit: соседи задач в пакете плана (gather / topic / mixed).
 */
import { describe, expect, it } from "vitest";
import { findPlanTaskNeighbors, planTaskHref } from "./package-nav";
import type { PlanItem } from "./build";

const pkg = (items: PlanItem[]) => ({ items });

describe("findPlanTaskNeighbors", () => {
  it("следующая задача в порядке пакета, не темы; статьи пропускает", () => {
    const packages = [
      pkg([
        { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
        { kind: "article", slug: "doc", title: "D", estMinutes: 8, topicSlug: "t1" },
        { kind: "task", slug: "b", title: "B", estMinutes: 6, topicSlug: "t2" },
      ]),
    ];
    const { prev, next } = findPlanTaskNeighbors(packages, "a");
    expect(prev).toBeNull();
    expect(next).toEqual({ slug: "b", title: "B", topicSlug: "t2" });
  });

  it("prev/next внутри пакета", () => {
    const packages = [
      pkg([
        { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
        { kind: "task", slug: "b", title: "B", estMinutes: 6, topicSlug: "t1" },
        { kind: "task", slug: "c", title: "C", estMinutes: 6, topicSlug: "t1" },
      ]),
    ];
    expect(findPlanTaskNeighbors(packages, "b")).toEqual({
      prev: { slug: "a", title: "A", topicSlug: "t1" },
      next: { slug: "c", title: "C", topicSlug: "t1" },
    });
  });

  it("последняя задача — next null", () => {
    const packages = [
      pkg([{ kind: "task", slug: "z", title: "Z", estMinutes: 6, topicSlug: "t1" }]),
    ];
    expect(findPlanTaskNeighbors(packages, "z").next).toBeNull();
  });

  it("задача не в пакетах — пусто", () => {
    expect(findPlanTaskNeighbors([pkg([])], "x")).toEqual({ prev: null, next: null });
  });
});

describe("planTaskHref", () => {
  it("сохраняет from=plan и planTopic", () => {
    expect(planTaskHref("t2", "task-1", { tab: "current", planTopic: "gather" })).toBe(
      "/topics/t2/tasks/task-1?from=plan&planTopic=gather",
    );
    expect(planTaskHref("t1", "x", { tab: "history", planTopic: "mixed" })).toBe(
      "/topics/t1/tasks/x?from=plan&tab=history&planTopic=mixed",
    );
  });
});
