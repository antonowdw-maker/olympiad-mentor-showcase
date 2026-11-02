import { describe, expect, it } from "vitest";
import {
  PLAN_SCOPE_MIXED,
  isMixedPlanScope,
  planSelectionToScopeKey,
  scopeKeyToSelection,
  topicScopeKey,
} from "./scope";
import { PLAN_SCOPE_GATHER } from "./learn-session";

describe("plan scope helpers", () => {
  it("topicScopeKey / mixed", () => {
    expect(topicScopeKey("t1-logic")).toBe("topic:t1-logic");
    expect(isMixedPlanScope("mixed")).toBe(true);
    expect(isMixedPlanScope(" t1 ")).toBe(false);
  });

  it("selection ↔ scopeKey", () => {
    expect(planSelectionToScopeKey("mixed")).toBe(PLAN_SCOPE_MIXED);
    expect(planSelectionToScopeKey("t2-parity")).toBe("topic:t2-parity");
    expect(planSelectionToScopeKey("gather")).toBe(PLAN_SCOPE_GATHER);
    expect(scopeKeyToSelection("mixed")).toBe("mixed");
    expect(scopeKeyToSelection("topic:t2-parity")).toBe("t2-parity");
    expect(scopeKeyToSelection("gather")).toBe(PLAN_SCOPE_GATHER);
  });
});
