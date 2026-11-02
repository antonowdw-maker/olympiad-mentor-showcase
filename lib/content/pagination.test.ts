import { describe, expect, it } from "vitest";
import {
  paginate,
  parsePageParam,
  pageNavItems,
  topicListHref,
  topicTaskHref,
  withListPage,
  TOPIC_LIST_PAGE_SIZE,
} from "./pagination";

describe("parsePageParam", () => {
  it("по умолчанию 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
  });

  it("берёт первое из массива и целые ≥1", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2", "9"])).toBe(2);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-1")).toBe(1);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it("режет по pageSize (дефолт 20)", () => {
    const p1 = paginate(items, 1);
    expect(p1.pageSize).toBe(TOPIC_LIST_PAGE_SIZE);
    expect(p1.items).toEqual(items.slice(0, 20));
    expect(p1.totalPages).toBe(3);
    expect(p1.hasPrev).toBe(false);
    expect(p1.hasNext).toBe(true);
  });

  it("вторая страница и clamp сверх хвоста", () => {
    const p2 = paginate(items, 2);
    expect(p2.items).toEqual(items.slice(20, 40));
    const p99 = paginate(items, 99);
    expect(p99.page).toBe(3);
    expect(p99.items).toEqual(items.slice(40));
    expect(p99.hasNext).toBe(false);
  });

  it("пустой список — одна страница без элементов", () => {
    const p = paginate([], 5);
    expect(p.page).toBe(1);
    expect(p.totalPages).toBe(1);
    expect(p.items).toEqual([]);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });
});

describe("topicListHref / topicTaskHref / withListPage", () => {
  it("опускает page=1 и добавляет page>1", () => {
    expect(topicListHref("t2-parity")).toBe("/topics/t2-parity");
    expect(topicListHref("t2-parity", 1)).toBe("/topics/t2-parity");
    expect(topicListHref("t2-parity", 2)).toBe("/topics/t2-parity?page=2");
    expect(topicTaskHref("t2-parity", "t2-domino-4x4", 2)).toBe(
      "/topics/t2-parity/tasks/t2-domino-4x4?page=2",
    );
    expect(withListPage("/topics/t2-parity/tasks/x", 2)).toBe(
      "/topics/t2-parity/tasks/x?page=2",
    );
    expect(withListPage("/topics/t2-parity/tasks/x?page=2", 3)).toBe(
      "/topics/t2-parity/tasks/x?page=2",
    );
  });
});

describe("pageNavItems", () => {
  it("total ≤ 7 — все номера подряд", () => {
    expect(pageNavItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNavItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("total > 7 — окно + края и ellipsis", () => {
    expect(pageNavItems(1, 12)).toEqual([1, 2, 3, 4, "ellipsis", 12]);
    expect(pageNavItems(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
    expect(pageNavItems(12, 12)).toEqual([1, "ellipsis", 9, 10, 11, 12]);
  });

  it("clamp текущей страницы", () => {
    expect(pageNavItems(99, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNavItems(0, 3)).toEqual([1, 2, 3]);
  });
});
