/**
 * Unit: выгрузка вариантов для аудита эталонов (P-AUDIT-INSTANCES).
 */
import { describe, expect, it } from "vitest";
import type { TopicSeed } from "./schemas";
import {
  collectInstanceExportRows,
  findVariantCollisions,
  flattenStatement,
  formatInstanceExport,
} from "./instance-export";

const HINTS = [{ text: "a" }, { text: "b" }, { text: "c" }];

function topic(): TopicSeed {
  return {
    slug: "t-x",
    title: "Тема X",
    description: "d",
    order: 1,
    classLevels: ["6"],
    articles: [{ slug: "a", title: "A", body: "b", order: 1 }],
    tasks: [
      {
        slug: "with-variants",
        title: "Сумма 3 и 4",
        statement: "Сколько будет 3 + 4?",
        acceptedAnswers: ["7"],
        answerType: "number",
        difficulty: "6",
        grade: "low",
        order: 1,
        relatedDocSlugs: ["a"],
        hintSteps: HINTS,
        instances: [
          { slug: "i0", order: 0, statement: "Сколько будет 3 + 4?", acceptedAnswers: ["7"], hintSteps: HINTS },
          {
            slug: "i1",
            order: 1,
            title: "Сумма 5 и 6",
            statement: "Сколько будет\n5 + 6?",
            acceptedAnswers: ["11", "одиннадцать"],
            hintSteps: HINTS,
          },
          {
            slug: "i2",
            order: 2,
            statement: "Смотри ```figure-svg\n<svg></svg>\n``` и сложи 1 + 1.",
            acceptedAnswers: ["2"],
            hintSteps: HINTS,
          },
        ],
      },
      {
        slug: "no-pool",
        title: "Без пула",
        statement: "s",
        acceptedAnswers: ["x"],
        answerType: "text",
        difficulty: "6",
        grade: "low",
        order: 2,
        relatedDocSlugs: ["a"],
        hintSteps: HINTS,
      },
    ],
  };
}

describe("instance-export", () => {
  it("flattenStatement: рисунок → пометка, пробелы и переносы схлопнуты", () => {
    expect(flattenStatement("a\n\n```figure-svg\n<svg/>\n```\n  b")).toBe("a [рисунок] b");
  });

  it("берёт только варианты с другим условием; задачи без пула пропускает", () => {
    const rows = collectInstanceExportRows(topic());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.variants.map((v) => v.slug)).toEqual(["i1", "i2"]);
  });

  it("markdown: канон и варианты с эталонами, все принимаемые ответы через « | »", () => {
    const t = topic();
    const md = formatInstanceExport(t, collectInstanceExportRows(t));
    expect(md).toContain("Задач с вариантами: 1; вариантов: 2.");
    expect(md).toContain("## with-variants — Сумма 3 и 4 (number)");
    expect(md).toContain("- **канон:** Сколько будет 3 + 4?");
    expect(md).toContain("- **i1** «Сумма 5 и 6»: Сколько будет 5 + 6?");
    expect(md).toContain("эталон: `11 | одиннадцать`");
    expect(md).toContain("- **i2**: Смотри [рисунок] и сложи 1 + 1.");
    expect(md).not.toContain("no-pool");
    expect(md).toContain("## Автопроверка: подозрения на дубли\n\nНет.");
  });

  it("findVariantCollisions: ловит одинаковые условия и одинаковые наборы ответов, копию канона пропускает", () => {
    const t = topic();
    const task = t.tasks[0]!;
    task.instances = [
      ...task.instances!,
      { slug: "i3", order: 3, statement: "Сколько будет 5 + 6?", acceptedAnswers: ["12"], hintSteps: HINTS },
      { slug: "i4", order: 4, statement: "А 9 + 2?", acceptedAnswers: [" Одиннадцать", "11"], hintSteps: HINTS },
    ];
    expect(findVariantCollisions(t)).toEqual([
      { taskSlug: "with-variants", a: "i1", b: "i3", kind: "same-statement" },
      { taskSlug: "with-variants", a: "i1", b: "i4", kind: "same-answers" },
    ]);
    expect(formatInstanceExport(t, collectInstanceExportRows(t))).toContain(
      "- with-variants: i1 ↔ i4 — одинаковый набор ответов",
    );
  });
});
