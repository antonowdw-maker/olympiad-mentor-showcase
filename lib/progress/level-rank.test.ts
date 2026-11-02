import { describe, expect, it } from "vitest";
import {
  cupsFromXp,
  levelFromXp,
  rankInfoFromXp,
  rankTitleForLevel,
  XP_PER_LEVEL,
} from "@/lib/progress/level-rank";

describe("levelFromXp", () => {
  it("0–99 → 0, 100–199 → 1, …", () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(99)).toBe(0);
    expect(levelFromXp(100)).toBe(1);
    expect(levelFromXp(199)).toBe(1);
    expect(levelFromXp(200)).toBe(2);
  });

  it("мусор → 0", () => {
    expect(levelFromXp(Number.NaN)).toBe(0);
    expect(levelFromXp(-5)).toBe(0);
  });
});

describe("rankTitleForLevel", () => {
  it("базовые ранги", () => {
    expect(rankTitleForLevel(0)).toBe("Новичок");
    expect(rankTitleForLevel(1)).toBe("Ученик");
    expect(rankTitleForLevel(3)).toBe("Боец");
    expect(rankTitleForLevel(8)).toBe("Легенда");
  });

  it("после Легенды — римские номера", () => {
    expect(rankTitleForLevel(9)).toBe("Легенда II");
  });
});

describe("rankInfoFromXp / cups", () => {
  it("прогресс внутри уровня", () => {
    const r = rankInfoFromXp(142);
    expect(r.level).toBe(1);
    expect(r.title).toBe("Ученик");
    expect(r.intoLevel).toBe(42);
    expect(r.fillPct).toBe(42);
    expect(r.xpToNext).toBe(XP_PER_LEVEL - 42);
  });

  it("кубки = XP", () => {
    expect(cupsFromXp(150)).toBe(150);
  });
});
