/**
 * Unit: cookie режима блока принудительно learn до 13B (I13A-03 / REQ-MODE-10).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieGet, cookieSet, authMock } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookieGet,
    set: cookieSet,
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

import { readBlockModeFromCookies, setBlockModeAction } from "./actions";
import { BLOCK_MODE_LEARN } from "./block-mode";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } });
});

describe("readBlockModeFromCookies", () => {
  it("игнорирует legacy cookie test → всегда learn", async () => {
    cookieGet.mockReturnValue({ value: "test" });
    await expect(readBlockModeFromCookies()).resolves.toBe(BLOCK_MODE_LEARN);
  });
});

describe("setBlockModeAction", () => {
  it("отклоняет test", async () => {
    const r = await setBlockModeAction("test");
    expect(r.ok).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("принимает learn", async () => {
    const r = await setBlockModeAction("learn");
    expect(r).toEqual({ ok: true, mode: BLOCK_MODE_LEARN });
    expect(cookieSet).toHaveBeenCalled();
  });
});
