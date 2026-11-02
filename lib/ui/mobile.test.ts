import { describe, expect, it } from "vitest";
import {
  NARROW_VIEWPORT_MAX_PX,
  TOUCH_MIN_PX,
  TOUCH_SELECT_CLASS,
  TOUCH_SELECT_FIELD_CLASS,
  headerItemsInSlot,
  headerNavItemOrder,
  headerNavSlot,
  isNarrowViewport,
} from "./mobile";

describe("isNarrowViewport", () => {
  it("375 и 639 — узкие; 640 — уже sm", () => {
    expect(isNarrowViewport(375)).toBe(true);
    expect(isNarrowViewport(NARROW_VIEWPORT_MAX_PX)).toBe(true);
    expect(isNarrowViewport(640)).toBe(false);
  });

  it("невалидная ширина → считаем узким (безопасный дефолт)", () => {
    expect(isNarrowViewport(-1)).toBe(true);
    expect(isNarrowViewport(Number.NaN)).toBe(true);
  });
});

describe("headerNavSlot / headerItemsInSlot", () => {
  it("в chrome только xp / login; остальное — слот menu (не в шапке)", () => {
    expect(headerNavSlot("xp")).toBe("chrome");
    expect(headerNavSlot("login")).toBe("chrome");
    expect(headerNavSlot("progress")).toBe("menu");
    expect(headerNavSlot("stats")).toBe("menu");
    expect(headerNavSlot("displayName")).toBe("menu");
    expect(headerNavSlot("logout")).toBe("menu");
  });

  it("шапка: auth — xp; гость — login; menu пуст", () => {
    expect(headerItemsInSlot("chrome", true)).toEqual(["xp"]);
    expect(headerItemsInSlot("menu", true)).toEqual([]);
    expect(headerItemsInSlot("chrome", false)).toEqual(["login"]);
    expect(headerItemsInSlot("menu", false)).toEqual([]);
  });

  it("порядок auth-пунктов шапки — только HUD", () => {
    expect(headerNavItemOrder(true)).toEqual(["xp"]);
    expect(headerNavItemOrder(false)).toEqual(["login"]);
  });
});

describe("touch constants", () => {
  it("TOUCH_MIN_PX соответствует AC ~44", () => {
    expect(TOUCH_MIN_PX).toBe(44);
  });

  it("select-классы задают full-width и min-w-0", () => {
    expect(TOUCH_SELECT_CLASS).toMatch(/w-full/);
    expect(TOUCH_SELECT_CLASS).toMatch(/min-w-0/);
    expect(TOUCH_SELECT_FIELD_CLASS).toMatch(/w-full/);
  });
});
