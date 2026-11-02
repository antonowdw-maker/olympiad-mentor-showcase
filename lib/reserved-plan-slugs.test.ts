/**
 * Unit: зарезервированные selection плана (I13A-R3-02).
 */
import { describe, expect, it } from "vitest";
import {
  isReservedPlanSelectionSlug,
  RESERVED_PLAN_SELECTION_SLUGS,
} from "./reserved-plan-slugs";

describe("isReservedPlanSelectionSlug", () => {
  it("mixed и gather зарезервированы", () => {
    expect(RESERVED_PLAN_SELECTION_SLUGS).toContain("mixed");
    expect(RESERVED_PLAN_SELECTION_SLUGS).toContain("gather");
    expect(isReservedPlanSelectionSlug("gather")).toBe(true);
    expect(isReservedPlanSelectionSlug("MIXED")).toBe(true);
    expect(isReservedPlanSelectionSlug("t1-logic")).toBe(false);
  });
});
