/**
 * Unit: резолв User.id по login / id для живой JWT-сессии.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique },
  },
}));

import {
  assertUserExists,
  isPrismaForeignKeyError,
  resolvePersistedUserId,
} from "./resolve-user";

describe("resolvePersistedUserId", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("предпочитает login и возвращает актуальный id после пересоздания User", async () => {
    findUnique.mockResolvedValueOnce({ id: "new-id" });
    const id = await resolvePersistedUserId({ userId: "stale-id", login: "Nikita" });
    expect(id).toBe("new-id");
    expect(findUnique).toHaveBeenCalledWith({
      where: { login: "Nikita" },
      select: { id: true },
    });
  });

  it("fallback на userId, если login нет", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1" });
    const id = await resolvePersistedUserId({ userId: "u1", login: null });
    expect(id).toBe("u1");
  });

  it("null если User не найден", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolvePersistedUserId({ userId: "gone", login: "x" })).resolves.toBeNull();
  });
});

describe("assertUserExists", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("бросает USER_GONE", async () => {
    findUnique.mockResolvedValue(null);
    await expect(assertUserExists("gone")).rejects.toThrow("USER_GONE");
  });

  it("молчит если User есть", async () => {
    findUnique.mockResolvedValue({ id: "u1" });
    await expect(assertUserExists("u1")).resolves.toBeUndefined();
  });
});

describe("isPrismaForeignKeyError", () => {
  it("ловит P2003", () => {
    expect(isPrismaForeignKeyError({ code: "P2003" })).toBe(true);
    expect(isPrismaForeignKeyError({ code: "P2002" })).toBe(false);
    expect(isPrismaForeignKeyError(new Error("x"))).toBe(false);
  });
});
