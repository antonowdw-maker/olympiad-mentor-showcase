import { describe, expect, it } from "vitest";
import {
  overallProgressPercent,
  parseSideNavGrade,
  parseSideNavSubjectId,
  SIDE_NAV_GRADES,
  SIDE_NAV_SUBJECTS,
  subjectHomeTagline,
  topicsForNavSlot,
  type SideNavTopicRef,
} from "./side-nav";

const sample: SideNavTopicRef[] = [
  { slug: "t1", title: "Логика", order: 1, classLevels: ["5", "5-6", "6"] },
  { slug: "t2", title: "Чётность", order: 2, classLevels: ["5-6", "6"] },
];

describe("overallProgressPercent", () => {
  it("суммирует solved/total", () => {
    expect(
      overallProgressPercent([
        { solvedTasks: 10, totalTasks: 30 },
        { solvedTasks: 5, totalTasks: 10 },
      ]),
    ).toBe(38);
  });

  it("пустой / нулевой total → null", () => {
    expect(overallProgressPercent([])).toBe(null);
    expect(overallProgressPercent([{ solvedTasks: 0, totalTasks: 0 }])).toBe(null);
  });
});

describe("topicsForNavSlot", () => {
  it("math × 6 отдаёт банк (в т.ч. метка 5-6); прочие предметы пусто", () => {
    expect(topicsForNavSlot(sample, 6, "math").map((t) => t.slug)).toEqual(["t1", "t2"]);
    expect(topicsForNavSlot(sample, 6, "russian")).toEqual([]);
    expect(topicsForNavSlot(sample, 7, "math")).toEqual([]);
  });

  it("каталог классов без 5; предметы полные", () => {
    expect([...SIDE_NAV_GRADES]).toEqual([6, 7, 8, 9, 10, 11]);
    expect(SIDE_NAV_SUBJECTS.map((s) => s.id)).toEqual([
      "math",
      "russian",
      "literature",
      "history",
      "physics",
      "chemistry",
      "english",
    ]);
  });
});

describe("parseSideNavSubjectId / grade / tagline", () => {
  it("парсит subject и grade; 5 кл. не в каталоге", () => {
    expect(parseSideNavSubjectId("math")).toBe("math");
    expect(parseSideNavSubjectId("nope")).toBe(null);
    expect(parseSideNavGrade("6")).toBe(6);
    expect(parseSideNavGrade("5")).toBe(null);
    expect(parseSideNavGrade("99")).toBe(null);
  });

  it("слоган math содержит «математика»", () => {
    expect(subjectHomeTagline("math").toLowerCase()).toContain("математика");
  });
});
