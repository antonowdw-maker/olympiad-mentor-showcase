/**
 * Unit: политика ступеней подсказок (поведение, W-03 / I4-08 / FUA-01).
 */
import { describe, expect, it } from "vitest";
import {
  clampOpenedCount,
  effectiveHintStepsTotal,
  isReinforceVisit,
  nextOpenedCount,
  reinforceTaskHref,
  shouldApplyReinforceHintCap,
  shouldBoostHelp,
  shouldOfferReinforce,
  sliceVisibleHints,
} from "./hints";

describe("clampOpenedCount", () => {
  it("держит значение в [0, total]", () => {
    expect(clampOpenedCount(-1, 3)).toBe(0);
    expect(clampOpenedCount(2, 3)).toBe(2);
    expect(clampOpenedCount(9, 3)).toBe(3);
    expect(clampOpenedCount(1, 0)).toBe(0);
  });
});

describe("sliceVisibleHints", () => {
  it("отдаёт только открытые ступени", () => {
    const steps = ["a", "b", "c"];
    expect(sliceVisibleHints(steps, 0)).toEqual([]);
    expect(sliceVisibleHints(steps, 2)).toEqual(["a", "b"]);
    expect(sliceVisibleHints(steps, 99)).toEqual(["a", "b", "c"]);
  });
});

describe("nextOpenedCount", () => {
  it("открывает по одной и не прыгает сверх total", () => {
    expect(nextOpenedCount(0, 3)).toEqual({ opened: 1, advanced: true });
    expect(nextOpenedCount(2, 3)).toEqual({ opened: 3, advanced: true });
    expect(nextOpenedCount(3, 3)).toEqual({ opened: 3, advanced: false });
    expect(nextOpenedCount(0, 0)).toEqual({ opened: 0, advanced: false });
  });
});

describe("shouldOfferReinforce", () => {
  it("предлагает закрепление только при ≥3 и similar", () => {
    expect(shouldOfferReinforce(3, true)).toBe(true);
    expect(shouldOfferReinforce(2, true)).toBe(false);
    expect(shouldOfferReinforce(5, false)).toBe(false);
  });
});

describe("reinforce visit / cap (FUA-01)", () => {
  it("распознаёт ?reinforce=1", () => {
    expect(isReinforceVisit("1")).toBe(true);
    expect(isReinforceVisit("true")).toBe(true);
    expect(isReinforceVisit(undefined)).toBe(false);
    expect(isReinforceVisit("0")).toBe(false);
  });

  it("лимит только при визите закрепления И входящей similar", () => {
    expect(shouldApplyReinforceHintCap(true, true)).toBe(true);
    expect(shouldApplyReinforceHintCap(true, false)).toBe(false);
    expect(shouldApplyReinforceHintCap(false, true)).toBe(false);
  });

  it("href закрепления несёт reinforce=1", () => {
    expect(reinforceTaskHref("t1-logic", "t1-kfu25-camp-fruit")).toBe(
      "/topics/t1-logic/tasks/t1-kfu25-camp-fruit?reinforce=1",
    );
  });
});

describe("effectiveHintStepsTotal (I4-08)", () => {
  it("обычная задача — полный rawTotal", () => {
    expect(effectiveHintStepsTotal(3, false)).toBe(3);
    expect(effectiveHintStepsTotal(0, false)).toBe(0);
  });

  it("закрепляющая — не больше 1 ступени", () => {
    expect(effectiveHintStepsTotal(3, true)).toBe(1);
    expect(effectiveHintStepsTotal(1, true)).toBe(1);
    expect(effectiveHintStepsTotal(0, true)).toBe(0);
  });
});

describe("shouldBoostHelp", () => {
  it("после 3 неверных усиливает помощь", () => {
    expect(shouldBoostHelp(2)).toBe(false);
    expect(shouldBoostHelp(3)).toBe(true);
    expect(shouldBoostHelp(10)).toBe(true);
  });
});
