/**
 * Unit: вкладки главной (UX-HOME).
 */
import { describe, expect, it } from "vitest";
import {
  HOME_TAB_GATHER,
  HOME_TAB_TODAY,
  HOME_TAB_TOPICS,
  homeTabHref,
  homeTopicsHref,
  parseHomeTab,
  topicBackToTopicsHref,
} from "./tab";

describe("parseHomeTab", () => {
  it("дефолт today", () => {
    expect(parseHomeTab(undefined)).toBe(HOME_TAB_TODAY);
    expect(parseHomeTab("")).toBe(HOME_TAB_TODAY);
    expect(parseHomeTab("nope")).toBe(HOME_TAB_TODAY);
  });

  it("gather / topics / явный today", () => {
    expect(parseHomeTab("gather")).toBe(HOME_TAB_GATHER);
    expect(parseHomeTab("topics")).toBe(HOME_TAB_TOPICS);
    expect(parseHomeTab("Gather")).toBe(HOME_TAB_GATHER);
    expect(parseHomeTab("today")).toBe(HOME_TAB_TODAY);
  });
});

describe("homeTabHref / homeTopicsHref", () => {
  it("today без query; gather/topics с ?home=", () => {
    expect(homeTabHref(HOME_TAB_TODAY)).toBe("/");
    expect(homeTabHref(HOME_TAB_GATHER)).toBe("/?home=gather");
    expect(homeTabHref(HOME_TAB_TOPICS)).toBe("/?home=topics");
  });

  it("темы с subject и grade", () => {
    expect(homeTopicsHref("math", 6)).toBe("/?home=topics&subject=math&grade=6");
  });
});

describe("topicBackToTopicsHref", () => {
  it("5-6 и 6 → слот math/6", () => {
    expect(topicBackToTopicsHref(["5-6"])).toBe("/?home=topics&subject=math&grade=6");
    expect(topicBackToTopicsHref(["6"])).toBe("/?home=topics&subject=math&grade=6");
  });

  it("без класса → просто вкладка topics", () => {
    expect(topicBackToTopicsHref([])).toBe("/?home=topics");
  });
});
