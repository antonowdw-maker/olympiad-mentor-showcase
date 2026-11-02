/**
 * Unit: порог сдачи закрепления (REQ-MODE-09).
 */
import { describe, expect, it } from "vitest";
import {
  REINFORCE_PASS_RATIO,
  reinforcePassThreshold,
  reinforcePointsForGrade,
  scoreReinforceSession,
} from "./pass";

describe("reinforcePointsForGrade", () => {
  it("low/mid/high = 1/2/3; неизвестное → mid", () => {
    expect(reinforcePointsForGrade("low")).toBe(1);
    expect(reinforcePointsForGrade("mid")).toBe(2);
    expect(reinforcePointsForGrade("high")).toBe(3);
    expect(reinforcePointsForGrade(null)).toBe(2);
    expect(reinforcePointsForGrade("???")).toBe(2);
  });
});

describe("reinforcePassThreshold", () => {
  it("ceil(0.7 × max); пустой max → ∞ (несдаваем)", () => {
    expect(REINFORCE_PASS_RATIO).toBe(0.7);
    expect(reinforcePassThreshold(8)).toBe(6); // ceil(5.6)
    expect(reinforcePassThreshold(10)).toBe(7);
    expect(reinforcePassThreshold(1)).toBe(1);
    expect(reinforcePassThreshold(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("scoreReinforceSession", () => {
  const done = (isCorrect: boolean, grade: string) => ({
    answeredAt: new Date(),
    isCorrect,
    grade,
  });

  it("4×mid: max=8, порог=6; 3 верных → сдан", () => {
    const r = scoreReinforceSession([
      done(true, "mid"),
      done(true, "mid"),
      done(true, "mid"),
      done(false, "mid"),
    ]);
    expect(r).toEqual({ score: 6, maxScore: 8, threshold: 6, passed: true });
  });

  it("4×mid: 2 верных → не сдан", () => {
    const r = scoreReinforceSession([
      done(true, "mid"),
      done(true, "mid"),
      done(false, "mid"),
      done(false, "mid"),
    ]);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(4);
    expect(r.threshold).toBe(6);
  });

  it("все верные → сдан", () => {
    const r = scoreReinforceSession([done(true, "low"), done(true, "high")]);
    expect(r).toMatchObject({ score: 4, maxScore: 4, passed: true });
  });

  it("не все отвечены → passed=false, score=0", () => {
    const r = scoreReinforceSession([
      done(true, "high"),
      { answeredAt: null, isCorrect: null, grade: "high" },
    ]);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.maxScore).toBe(6);
  });

  it("пустой список → не сдан", () => {
    expect(scoreReinforceSession([])).toMatchObject({
      score: 0,
      maxScore: 0,
      passed: false,
    });
  });

  it("вес high: одна ошибка low при двух high+low может ещё сдать", () => {
    // max = 3+3+1 = 7; порог ceil(4.9)=5; верны два high = 6 → сдан
    const r = scoreReinforceSession([
      done(true, "high"),
      done(true, "high"),
      done(false, "low"),
    ]);
    expect(r).toEqual({ score: 6, maxScore: 7, threshold: 5, passed: true });
  });
});
