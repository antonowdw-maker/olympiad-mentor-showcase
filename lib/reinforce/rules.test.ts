/**
 * Unit: правила сессии закрепления (13B/C).
 */
import { describe, expect, it } from "vitest";
import type { PlanItem } from "@/lib/plan/build";
import {
  canStartReinforceForPackage,
  findCurrentReinforceItemIndex,
  isReinforceSessionAllCorrect,
  isReinforceSessionFullyAnswered,
  taskSlugsFromLearnPackage,
} from "./rules";

const items: PlanItem[] = [
  { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
  { kind: "task", slug: "b", title: "B", estMinutes: 6, topicSlug: "t1" },
  { kind: "article", slug: "doc", title: "D", estMinutes: 8, topicSlug: "t1" },
];

describe("taskSlugsFromLearnPackage", () => {
  it("только задачи, порядок пакета", () => {
    expect(taskSlugsFromLearnPackage(items)).toEqual(["a", "b"]);
  });
});

describe("canStartReinforceForPackage", () => {
  it("reject incomplete", () => {
    expect(canStartReinforceForPackage(items, new Set(["a"]), null)).toEqual({
      ok: false,
      reason: "INCOMPLETE",
    });
  });

  it("ok когда пакет пройден и сессии нет", () => {
    expect(canStartReinforceForPackage(items, new Set(["a", "b"]), null)).toEqual({
      ok: true,
    });
  });

  it("ok при active (resume)", () => {
    expect(
      canStartReinforceForPackage(items, new Set(["a", "b"]), "active"),
    ).toEqual({ ok: true });
  });

  it("reject completed / skipped", () => {
    expect(
      canStartReinforceForPackage(items, new Set(["a", "b"]), "completed"),
    ).toEqual({ ok: false, reason: "ALREADY_DONE" });
    expect(
      canStartReinforceForPackage(items, new Set(["a", "b"]), "skipped"),
    ).toEqual({ ok: false, reason: "SKIPPED" });
  });
});

describe("findCurrentReinforceItemIndex / fully answered / all correct", () => {
  it("первый неотвеченный; null если все отвечены", () => {
    expect(
      findCurrentReinforceItemIndex([{ answeredAt: new Date() }, { answeredAt: null }]),
    ).toBe(1);
    expect(
      findCurrentReinforceItemIndex([
        { answeredAt: new Date() },
        { answeredAt: "2026-01-01" },
      ]),
    ).toBeNull();
  });

  it("fully answered только при непустом списке и всех answeredAt", () => {
    expect(isReinforceSessionFullyAnswered([])).toBe(false);
    expect(isReinforceSessionFullyAnswered([{ answeredAt: null }])).toBe(false);
    expect(
      isReinforceSessionFullyAnswered([{ answeredAt: new Date() }, { answeredAt: new Date() }]),
    ).toBe(true);
  });

  it("all correct — вспомогательный хелпер (награда — MODE-09 pass)", () => {
    expect(
      isReinforceSessionAllCorrect([
        { answeredAt: new Date(), isCorrect: true },
        { answeredAt: new Date(), isCorrect: true },
      ]),
    ).toBe(true);
    expect(
      isReinforceSessionAllCorrect([
        { answeredAt: new Date(), isCorrect: true },
        { answeredAt: new Date(), isCorrect: false },
      ]),
    ).toBe(false);
    expect(
      isReinforceSessionAllCorrect([{ answeredAt: null, isCorrect: null }]),
    ).toBe(false);
  });
});
