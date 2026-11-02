import { describe, expect, it } from "vitest";
import {
  computeReinforceDurationSec,
  formatReinforceDuration,
  reinforceScopeLabel,
  resolveReinforceDurationSec,
} from "./timer";

describe("computeReinforceDurationSec", () => {
  it("считает целые секунды", () => {
    expect(
      computeReinforceDurationSec(
        "2026-09-19T10:00:00.000Z",
        "2026-09-19T10:01:05.400Z",
      ),
    ).toBe(65);
  });

  it("отрицательное / битое → 0", () => {
    expect(
      computeReinforceDurationSec(
        "2026-09-19T10:01:00.000Z",
        "2026-09-19T10:00:00.000Z",
      ),
    ).toBe(0);
  });
});

describe("resolveReinforceDurationSec", () => {
  it("предпочитает сохранённый durationSec", () => {
    expect(
      resolveReinforceDurationSec({
        durationSec: 42,
        createdAt: "2026-09-19T10:00:00.000Z",
        completedAt: "2026-09-19T10:10:00.000Z",
        status: "completed",
      }),
    ).toBe(42);
  });

  it("фолбэк completedAt−createdAt; skip/active → null", () => {
    expect(
      resolveReinforceDurationSec({
        durationSec: null,
        createdAt: "2026-09-19T10:00:00.000Z",
        completedAt: "2026-09-19T10:00:30.000Z",
        status: "completed",
      }),
    ).toBe(30);
    expect(
      resolveReinforceDurationSec({
        durationSec: null,
        createdAt: "2026-09-19T10:00:00.000Z",
        completedAt: "2026-09-19T10:00:30.000Z",
        status: "skipped",
      }),
    ).toBe(null);
  });
});

describe("formatReinforceDuration", () => {
  it("mm:ss и h:mm:ss", () => {
    expect(formatReinforceDuration(65)).toBe("1:05");
    expect(formatReinforceDuration(5)).toBe("0:05");
    expect(formatReinforceDuration(3723)).toBe("1:02:03");
  });
});

describe("reinforceScopeLabel", () => {
  it("mixed / gather / topic", () => {
    expect(reinforceScopeLabel({ scopeKey: "mixed", topicTitle: "X" })).toBe(
      "Разные темы",
    );
    expect(reinforceScopeLabel({ scopeKey: "gather", topicTitle: "X" })).toBe(
      "Собранное обучение",
    );
    expect(
      reinforceScopeLabel({ scopeKey: "topic:t1-logic", topicTitle: "Логика" }),
    ).toBe("Логика");
  });
});
