import { describe, expect, it } from "vitest";
import { isAnswerCorrect, normalizeAnswer } from "@/lib/trainer/answer";

describe("normalizeAnswer", () => {
  it("обрезает пробелы и приводит к нижнему регистру", () => {
    expect(normalizeAnswer("  Да  ", "text")).toBe("да");
  });

  it("для number заменяет запятую на точку", () => {
    expect(normalizeAnswer("3,14", "number")).toBe("3.14");
  });

  it("сводит гомоглифы в коротких ответах", () => {
    expect(normalizeAnswer("a", "choice")).toBe("а");
    expect(normalizeAnswer("H", "text")).toBe("н");
  });

  it("не трогает гомоглифы в длинных фразах", () => {
    expect(normalizeAnswer("apple", "text")).toBe("apple");
  });
});

describe("isAnswerCorrect", () => {
  it("принимает любой синоним из acceptedAnswers", () => {
    expect(isAnswerCorrect("нет", ["Нет", "нельзя"], "text")).toBe(true);
    expect(isAnswerCorrect("нельзя", ["Нет", "нельзя"], "text")).toBe(true);
  });

  it("отклоняет неверный ответ", () => {
    expect(isAnswerCorrect("да", ["нет"], "text")).toBe(false);
  });

  it("сравнивает числа с запятой и точкой", () => {
    expect(isAnswerCorrect("2,5", ["2.5"], "number")).toBe(true);
  });

  it("учитывает гомоглиф в choice", () => {
    expect(isAnswerCorrect("a", ["а"], "choice")).toBe(true);
  });
});
