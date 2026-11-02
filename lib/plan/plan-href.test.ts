import { describe, expect, it } from "vitest";
import { planBackHref } from "./plan-href";

describe("planBackHref", () => {
  it("без параметров — /plan", () => {
    expect(planBackHref({})).toBe("/plan");
  });

  it("tab + planTopic (mixed)", () => {
    expect(planBackHref({ tab: "history", planTopic: "mixed" })).toBe(
      "/plan?tab=history&topic=mixed",
    );
  });

  it("только тема", () => {
    expect(planBackHref({ planTopic: "t1-logic" })).toBe("/plan?topic=t1-logic");
  });
});
