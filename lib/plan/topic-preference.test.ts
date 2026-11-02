import { describe, expect, it } from "vitest";
import {
  hasUnsolvedTasks,
  otherOpenTopics,
  resolvePlanTopicSlug,
  type PlanTopicChoice,
} from "./topic-preference";

const topics: PlanTopicChoice[] = [
  { slug: "t1-logic", title: "Логика", order: 1, hasUnsolved: false },
  { slug: "t2-parity", title: "Чётность", order: 2, hasUnsolved: true },
  { slug: "t3-x", title: "X", order: 3, hasUnsolved: true },
];

describe("hasUnsolvedTasks", () => {
  it("false без прогресса / без задач / всё решено", () => {
    expect(hasUnsolvedTasks(null)).toBe(false);
    expect(hasUnsolvedTasks(undefined)).toBe(false);
    expect(hasUnsolvedTasks({ totalTasks: 0, solvedTasks: 0 })).toBe(false);
    expect(hasUnsolvedTasks({ totalTasks: 30, solvedTasks: 30 })).toBe(false);
  });

  it("true только при total>0 и solved < total", () => {
    expect(hasUnsolvedTasks({ totalTasks: 30, solvedTasks: 0 })).toBe(true);
    expect(hasUnsolvedTasks({ totalTasks: 30, solvedTasks: 29 })).toBe(true);
  });
});

describe("resolvePlanTopicSlug", () => {
  it("берёт валидное предпочтение", () => {
    expect(resolvePlanTopicSlug("t1-logic", topics)).toBe("t1-logic");
    expect(resolvePlanTopicSlug("t2-parity", topics)).toBe("t2-parity");
  });

  it("сохраняет mixed даже при <2 открытых (просмотр истории, 10C-04)", () => {
    const oneOpen = topics.map((t) => ({
      ...t,
      hasUnsolved: t.slug === "t2-parity",
    }));
    expect(resolvePlanTopicSlug("mixed", oneOpen)).toBe("mixed");
    const noneOpen = topics.map((t) => ({ ...t, hasUnsolved: false }));
    expect(resolvePlanTopicSlug("mixed", noneOpen)).toBe("mixed");
  });

  it("игнорирует неизвестный slug и берёт первую с нерешёнными", () => {
    expect(resolvePlanTopicSlug("missing", topics)).toBe("t2-parity");
    expect(resolvePlanTopicSlug(null, topics)).toBe("t2-parity");
    expect(resolvePlanTopicSlug(undefined, topics)).toBe("t2-parity");
  });

  it("если все закрыты — первая по order", () => {
    const closed = topics.map((t) => ({ ...t, hasUnsolved: false }));
    expect(resolvePlanTopicSlug(null, closed)).toBe("t1-logic");
  });

  it("пустой список — ошибка", () => {
    expect(() => resolvePlanTopicSlug("x", [])).toThrow("NO_TOPICS");
  });
});

describe("otherOpenTopics", () => {
  it("исключает текущую и закрытые", () => {
    expect(otherOpenTopics("t2-parity", topics).map((t) => t.slug)).toEqual(["t3-x"]);
  });

  it("для mixed возвращает все открытые", () => {
    expect(otherOpenTopics("mixed", topics).map((t) => t.slug)).toEqual(["t2-parity", "t3-x"]);
  });
});

describe("canOfferMixedPlan / shouldShowMixedPlanOption", () => {
  it("offer только при ≥2 открытых; show при уже выбранном mixed", async () => {
    const { canOfferMixedPlan, shouldShowMixedPlanOption } = await import("./topic-preference");
    expect(canOfferMixedPlan(topics)).toBe(true);
    expect(canOfferMixedPlan(topics.map((t) => ({ ...t, hasUnsolved: false })))).toBe(false);
    expect(shouldShowMixedPlanOption(topics.map((t) => ({ ...t, hasUnsolved: false })), "mixed")).toBe(
      true,
    );
  });
});
