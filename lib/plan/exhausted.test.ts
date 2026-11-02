import { describe, expect, it } from "vitest";
import { exhaustedTaskSlugsFromPool } from "./exhausted";

describe("exhaustedTaskSlugsFromPool", () => {
  it("пустой пул — не исчерпан", () => {
    expect(
      exhaustedTaskSlugsFromPool({
        tasks: [{ slug: "a", instanceIds: [] }],
        correctlySolvedInstanceIds: new Set(),
      }).has("a"),
    ).toBe(false);
  });

  it("часть instance решена — канон доступен", () => {
    const out = exhaustedTaskSlugsFromPool({
      tasks: [{ slug: "a", instanceIds: ["i1", "i2", "i3"] }],
      correctlySolvedInstanceIds: new Set(["i1"]),
    });
    expect(out.has("a")).toBe(false);
  });

  it("все instance решены — исчерпан", () => {
    const out = exhaustedTaskSlugsFromPool({
      tasks: [{ slug: "a", instanceIds: ["i1", "i2"] }],
      correctlySolvedInstanceIds: new Set(["i1", "i2"]),
    });
    expect(out.has("a")).toBe(true);
  });

  it("несколько канонов независимо", () => {
    const out = exhaustedTaskSlugsFromPool({
      tasks: [
        { slug: "a", instanceIds: ["a1", "a2"] },
        { slug: "b", instanceIds: ["b1"] },
      ],
      correctlySolvedInstanceIds: new Set(["a1", "a2"]),
    });
    expect([...out]).toEqual(["a"]);
  });
});
