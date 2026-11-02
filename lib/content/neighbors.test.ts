import { describe, expect, it } from "vitest";
import { pickOrderedNeighbors, topicArticleHref } from "./neighbors";

describe("pickOrderedNeighbors", () => {
  const items = [
    { slug: "a", order: 1 },
    { slug: "b", order: 2 },
    { slug: "c", order: 3 },
  ];

  it("в середине отдаёт prev и next", () => {
    expect(pickOrderedNeighbors(items, "b")).toEqual({
      prev: items[0],
      next: items[2],
    });
  });

  it("у первой нет prev", () => {
    expect(pickOrderedNeighbors(items, "a")).toEqual({
      prev: null,
      next: items[1],
    });
  });

  it("у последней нет next", () => {
    expect(pickOrderedNeighbors(items, "c")).toEqual({
      prev: items[1],
      next: null,
    });
  });

  it("одна статья — оба null", () => {
    expect(pickOrderedNeighbors([{ slug: "only" }], "only")).toEqual({
      prev: null,
      next: null,
    });
  });

  it("неизвестный slug — оба null", () => {
    expect(pickOrderedNeighbors(items, "nope")).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe("topicArticleHref", () => {
  it("без контекста — чистый путь", () => {
    expect(topicArticleHref("t1", "doc-1")).toBe("/topics/t1/articles/doc-1");
  });

  it("сохраняет fromTask, from, tab, planTopic и page>1", () => {
    expect(
      topicArticleHref("t1", "doc-2", {
        fromTask: "task-1",
        from: "plan",
        tab: "history",
        planTopic: "mixed",
        page: 2,
      }),
    ).toBe(
      "/topics/t1/articles/doc-2?fromTask=task-1&from=plan&tab=history&planTopic=mixed&page=2",
    );
  });

  it("page=1 не добавляет page", () => {
    expect(topicArticleHref("t1", "doc-1", { page: 1 })).toBe(
      "/topics/t1/articles/doc-1",
    );
  });
});
