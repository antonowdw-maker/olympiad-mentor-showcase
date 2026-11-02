/**
 * Unit: олимпиадный грейд (PLAN 10b).
 */
import { describe, expect, it } from "vitest";
import {
  estMinutesForGrade,
  gradeLabelRu,
  olympiadGradeRank,
  parseOlympiadGrade,
} from "./grade";
import { olympiadGradeSchema } from "./schemas";

describe("olympiadGradeSchema", () => {
  it("принимает low|mid|high", () => {
    expect(olympiadGradeSchema.parse("low")).toBe("low");
    expect(olympiadGradeSchema.parse("mid")).toBe("mid");
    expect(olympiadGradeSchema.parse("high")).toBe("high");
  });

  it("отклоняет прочее", () => {
    expect(olympiadGradeSchema.safeParse("5").success).toBe(false);
    expect(olympiadGradeSchema.safeParse("").success).toBe(false);
  });
});

describe("grade helpers", () => {
  it("estMinutesForGrade", () => {
    expect(estMinutesForGrade("low")).toBe(2);
    expect(estMinutesForGrade("mid")).toBe(6);
    expect(estMinutesForGrade("high")).toBe(12);
  });

  it("gradeLabelRu", () => {
    expect(gradeLabelRu("low")).toBe("низкий");
    expect(gradeLabelRu("mid")).toBe("средний");
    expect(gradeLabelRu("high")).toBe("высокий");
  });

  it("parseOlympiadGrade", () => {
    expect(parseOlympiadGrade("mid")).toBe("mid");
    expect(parseOlympiadGrade("nope")).toBeNull();
  });

  it("olympiadGradeRank", () => {
    expect(olympiadGradeRank("low")).toBe(0);
    expect(olympiadGradeRank("mid")).toBe(1);
    expect(olympiadGradeRank("high")).toBe(2);
  });
});
