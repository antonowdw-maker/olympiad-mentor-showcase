import { describe, expect, it } from "vitest";
import { canRequestOtherVariant } from "./other-variant-gate";

describe("canRequestOtherVariant", () => {
  const base = {
    poolSize: 3,
    currentInstanceId: "i1",
    currentHasCorrect: true,
  };

  it("false при пуле < 2", () => {
    expect(canRequestOtherVariant({ ...base, poolSize: 1 })).toBe(false);
  });

  it("false без текущего instance", () => {
    expect(canRequestOtherVariant({ ...base, currentInstanceId: null })).toBe(false);
  });

  it("false на первом визите, пока нет верного ответа", () => {
    expect(canRequestOtherVariant({ ...base, currentHasCorrect: false })).toBe(false);
  });

  it("true после верного ответа на текущем варианте", () => {
    expect(canRequestOtherVariant(base)).toBe(true);
  });
});
