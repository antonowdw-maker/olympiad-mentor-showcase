import { describe, expect, it, afterEach } from "vitest";
import {
  isOrdinaryUiTheme,
  isThemeUnlockBypassLogin,
  isThemeUnlocked,
  isUiTheme,
  parseUiTheme,
  resolveEffectiveUiTheme,
  THEME_PREMIUM_UNLOCK_CUPS,
  UI_THEME_DEFAULT,
  UI_THEME_LABELS,
  UI_THEMES,
  unlockCupsForTheme,
} from "@/lib/ui/theme";

describe("parseUiTheme", () => {
  it("принимает известные пресеты включая brawl", () => {
    expect(parseUiTheme("default")).toBe("default");
    expect(parseUiTheme("arcade")).toBe("arcade");
    expect(parseUiTheme("soft")).toBe("soft");
    expect(parseUiTheme("brawl")).toBe("brawl");
  });

  it("нормализует регистр и пробелы", () => {
    expect(parseUiTheme(" Arcade ")).toBe("arcade");
    expect(parseUiTheme("BRAWL")).toBe("brawl");
  });

  it("мусор → default", () => {
    expect(parseUiTheme(undefined)).toBe(UI_THEME_DEFAULT);
    expect(parseUiTheme(null)).toBe(UI_THEME_DEFAULT);
    expect(parseUiTheme("")).toBe(UI_THEME_DEFAULT);
    expect(parseUiTheme("neon")).toBe(UI_THEME_DEFAULT);
    expect(parseUiTheme(42)).toBe(UI_THEME_DEFAULT);
  });
});

describe("isUiTheme", () => {
  it("строгое совпадение без trim", () => {
    expect(isUiTheme("soft")).toBe(true);
    expect(isUiTheme("brawl")).toBe(true);
    expect(isUiTheme(" soft ")).toBe(false);
  });
});

describe("UI_THEMES labels", () => {
  it("четыре пресета с русскими подписями", () => {
    expect(UI_THEMES).toEqual(["default", "arcade", "soft", "brawl"]);
    expect(UI_THEME_LABELS.default).toBe("Классика");
    expect(UI_THEME_LABELS.arcade).toBe("Игровая");
    expect(UI_THEME_LABELS.soft).toBe("Дорама");
    expect(parseUiTheme("dorama")).toBe("soft");
    expect(UI_THEME_LABELS.brawl).toBe("Бравл");
  });
});

describe("theme unlock", () => {
  it("единый порог 1000 для всех неординарных", () => {
    expect(THEME_PREMIUM_UNLOCK_CUPS).toBe(1000);
    expect(unlockCupsForTheme("brawl")).toBe(1000);
    expect(unlockCupsForTheme("soft")).toBe(1000);
    expect(unlockCupsForTheme("default")).toBe(0);
    expect(unlockCupsForTheme("arcade")).toBe(0);
    expect(isOrdinaryUiTheme("default")).toBe(true);
    expect(isOrdinaryUiTheme("arcade")).toBe(true);
    expect(isOrdinaryUiTheme("soft")).toBe(false);
    expect(isOrdinaryUiTheme("brawl")).toBe(false);
  });

  it("default/arcade всегда открыты", () => {
    expect(isThemeUnlocked("default", 0)).toBe(true);
    expect(isThemeUnlocked("arcade", 0)).toBe(true);
  });

  it("soft и brawl закрыты до 1000 кубков", () => {
    expect(isThemeUnlocked("soft", 0)).toBe(false);
    expect(isThemeUnlocked("soft", 999)).toBe(false);
    expect(isThemeUnlocked("soft", 1000)).toBe(true);
    expect(isThemeUnlocked("brawl", 0)).toBe(false);
    expect(isThemeUnlocked("brawl", 100)).toBe(false);
    expect(isThemeUnlocked("brawl", 999)).toBe(false);
    expect(isThemeUnlocked("brawl", 1000)).toBe(true);
  });

  it("bypassUnlock открывает всё без порога", () => {
    expect(isThemeUnlocked("brawl", 0, { bypassUnlock: true })).toBe(true);
    expect(isThemeUnlocked("soft", 50, { bypassUnlock: true })).toBe(true);
  });

  it("resolveEffectiveUiTheme: locked → default; bypass оставляет тему", () => {
    expect(resolveEffectiveUiTheme("brawl", 50)).toBe("default");
    expect(resolveEffectiveUiTheme("brawl", 1000)).toBe("brawl");
    expect(resolveEffectiveUiTheme("soft", 500)).toBe("default");
    expect(resolveEffectiveUiTheme("soft", 1000)).toBe("soft");
    expect(resolveEffectiveUiTheme("arcade", 0)).toBe("arcade");
    expect(resolveEffectiveUiTheme("brawl", 0, { bypassUnlock: true })).toBe("brawl");
  });
});

describe("isThemeUnlockBypassLogin", () => {
  const prev = process.env.SEED_TEST_USER_LOGIN;

  afterEach(() => {
    if (prev === undefined) delete process.env.SEED_TEST_USER_LOGIN;
    else process.env.SEED_TEST_USER_LOGIN = prev;
  });

  it("совпадение с SEED_TEST_USER_LOGIN (регистр не важен)", () => {
    process.env.SEED_TEST_USER_LOGIN = "demo";
    expect(isThemeUnlockBypassLogin("demo")).toBe(true);
    expect(isThemeUnlockBypassLogin("Demo")).toBe(true);
    expect(isThemeUnlockBypassLogin(" demo ")).toBe(true);
    expect(isThemeUnlockBypassLogin("other")).toBe(false);
    expect(isThemeUnlockBypassLogin(null)).toBe(false);
  });

  it("без SEED_TEST_USER_LOGIN — false", () => {
    delete process.env.SEED_TEST_USER_LOGIN;
    expect(isThemeUnlockBypassLogin("demo")).toBe(false);
  });
});
