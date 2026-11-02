import { describe, expect, it } from "vitest";
import { taskClientBoundaryKey } from "./task-client-boundary";

describe("taskClientBoundaryKey (I12A-R2-01)", () => {
  it("разные instance → разные key (перемонтирование клиента)", () => {
    const a = taskClientBoundaryKey("inst-a");
    const b = taskClientBoundaryKey("inst-b");
    expect(a).not.toBe(b);
    expect(a).toBe("inst:inst-a");
    expect(b).toBe("inst:inst-b");
  });

  it("без пула — стабильный canon", () => {
    expect(taskClientBoundaryKey(null)).toBe("canon");
    expect(taskClientBoundaryKey(undefined)).toBe("canon");
    expect(taskClientBoundaryKey("")).toBe("canon");
  });
});
