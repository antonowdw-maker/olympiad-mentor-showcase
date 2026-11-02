import { describe, expect, it } from "vitest";
import {
  pickTaskInstance,
  pickUnsolvedTaskInstance,
  shouldStickInLearnMode,
  shouldStickToCurrentInstance,
} from "@/lib/content/instance-select";

const pool = [
  { id: "a", order: 0 },
  { id: "b", order: 1 },
  { id: "c", order: 2 },
];

describe("shouldStickToCurrentInstance", () => {
  it("липкий без forceNew; с forceNew — нет", () => {
    expect(shouldStickToCurrentInstance("a", false)).toBe(true);
    expect(shouldStickToCurrentInstance("a", true)).toBe(false);
    expect(shouldStickToCurrentInstance(null, false)).toBe(false);
  });
});

describe("shouldStickInLearnMode", () => {
  it("липнет и после верного ответа; с forceNew — нет", () => {
    expect(shouldStickInLearnMode("a", false, new Set(["a"]))).toBe(true);
    expect(shouldStickInLearnMode("a", false, new Set())).toBe(true);
    expect(shouldStickInLearnMode("a", true, new Set(["a"]))).toBe(false);
    expect(shouldStickInLearnMode(null, false, new Set())).toBe(false);
  });

  it("PPV-02: с плана не липнет к верному, если есть открытый instance", () => {
    expect(
      shouldStickInLearnMode("a", false, new Set(["a"]), {
        unstickIfSolvedAndOpenExists: true,
        openInstanceExists: true,
      }),
    ).toBe(false);
    expect(
      shouldStickInLearnMode("a", false, new Set(["a"]), {
        unstickIfSolvedAndOpenExists: true,
        openInstanceExists: false,
      }),
    ).toBe(true);
    expect(
      shouldStickInLearnMode("a", false, new Set(), {
        unstickIfSolvedAndOpenExists: true,
        openInstanceExists: true,
      }),
    ).toBe(true);
  });
});

describe("pickTaskInstance", () => {
  it("пустой пул → null", () => {
    expect(pickTaskInstance([], [], null)).toBeNull();
  });

  it("сначала не показанные по order", () => {
    expect(pickTaskInstance(pool, [], null)?.id).toBe("a");
    expect(pickTaskInstance(pool, ["a"], null)?.id).toBe("b");
    expect(pickTaskInstance(pool, ["a", "b"], "a")?.id).toBe("c");
  });

  it("после исчерпания — цикл после lastShown", () => {
    const all = ["a", "b", "c"];
    expect(pickTaskInstance(pool, all, "a")?.id).toBe("b");
    expect(pickTaskInstance(pool, all, "b")?.id).toBe("c");
    expect(pickTaskInstance(pool, all, "c")?.id).toBe("a");
  });

  it("lastShown неизвестен при полном пуле → первый по order", () => {
    expect(pickTaskInstance(pool, ["a", "b", "c"], "ghost")?.id).toBe("a");
    expect(pickTaskInstance(pool, ["a", "b", "c"], null)?.id).toBe("a");
  });
});

describe("pickUnsolvedTaskInstance", () => {
  it("пропускает верно решённые", () => {
    expect(pickUnsolvedTaskInstance(pool, [], null, new Set(["a"]))?.id).toBe("b");
  });

  it("null если все решены", () => {
    expect(pickUnsolvedTaskInstance(pool, [], null, new Set(["a", "b", "c"]))).toBeNull();
  });
});
