/**
 * Unit: правила XP / бейджей L1 (чистые функции).
 */
import { describe, expect, it } from "vitest";
import {
  isTechniqueBadgeCode,
  milestoneBadgesForUniqueCount,
  milestoneBadgeTitle,
  shouldEarnTechniqueBadge,
  techniqueBadgeCode,
  techniqueBadgeTitle,
  topicSlugFromTechniqueBadge,
  xpForFirstCorrect,
  xpAwardAmount,
  XP_BY_GRADE,
  TECHNIQUE_BADGE_MIN,
  SESSION_REINFORCE_XP,
  sessionReinforcedBadgeCode,
  sessionReinforcedBadgeTitle,
} from "@/lib/progress/xp";

describe("xpForFirstCorrect", () => {
  it("отдаёт low/mid/high по таблице", () => {
    expect(xpForFirstCorrect("low")).toBe(XP_BY_GRADE.low);
    expect(xpForFirstCorrect("mid")).toBe(XP_BY_GRADE.mid);
    expect(xpForFirstCorrect("high")).toBe(XP_BY_GRADE.high);
  });

  it("неизвестный грейд → mid", () => {
    expect(xpForFirstCorrect("unknown")).toBe(XP_BY_GRADE.mid);
  });
});

describe("xpAwardAmount", () => {
  it("без штрафов — 100% базы", () => {
    expect(xpAwardAmount({ grade: "low", hintsOpenedCount: 0, wrongAttemptCount: 0 })).toBe(10);
    expect(xpAwardAmount({ grade: "mid", hintsOpenedCount: 0, wrongAttemptCount: 0 })).toBe(20);
    expect(xpAwardAmount({ grade: "high", hintsOpenedCount: 0, wrongAttemptCount: 0 })).toBe(35);
  });

  it("−10% за подсказку и за неверную; ceil", () => {
    // mid 20 × 90% = 18
    expect(xpAwardAmount({ grade: "mid", hintsOpenedCount: 1, wrongAttemptCount: 0 })).toBe(18);
    // mid 20 × 80% = 16
    expect(xpAwardAmount({ grade: "mid", hintsOpenedCount: 1, wrongAttemptCount: 1 })).toBe(16);
    // high 35 × 90% = 31.5 → 32
    expect(xpAwardAmount({ grade: "high", hintsOpenedCount: 1, wrongAttemptCount: 0 })).toBe(32);
  });

  it("пол 10% базы с ceil", () => {
    // low 10 × 10% = 1
    expect(xpAwardAmount({ grade: "low", hintsOpenedCount: 20, wrongAttemptCount: 0 })).toBe(1);
    // mid 20 × 10% = 2
    expect(xpAwardAmount({ grade: "mid", hintsOpenedCount: 5, wrongAttemptCount: 5 })).toBe(2);
  });
});

describe("milestoneBadgesForUniqueCount", () => {
  it("0 — пусто; 1 — debut; 10 — debut+steady; 25 — все три", () => {
    expect(milestoneBadgesForUniqueCount(0)).toEqual([]);
    expect(milestoneBadgesForUniqueCount(1)).toEqual(["debut"]);
    expect(milestoneBadgesForUniqueCount(9)).toEqual(["debut"]);
    expect(milestoneBadgesForUniqueCount(10)).toEqual(["debut", "steady"]);
    expect(milestoneBadgesForUniqueCount(24)).toEqual(["debut", "steady"]);
    expect(milestoneBadgesForUniqueCount(25)).toEqual(["debut", "steady", "deep"]);
  });

  it("заголовки milestone на русском", () => {
    expect(milestoneBadgeTitle("debut")).toBe("Первый успех");
    expect(milestoneBadgeTitle("steady")).toBe("Уверенный старт");
    expect(milestoneBadgeTitle("deep")).toBe("Глубокая практика");
  });
});

describe("technique badge", () => {
  it("порог TECHNIQUE_BADGE_MIN", () => {
    expect(shouldEarnTechniqueBadge(TECHNIQUE_BADGE_MIN - 1)).toBe(false);
    expect(shouldEarnTechniqueBadge(TECHNIQUE_BADGE_MIN)).toBe(true);
  });

  it("код technique:<slug> и разбор", () => {
    expect(techniqueBadgeCode("t1-logic")).toBe("technique:t1-logic");
    expect(isTechniqueBadgeCode("technique:t1-logic")).toBe(true);
    expect(isTechniqueBadgeCode("debut")).toBe(false);
    expect(topicSlugFromTechniqueBadge("technique:t1-logic")).toBe("t1-logic");
    expect(topicSlugFromTechniqueBadge("debut")).toBeNull();
  });

  it("title с названием темы", () => {
    expect(techniqueBadgeTitle("Логика")).toBe("Приёмы: Логика");
  });
});

describe("session reinforce XP / badge", () => {
  it("константа и код бейджа user×пакет", () => {
    expect(SESSION_REINFORCE_XP).toBe(10);
    expect(sessionReinforcedBadgeCode("pkg-1")).toBe("session_reinforced:pkg-1");
    expect(sessionReinforcedBadgeTitle()).toBe("Материал закреплён");
  });
});
