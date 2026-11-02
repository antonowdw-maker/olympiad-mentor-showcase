/**
 * Выгрузка вариантов задач для аудита эталонов (P-AUDIT-INSTANCES).
 *
 * Формат — markdown-блоки по задачам: канон с эталоном, затем каждый вариант,
 * у которого условие отличается от канона. Рисунки (figure-svg) заменяются
 * пометкой, чтобы выгрузку можно было читать и отдавать Verifier.
 */
import type { TaskSeed, TopicSeed } from "./schemas";

export type InstanceExportRow = {
  taskSlug: string;
  title: string;
  answerType: TaskSeed["answerType"];
  canonStatement: string;
  canonAnswers: string[];
  variants: { slug: string; title?: string; statement: string; answers: string[] }[];
};

/** Условие в одну строку: рисунок → пометка, пробелы схлопнуты. */
export function flattenStatement(statement: string): string {
  return statement
    .replace(/```figure-svg[\s\S]*?```/g, "[рисунок]")
    .replace(/\s+/g, " ")
    .trim();
}

/** Задачи темы, у которых есть хотя бы один вариант с другим условием. */
export function collectInstanceExportRows(topic: TopicSeed): InstanceExportRow[] {
  const rows: InstanceExportRow[] = [];
  for (const t of topic.tasks) {
    const variants = (t.instances ?? [])
      .filter((i) => i.statement !== t.statement)
      .map((i) => ({
        slug: i.slug,
        title: i.title,
        statement: i.statement,
        answers: i.acceptedAnswers,
      }));
    if (variants.length === 0) continue;
    rows.push({
      taskSlug: t.slug,
      title: t.title,
      answerType: t.answerType,
      canonStatement: t.statement,
      canonAnswers: t.acceptedAnswers,
      variants,
    });
  }
  return rows;
}

export type VariantCollision = {
  taskSlug: string;
  a: string;
  b: string;
  kind: "same-statement" | "same-answers";
};

const normAnswers = (xs: string[]) =>
  [...new Set(xs.map((x) => x.trim().toLowerCase().replace(/\s+/g, " ")))].sort().join("\u0001");

/**
 * Подозрения на дубли внутри задачи: пары «канон / вариант / вариант» с
 * одинаковым условием (кроме копии канона — это штатный i0) или с одинаковым
 * набором принимаемых ответов при разных условиях. Смысловой дубль с другим
 * ответом так не ловится — это остаётся на ручной аудит.
 */
export function findVariantCollisions(topic: TopicSeed): VariantCollision[] {
  const res: VariantCollision[] = [];
  for (const t of topic.tasks) {
    const items = [
      { slug: "канон", statement: t.statement, answers: t.acceptedAnswers },
      ...(t.instances ?? [])
        .filter((i) => i.statement !== t.statement)
        .map((i) => ({ slug: i.slug, statement: i.statement, answers: i.acceptedAnswers })),
    ];
    for (let x = 0; x < items.length; x++)
      for (let y = x + 1; y < items.length; y++) {
        const [p, q] = [items[x]!, items[y]!];
        const kind =
          flattenStatement(p.statement) === flattenStatement(q.statement)
            ? "same-statement"
            : normAnswers(p.answers) === normAnswers(q.answers)
              ? "same-answers"
              : null;
        if (kind) res.push({ taskSlug: t.slug, a: p.slug, b: q.slug, kind });
      }
  }
  return res;
}

/** Markdown для отчёта / Verifier. */
export function formatInstanceExport(topic: TopicSeed, rows: InstanceExportRow[]): string {
  const total = rows.reduce((s, r) => s + r.variants.length, 0);
  const out: string[] = [
    `# Варианты темы ${topic.slug} — ${topic.title}`,
    "",
    `Задач с вариантами: ${rows.length}; вариантов: ${total}.`,
    "Эталоны через « | » — все принимаемые ответы.",
  ];
  for (const r of rows) {
    out.push(
      "",
      `## ${r.taskSlug} — ${r.title} (${r.answerType})`,
      "",
      `- **канон:** ${flattenStatement(r.canonStatement)}`,
      `  - эталон: \`${r.canonAnswers.join(" | ")}\``,
    );
    for (const v of r.variants) {
      const title = v.title ? ` «${v.title}»` : "";
      out.push(
        `- **${v.slug}**${title}: ${flattenStatement(v.statement)}`,
        `  - эталон: \`${v.answers.join(" | ")}\``,
      );
    }
  }
  const collisions = findVariantCollisions(topic);
  out.push("", "## Автопроверка: подозрения на дубли", "");
  if (collisions.length === 0) out.push("Нет.");
  for (const c of collisions) {
    const why = c.kind === "same-statement" ? "одинаковое условие" : "одинаковый набор ответов";
    out.push(`- ${c.taskSlug}: ${c.a} ↔ ${c.b} — ${why}`);
  }
  return `${out.join("\n")}\n`;
}
