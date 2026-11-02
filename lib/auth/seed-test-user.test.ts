import { describe, expect, it, afterEach } from "vitest";
import { isSeedTestUserLogin } from "@/lib/auth/seed-test-user";

describe("isSeedTestUserLogin", () => {
  const prev = process.env.SEED_TEST_USER_LOGIN;

  afterEach(() => {
    if (prev === undefined) delete process.env.SEED_TEST_USER_LOGIN;
    else process.env.SEED_TEST_USER_LOGIN = prev;
  });

  it("совпадение с SEED_TEST_USER_LOGIN", () => {
    process.env.SEED_TEST_USER_LOGIN = "demo";
    expect(isSeedTestUserLogin("demo")).toBe(true);
    expect(isSeedTestUserLogin("Demo")).toBe(true);
    expect(isSeedTestUserLogin(" other ")).toBe(false);
    expect(isSeedTestUserLogin(null)).toBe(false);
  });

  it("без env — false", () => {
    delete process.env.SEED_TEST_USER_LOGIN;
    expect(isSeedTestUserLogin("demo")).toBe(false);
  });
});
