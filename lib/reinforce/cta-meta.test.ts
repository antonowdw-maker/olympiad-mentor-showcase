/**
 * Unit: мета CTA закрепления — скрытие после completed/skipped (B1b / I13BC-04).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMeta = vi.hoisted(() => vi.fn());

vi.mock("@/lib/reinforce/service", () => ({
  getReinforceSessionMeta: getMeta,
}));

import { loadReinforceCtaMeta } from "./cta-meta";
import type { PlanItem } from "@/lib/plan/build";

const taskItems: PlanItem[] = [
  { kind: "task", slug: "a", title: "A", estMinutes: 6, topicSlug: "t1" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadReinforceCtaMeta", () => {
  it("null если нет пройденного пакета", async () => {
    const r = await loadReinforceCtaMeta(
      "u1",
      [{ id: "p1", status: "normal", items: taskItems }],
      new Set(),
    );
    expect(r).toBeNull();
    expect(getMeta).not.toHaveBeenCalled();
  });

  it("null если сессии ещё нет (CTA можно показать)", async () => {
    getMeta.mockResolvedValue(null);
    const r = await loadReinforceCtaMeta(
      "u1",
      [{ id: "p1", status: "normal", items: taskItems }],
      new Set(["a"]),
    );
    expect(getMeta).toHaveBeenCalledWith("u1", "p1");
    expect(r).toBeNull();
  });

  it("возвращает completed/skipped для скрытия CTA", async () => {
    getMeta.mockResolvedValue({ status: "completed", sessionId: "s1" });
    const r = await loadReinforceCtaMeta(
      "u1",
      [{ id: "p1", status: "normal", items: taskItems }],
      new Set(["a"]),
    );
    expect(r).toEqual({ packageId: "p1", status: "completed", sessionId: "s1" });
  });
});
