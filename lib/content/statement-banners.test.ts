import { describe, expect, it } from "vitest";
import { splitMisereBanner } from "./statement-banners";

describe("splitMisereBanner", () => {
  it("выделяет плашку мизера из первой строки", () => {
    const r = splitMisereBanner(
      "Игра по правилам мизера!\nВ куче 4 камня. Последний проигрывает.",
    );
    expect(r.banner).toBe(true);
    expect(r.body).toBe("В куче 4 камня. Последний проигрывает.");
  });

  it("без маркера оставляет текст как есть", () => {
    const s = "4 камня, последний выиграл. Кто?";
    expect(splitMisereBanner(s)).toEqual({ banner: false, body: s });
  });
});
