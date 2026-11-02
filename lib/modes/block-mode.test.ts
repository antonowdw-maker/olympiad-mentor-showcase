/**
 * Unit: режим блока (iter 13).
 */
import { describe, expect, it } from "vitest";
import {
  BLOCK_MODE_LEARN,
  BLOCK_MODE_TEST,
  isBinaryChoiceOptions,
  parseBlockMode,
  planScopeKeyForMode,
} from "./block-mode";

describe("parseBlockMode", () => {
  it("дефолт — обучение", () => {
    expect(parseBlockMode(null)).toBe(BLOCK_MODE_LEARN);
    expect(parseBlockMode("")).toBe(BLOCK_MODE_LEARN);
    expect(parseBlockMode("learn")).toBe(BLOCK_MODE_LEARN);
  });

  it("принимает test", () => {
    expect(parseBlockMode("test")).toBe(BLOCK_MODE_TEST);
    expect(parseBlockMode("TEST")).toBe(BLOCK_MODE_TEST);
  });
});

describe("planScopeKeyForMode", () => {
  it("обучение не меняет ключ", () => {
    expect(planScopeKeyForMode("topic:t1-logic", BLOCK_MODE_LEARN)).toBe("topic:t1-logic");
    expect(planScopeKeyForMode("mixed", BLOCK_MODE_LEARN)).toBe("mixed");
  });

  it("тест добавляет префикс", () => {
    expect(planScopeKeyForMode("topic:t1-logic", BLOCK_MODE_TEST)).toBe("test:topic:t1-logic");
    expect(planScopeKeyForMode("mixed", BLOCK_MODE_TEST)).toBe("test:mixed");
  });

  it("не дублирует test:", () => {
    expect(planScopeKeyForMode("test:mixed", BLOCK_MODE_TEST)).toBe("test:mixed");
  });
});

describe("isBinaryChoiceOptions", () => {
  it("ровно два", () => {
    expect(isBinaryChoiceOptions(["а", "б"])).toBe(true);
    expect(isBinaryChoiceOptions(["а", "б", "в"])).toBe(false);
    expect(isBinaryChoiceOptions([])).toBe(false);
    expect(isBinaryChoiceOptions(null)).toBe(false);
  });
});
