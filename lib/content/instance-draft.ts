/**
 * Iter 12b: черновики изоморфных TaskInstance через LLM (offline CLI).
 * Не runtime ученика: только промпт → JSON → validate → файл для ручного review.
 */
import {
  taskInstanceSeedSchema,
  type TaskInstanceSeed,
  type TaskSeed,
} from "@/lib/content/schemas";
import { validateTopicContent, type ContentValidationIssue } from "@/lib/content/validate";
import type { TopicSeed } from "@/lib/content/schemas";

export type InstanceDraftCanon = Pick<
  TaskSeed,
  | "slug"
  | "title"
  | "statement"
  | "acceptedAnswers"
  | "answerType"
  | "options"
  | "table"
  | "difficulty"
  | "grade"
  | "relatedDocSlugs"
  | "hintSteps"
  | "instances"
> & {
  sourceHint?: string;
};

export function buildInstanceDraftPrompt(input: {
  task: InstanceDraftCanon;
  /** Сколько новых вариантов запросить (≥3). */
  count: number;
  /** Уже существующие условия — не повторять. */
  avoidStatements?: string[];
}): { system: string; user: string } {
  const count = Math.max(3, Math.floor(input.count));
  const related = input.task.relatedDocSlugs.join(", ");
  const avoid = [
    input.task.statement,
    ...(input.task.instances?.map((i) => i.statement) ?? []),
    ...(input.avoidStatements ?? []),
  ];

  const system = [
    "Ты — автор олимпиадных задач по математике для 5–6 класса (русский язык).",
    "Создай ИЗОМОРФНЫЕ варианты канонической задачи: тот же приём и тип ответа, другие числа/имена/формулировка.",
    "Нельзя: менять математическую идею; спойлерить эталон в подсказках; ссылаться на внешние сайты.",
    "Подсказки — ступени без готового ответа; docSlug только из списка разрешённых статей задачи.",
    "Ответ — ТОЛЬКО JSON-массив объектов (без markdown и пояснений).",
  ].join("\n");

  const user = [
    `Нужно ровно ${count} вариантов.`,
    `Канон slug: ${input.task.slug}`,
    `title: ${input.task.title}`,
    `answerType: ${input.task.answerType}`,
    `difficulty: ${input.task.difficulty}`,
    `grade: ${input.task.grade}`,
    `relatedDocSlugs (только эти): ${related}`,
    `statement канона:\n${input.task.statement}`,
    `acceptedAnswers канона (для понимания эталона; в подсказки не копировать):\n${JSON.stringify(input.task.acceptedAnswers)}`,
    input.task.options
      ? `options канона (для choice сохрани число вариантов):\n${JSON.stringify(input.task.options)}`
      : "",
    input.task.table
      ? `table канона (для table дай свою table варианта; ответ — строки через «;», ячейки через «,»; порядок values не должен совпадать с ответом):\n${JSON.stringify(input.task.table)}`
      : "",
    `Пример hintSteps канона (стиль, не копируй дословно):\n${JSON.stringify(input.task.hintSteps.slice(0, 3))}`,
    `Не повторяй эти условия:\n${avoid.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    "",
    "Схема каждого элемента:",
    JSON.stringify(
      {
        slug: "i3",
        order: 0,
        statement: "…",
        acceptedAnswers: ["…"],
        options: input.task.answerType === "choice" ? ["…", "…"] : undefined,
        hintSteps: [
          { text: "…", docSlug: input.task.relatedDocSlugs[0] },
          { text: "…" },
          { text: "…" },
        ],
      },
      null,
      2,
    ),
    "slug — короткий суффикс (i0, i1, …) без префикса taskSlug.",
    "order — 0..n-1 уникальные.",
    "hintSteps — минимум 3; docSlug опционален и только из relatedDocSlugs.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/** Вырезает JSON из ответа модели (в т.ч. из ```json fences). */
export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const startArr = trimmed.indexOf("[");
  const startObj = trimmed.indexOf("{");
  if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
    return trimmed.slice(startArr);
  }
  if (startObj >= 0) return trimmed.slice(startObj);
  return trimmed;
}

export type ParseDraftResult =
  | { ok: true; instances: TaskInstanceSeed[] }
  | { ok: false; error: string };

export function parseInstanceDraftJson(raw: string): ParseDraftResult {
  const text = extractJsonPayload(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Иногда модель отдаёт хвост после массива — обрезаем до последней ]
    const end = text.lastIndexOf("]");
    if (end > 0) {
      try {
        parsed = JSON.parse(text.slice(0, end + 1));
      } catch {
        return { ok: false, error: "Ответ LLM не является JSON" };
      }
    } else {
      return { ok: false, error: "Ответ LLM не является JSON" };
    }
  }

  // Допускаем обёртку { "instances": [...] }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { instances?: unknown }).instances)
  ) {
    parsed = (parsed as { instances: unknown[] }).instances;
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Ожидался JSON-массив instances" };
  }

  const instances: TaskInstanceSeed[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const r = taskInstanceSeedSchema.safeParse(parsed[i]);
    if (!r.success) {
      return {
        ok: false,
        error: `Элемент[${i}] не прошёл Zod: ${r.error.issues[0]?.message ?? "invalid"}`,
      };
    }
    instances.push(r.data);
  }
  if (instances.length < 3) {
    return { ok: false, error: `Нужно ≥3 instance, получено ${instances.length}` };
  }
  return { ok: true, instances };
}

/**
 * Прогон тех же правил, что у сида: подставляем drafts в task.instances
 * внутри минимального TopicSeed-каркаса.
 */
export function validateInstanceDraftsAgainstTask(
  task: InstanceDraftCanon,
  instances: TaskInstanceSeed[],
): { ok: boolean; issues: ContentValidationIssue[] } {
  const topicStub: TopicSeed = {
    slug: "_draft-topic",
    title: "draft",
    description: "draft",
    order: 0,
    classLevels: ["5-6"],
    articles: task.relatedDocSlugs.map((slug, order) => ({
      slug,
      title: slug,
      body: "x",
      order,
    })),
    tasks: [
      {
        slug: task.slug,
        title: task.title,
        statement: task.statement,
        acceptedAnswers: task.acceptedAnswers,
        answerType: task.answerType,
        options: task.options,
        table: task.table,
        difficulty: task.difficulty,
        grade: task.grade,
        order: 0,
        relatedDocSlugs: task.relatedDocSlugs,
        hintSteps: task.hintSteps,
        sourceHint: task.sourceHint ?? "original · olympiad-mentor draft-instances",
        instances,
      },
    ],
  };

  const result = validateTopicContent(topicStub, {
    minArticles: 1,
    minTasks: 1,
  });
  // Каркас минимальный — важны ошибки instance / утечки / типы
  const issues = result.issues.filter(
    (i) =>
      !["TOPIC_ARTICLES_MIN", "TOPIC_TASKS_MIN"].includes(i.code) &&
      i.severity === "error",
  );
  return { ok: issues.length === 0, issues };
}

/** Имя файла черновика для taskSlug. */
export function instanceDraftFileName(taskSlug: string): string {
  return `${taskSlug}.instances.json`;
}
