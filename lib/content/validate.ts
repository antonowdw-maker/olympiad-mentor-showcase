/**
 * Валидация пакета контента темы (REQ-CNT-10..15, INV-02).
 * Проверяет связи task↔docs, инварианты волны и отсутствие эталона в подсказках.
 */
import {
  topicSeedSchema,
  type TopicSeed,
  type TaskSeed,
  type AnswerTable,
} from "./schemas";
import {
  TABLE_CELL_SEPARATOR,
  TABLE_ROW_SEPARATOR,
  findTableAnswerShapeIssue,
  normalizeTableCell,
  parseTableAnswer,
} from "./answer-table";
import { olympiadGradeRank, type OlympiadGrade } from "./grade";
import { isReservedPlanSelectionSlug } from "@/lib/reserved-plan-slugs";
import {
  assertSafeTaskSvg,
  isAllowedFigurePublicPath,
  listFigurePublicPathsInText,
  listFigureSvgFences,
  statementRefsMissingFigure,
} from "./figures";

export type ContentIssueSeverity = "error" | "warn";

export type ContentValidationIssue = {
  code: string;
  message: string;
  path?: string;
  /** error валит сид; warn только печатается */
  severity?: ContentIssueSeverity;
};

export type ValidateTopicOptions = {
  /** Минимум статей (дефолт 1). T1 передаёт 5. */
  minArticles?: number;
  /** Минимум задач (дефолт 3). T1 передаёт 15. */
  minTasks?: number;
  /** Warn при раздувании списка (долг пагинации, PLAN iter 10). */
  warnTasksAbove?: number;
};

const DEFAULT_MIN_ARTICLES = 1;
const DEFAULT_MIN_TASKS = 3;
const DEFAULT_WARN_TASKS_ABOVE = 40;

function normalizeForLeakCheck(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Пары латиница/кириллица, которые нельзя одновременно держать в choice options. */
export const CHOICE_LATIN_CYR_PAIRS: readonly [string, string][] = [
  ["a", "а"],
  ["b", "б"],
  ["c", "в"],
];

/** Дубли a/а, b/б, c/в в списке options. */
export function choiceOptionsHaveLatinCyrDup(options: string[]): boolean {
  const lower = options.map((o) => normalizeForLeakCheck(o));
  return CHOICE_LATIN_CYR_PAIRS.some(
    ([lat, cyr]) => lower.includes(lat) && lower.includes(cyr),
  );
}

/** Короткие эталоны: standalone в обычной фразе не считаем утечкой (политика A). */
export const SHORT_ANSWERS = new Set(["да", "нет", "yes", "no", "true", "false"]);

/**
 * Оборот перед коротким эталоном («получается нет», «значит 3»).
 * Общий список для валидатора контента и фильтра наставника (I5-01).
 */
export const SHORT_ANSWER_LEAK_CUES =
  "ответ(?:\\s+на\\s+похожую)?|значит|итог|вывод|вариант|получается|выходит|равно|ровно|будет|итак|то\\s+есть";

/** Правая граница токена: не буква/цифра Unicode (не ASCII \b). */
export const LEAK_RIGHT_BOUND = "(?![\\p{L}\\p{N}])";

/**
 * Числа из названия, которых нет в условии (как отдельных чисел, не частей других).
 * Пустой массив — название с условием согласовано.
 */
export function titleNumbersMissingInStatement(title: string, statement: string): string[] {
  const nums = [...new Set(title.match(/\d+/g) ?? [])];
  return nums.filter((n) => !new RegExp(`(^|\\D)${n}(\\D|$)`).test(statement));
}

export function isShortAnswerToken(na: string): boolean {
  const n = normalizeForLeakCheck(na);
  return n.length > 0 && (n.length <= 2 || SHORT_ANSWERS.has(n));
}

export function isNumericAnswerToken(s: string): boolean {
  const n = s.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(n);
}

/** Самостоятельный числовой токен (не часть 13 / 3.14). */
export function numericAnswerTokenRegex(answer: string): RegExp {
  const n = answer.trim().replace(",", "\\.");
  return new RegExp(`(?<![\\d.,])${escapeRegex(n)}(?![\\d.,])`, "gu");
}

/** Шаблон «cue + короткий ответ» для да/нет и букв. */
export function shortAnswerCueRegex(answer: string): RegExp {
  const na = escapeRegex(answer.trim());
  return new RegExp(
    `(?:${SHORT_ANSWER_LEAK_CUES})\\s*[,:\\-—–]?\\s*«?${na}»?${LEAK_RIGHT_BOUND}`,
    "giu",
  );
}

/**
 * Узкие словоформы эталонов «первый»/«второй» (REVIEW-WG / WG-10).
 * Не общий корень: «перебор» / «вторично» не должны ловиться.
 */
export const ANSWER_WORD_FORMS: Record<string, readonly string[]> = {
  первый: ["первый", "первого", "первому", "первым", "первом"],
  второй: ["второй", "второго", "второму", "вторым", "втором"],
};

/** Канон + известные словоформы для проверки утечки. */
export function answerLeakForms(answer: string): string[] {
  const na = normalizeForLeakCheck(answer);
  const forms = ANSWER_WORD_FORMS[na];
  return forms ? [...forms] : [na];
}

function wordFormLeakRegex(form: string): RegExp {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegex(form)}${LEAK_RIGHT_BOUND}`,
    "iu",
  );
}

/**
 * Утечка эталона в тексте.
 * Длинные ответы — целое слово / подстрока (для >6).
 * Короткие (да/нет/буквы) — ТОЛЬКО в шаблонах SHORT_ANSWER_LEAK_CUES
 * (политика A: отдельное слово «нет» в «здесь нет противоречия» — не утечка).
 * Числа: самостоятельный токен ИЛИ cue+число (для валидации подсказок осторожно —
 * «разбери 3 случая» без cue не ловим).
 * «первый»/«второй» — также падежные формы из ANSWER_WORD_FORMS.
 */
export function textLeaksAnswer(text: string, answers: string[]): boolean {
  return answers.some((a) => {
    const na = normalizeForLeakCheck(a);
    if (na.length === 0) return false;

    if (isNumericAnswerToken(a)) {
      // В контенте (подсказки) не режем голую цифру — только cue+число
      return shortAnswerCueRegex(a).test(text);
    }

    if (isShortAnswerToken(na)) {
      return shortAnswerCueRegex(a).test(text);
    }

    const forms = answerLeakForms(a);
    if (forms.length > 1 || na.length <= 6) {
      return forms.some((form) => wordFormLeakRegex(form).test(text));
    }

    return normalizeForLeakCheck(text).includes(na);
  });
}

/**
 * Для детектора утечек: канон (первый) + длинные синонимы (>6).
 * Короткие синонимы ввода (верно/true) не ломают нормальные подсказки (U-05).
 */
export function leakDictionary(acceptedAnswers: string[]): string[] {
  if (acceptedAnswers.length === 0) return [];
  const [canon, ...rest] = acceptedAnswers;
  const longSynonyms = rest.filter((a) => normalizeForLeakCheck(a).length > 6);
  return [canon, ...longSynonyms];
}

/**
 * Объединение словарей утечек по задачам (BC-01 / topic-chat).
 * На каждую группу — свой канон через leakDictionary; короткие каноны 2-й+ задачи не теряются.
 */
export function leakDictionaryFromTaskGroups(groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) continue;
    for (const ans of leakDictionary(group)) {
      const key = normalizeForLeakCheck(ans);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(ans);
    }
  }
  return out;
}

/**
 * Проверки табличного ответа (P-TABLE-ANSWER) для задачи или instance.
 * codePrefix: "" для задачи, "INSTANCE_" для варианта.
 * Анти-спойлер: порядок значений столбца не должен совпадать с порядком эталона
 * (иначе ученик «заполнит по диагонали», не решая) — при ≥3 строках это error.
 */
function pushTableIssues(
  issues: ContentValidationIssue[],
  args: {
    label: string;
    path: string;
    codePrefix: "" | "INSTANCE_";
    answerType: TaskSeed["answerType"];
    table: AnswerTable | undefined;
    options: string[] | undefined;
    acceptedAnswers: string[];
  },
): void {
  const { label, path, codePrefix, answerType, table, options, acceptedAnswers } = args;
  const push = (code: string, message: string, subPath: string) =>
    issues.push({ code: `${codePrefix}${code}`, message, path: `${path}.${subPath}`, severity: "error" });

  if (answerType !== "table") {
    if (table) push("TABLE_FORBIDDEN", `${label}: table задан, но answerType не table`, "table");
    return;
  }
  if (!table) {
    push("TABLE_REQUIRED", `${label}: answerType table требует описание table`, "table");
    return;
  }
  if (options) {
    push("TABLE_OPTIONS_FORBIDDEN", `${label}: у табличной задачи не бывает options`, "options");
  }

  const cellValues = [table.rowHeader, ...table.rows, ...table.columns.flatMap((c) => [c.title, ...c.values])];
  const badSep = cellValues.find((v) => v.includes(TABLE_ROW_SEPARATOR) || v.includes(TABLE_CELL_SEPARATOR));
  if (badSep) {
    push("TABLE_VALUE_SEPARATOR", `${label}: значение «${badSep}» содержит «,» или «;»`, "table");
  }
  const dupRows = new Set(table.rows.map(normalizeTableCell)).size !== table.rows.length;
  const dupCol = table.columns.find(
    (c) => new Set(c.values.map(normalizeTableCell)).size !== c.values.length,
  );
  if (dupRows || dupCol) {
    push("TABLE_VALUES_DUP", `${label}: дубли в строках или значениях столбца`, "table");
  }

  for (const ans of acceptedAnswers) {
    const issue = findTableAnswerShapeIssue(ans, table);
    if (!issue) continue;
    if (issue.kind === "value") {
      push("TABLE_ANSWER_VALUE", `${label}: «${issue.value}» нет в столбце «${table.columns[issue.column]!.title}»`, "acceptedAnswers");
    } else {
      push("TABLE_ANSWER_SHAPE", `${label}: эталон не заполняет таблицу ${table.rows.length}×${table.columns.length}`, "acceptedAnswers");
    }
  }

  const canon = acceptedAnswers[0];
  if (canon && table.rows.length >= 3 && !findTableAnswerShapeIssue(canon, table)) {
    const cells = parseTableAnswer(canon);
    table.columns.forEach((col, c) => {
      const answerOrder = cells.map((row) => normalizeTableCell(row[c]!));
      const shown = col.values.slice(0, answerOrder.length).map(normalizeTableCell);
      if (shown.join("\n") === answerOrder.join("\n")) {
        push("TABLE_OPTIONS_SPOIL", `${label}: порядок значений столбца «${col.title}» совпадает с эталоном (спойлер)`, "table");
      }
    });
  }
}

function hasErrors(issues: ContentValidationIssue[]): boolean {
  return issues.some((i) => (i.severity ?? "error") === "error");
}

/**
 * Валидирует структуру темы и инварианты контента.
 * При error-issues data не возвращается (REQ-CNT-11 / W-09).
 * Warn не валит ok.
 */
export function validateTopicContent(
  raw: unknown,
  options: ValidateTopicOptions = {},
): {
  ok: boolean;
  data?: TopicSeed;
  issues: ContentValidationIssue[];
} {
  const minArticles = options.minArticles ?? DEFAULT_MIN_ARTICLES;
  const minTasks = options.minTasks ?? DEFAULT_MIN_TASKS;
  const warnTasksAbove = options.warnTasksAbove ?? DEFAULT_WARN_TASKS_ABOVE;

  const parsed = topicSeedSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        code: "SCHEMA",
        message: i.message,
        path: i.path.join("."),
        severity: "error" as const,
      })),
    };
  }

  const data = parsed.data;
  const issues: ContentValidationIssue[] = [];

  if (isReservedPlanSelectionSlug(data.slug)) {
    issues.push({
      code: "RESERVED_TOPIC_SLUG",
      message: `Slug темы «${data.slug}» зарезервирован для плана (mixed/gather)`,
      path: "slug",
      severity: "error",
    });
  }

  const articleSlugList = data.articles.map((a) => a.slug);
  const taskSlugList = data.tasks.map((t) => t.slug);
  const articleSlugs = new Set(articleSlugList);
  const taskSlugs = new Set(taskSlugList);

  if (articleSlugList.length !== articleSlugs.size) {
    issues.push({
      code: "DUPLICATE_SLUG",
      message: "Дубли slug статей в теме",
      severity: "error",
    });
  }
  if (taskSlugList.length !== taskSlugs.size) {
    issues.push({
      code: "DUPLICATE_SLUG",
      message: "Дубли slug задач в теме",
      severity: "error",
    });
  }

  if (data.articles.length < minArticles) {
    issues.push({
      code: "ARTICLE_COUNT",
      message: `Ожидается ≥${minArticles} статей, сейчас ${data.articles.length}`,
      severity: "error",
    });
  }
  if (data.tasks.length < minTasks) {
    issues.push({
      code: "TASK_COUNT",
      message: `Ожидается ≥${minTasks} задач, сейчас ${data.tasks.length}`,
      severity: "error",
    });
  }
  if (data.tasks.length > warnTasksAbove) {
    issues.push({
      code: "TASK_COUNT_LARGE",
      message: `Задач ${data.tasks.length} (>${warnTasksAbove}) — пора пагинация (PLAN iter 10)`,
      severity: "warn",
    });
  }

  for (const task of data.tasks) {
    const uniqAnswers = new Set(task.acceptedAnswers.map((a) => normalizeForLeakCheck(a)));
    if (uniqAnswers.size !== task.acceptedAnswers.length) {
      issues.push({
        code: "DUPLICATE_ANSWER",
        message: `Задача «${task.slug}»: дубли в acceptedAnswers`,
        path: `tasks.${task.slug}.acceptedAnswers`,
        severity: "error",
      });
    }

    if (!task.sourceHint?.trim()) {
      issues.push({
        code: "MISSING_SOURCE_HINT",
        message: `Задача «${task.slug}»: нужен sourceHint (REQ-CNT-15)`,
        path: `tasks.${task.slug}.sourceHint`,
        severity: "error",
      });
    }

    // M6-0: фигуры в условии — безопасный SVG (A) и пути /content/figures/ (B).
    pushFigureIssues(issues, task.slug, task.statement, `tasks.${task.slug}.statement`);
    if (task.instances) {
      for (const inst of task.instances) {
        pushFigureIssues(
          issues,
          `${task.slug}/${inst.slug}`,
          inst.statement,
          `tasks.${task.slug}.instances.${inst.slug}.statement`,
        );
      }
    }

    if (task.hintSteps.length < 3) {
      issues.push({
        code: "HINT_STEPS_MIN",
        message: `Задача «${task.slug}»: нужно ≥3 ступени подсказок (REQ-CNT-15)`,
        path: `tasks.${task.slug}.hintSteps`,
        severity: "error",
      });
    }

    if (task.instances) {
      const orders = new Set(task.instances.map((i) => i.order));
      if (orders.size !== task.instances.length) {
        issues.push({
          code: "INSTANCE_ORDER_DUP",
          message: `Задача «${task.slug}»: дубли order у instances`,
          path: `tasks.${task.slug}.instances`,
          severity: "error",
        });
      }
      const instSlugs = new Set(task.instances.map((i) => i.slug));
      if (instSlugs.size !== task.instances.length) {
        issues.push({
          code: "INSTANCE_SLUG_DUP",
          message: `Задача «${task.slug}»: дубли slug у instances`,
          path: `tasks.${task.slug}.instances`,
          severity: "error",
        });
      }
      for (const inst of task.instances) {
        // Заголовок варианта не должен противоречить его условию («3×4» при условии «4×5»).
        // Вариант-канон (то же условие, без своего title) не проверяем — там заголовок канона.
        if (inst.title !== undefined || inst.statement !== task.statement) {
          const shownTitle = inst.title ?? task.title;
          const missing = titleNumbersMissingInStatement(shownTitle, inst.statement);
          if (missing.length > 0) {
            issues.push({
              code: "INSTANCE_TITLE_MISMATCH",
              message:
                `Instance «${task.slug}/${inst.slug}»: в названии «${shownTitle}» есть ` +
                `${missing.join(", ")}, а в условии варианта нет — задай свой title`,
              path: `tasks.${task.slug}.instances.${inst.slug}.title`,
              severity: "error",
            });
          }
        }
        if (inst.hintSteps.length < 3) {
          issues.push({
            code: "INSTANCE_HINT_STEPS_MIN",
            message: `Instance «${task.slug}/${inst.slug}»: нужно ≥3 ступени`,
            path: `tasks.${task.slug}.instances.${inst.slug}.hintSteps`,
            severity: "error",
          });
        }
        if (task.answerType === "number") {
          const allNumeric = inst.acceptedAnswers.every(isNumericAnswerToken);
          if (!allNumeric) {
            issues.push({
              code: "INSTANCE_ANSWER_TYPE_MISMATCH",
              message: `Instance «${task.slug}/${inst.slug}»: number, но ответы не числовые`,
              path: `tasks.${task.slug}.instances.${inst.slug}.acceptedAnswers`,
              severity: "error",
            });
          }
        }
        const leakAnswers = leakDictionary(inst.acceptedAnswers);
        if (inst.hintSteps.some((s) => textLeaksAnswer(s.text, leakAnswers))) {
          issues.push({
            code: "INSTANCE_HINT_LEAK",
            message: `Instance «${task.slug}/${inst.slug}»: подсказка содержит эталон`,
            path: `tasks.${task.slug}.instances.${inst.slug}.hintSteps`,
            severity: "error",
          });
        }
        for (const step of inst.hintSteps) {
          if (step.docSlug && !task.relatedDocSlugs.includes(step.docSlug)) {
            issues.push({
              code: "INSTANCE_HINT_DOC_UNRELATED",
              message: `Instance «${task.slug}/${inst.slug}»: docSlug «${step.docSlug}» не из relatedDocSlugs`,
              path: `tasks.${task.slug}.instances.${inst.slug}.hintSteps`,
              severity: "error",
            });
          }
        }
        pushTableIssues(issues, {
          label: `Instance «${task.slug}/${inst.slug}»`,
          path: `tasks.${task.slug}.instances.${inst.slug}`,
          codePrefix: "INSTANCE_",
          answerType: task.answerType,
          table: inst.table ?? task.table,
          options: inst.options,
          acceptedAnswers: inst.acceptedAnswers,
        });
        if (task.answerType === "choice") {
          const opts = inst.options ?? task.options ?? [];
          if (opts.length < 2) {
            issues.push({
              code: "INSTANCE_CHOICE_OPTIONS",
              message: `Instance «${task.slug}/${inst.slug}»: choice требует options ≥ 2`,
              path: `tasks.${task.slug}.instances.${inst.slug}.options`,
              severity: "error",
            });
          } else {
            const normOpts = new Set(opts.map((o) => normalizeForLeakCheck(o)));
            const allIn = inst.acceptedAnswers.every((a) =>
              normOpts.has(normalizeForLeakCheck(a)),
            );
            if (!allIn) {
              issues.push({
                code: "INSTANCE_CHOICE_ANSWER",
                message: `Instance «${task.slug}/${inst.slug}»: acceptedAnswers вне options`,
                path: `tasks.${task.slug}.instances.${inst.slug}.acceptedAnswers`,
                severity: "error",
              });
            }
            if (choiceOptionsHaveLatinCyrDup(opts)) {
              issues.push({
                code: "INSTANCE_CHOICE_OPTIONS_LATIN_DUP",
                message: `Instance «${task.slug}/${inst.slug}»: options содержат латиницу и кириллицу a/а (или b/б, c/в)`,
                path: `tasks.${task.slug}.instances.${inst.slug}.options`,
                severity: "error",
              });
            }
          }
        }
      }
      // T1P-09 / §3b: все instance с одним и тем же «главным» эталоном — слабая вариативность
      if (task.instances.length >= 3) {
        const primaries = task.instances.map((i) =>
          normalizeForLeakCheck(i.acceptedAnswers[0] ?? ""),
        );
        const allSame =
          primaries[0]!.length > 0 && primaries.every((p) => p === primaries[0]);
        if (allSame) {
          issues.push({
            code: "INSTANCE_ANSWER_MONOTONE",
            message: `Задача «${task.slug}»: у всех instance одинаковый главный эталон «${primaries[0]}» (T1P-09)`,
            path: `tasks.${task.slug}.instances`,
            severity: "warn",
          });
        }
      }
    }

    if (task.answerType === "number") {
      const allNumeric = task.acceptedAnswers.every(isNumericAnswerToken);
      if (!allNumeric) {
        issues.push({
          code: "ANSWER_TYPE_MISMATCH",
          message: `Задача «${task.slug}»: answerType number, но acceptedAnswers не числовые`,
          path: `tasks.${task.slug}.acceptedAnswers`,
          severity: "error",
        });
      }
    }

    pushTableIssues(issues, {
      label: `Задача «${task.slug}»`,
      path: `tasks.${task.slug}`,
      codePrefix: "",
      answerType: task.answerType,
      table: task.table,
      options: task.options,
      acceptedAnswers: task.acceptedAnswers,
    });

    if (task.answerType === "choice") {
      const opts = task.options ?? [];
      if (opts.length < 2) {
        issues.push({
          code: "CHOICE_OPTIONS",
          message: `Задача «${task.slug}»: choice требует options ≥ 2`,
          path: `tasks.${task.slug}.options`,
          severity: "error",
        });
      } else {
        const normOpts = new Set(opts.map((o) => normalizeForLeakCheck(o)));
        for (const ans of task.acceptedAnswers) {
          if (!normOpts.has(normalizeForLeakCheck(ans))) {
            issues.push({
              code: "CHOICE_ANSWER_NOT_IN_OPTIONS",
              message: `Задача «${task.slug}»: ответ «${ans}» не входит в options`,
              path: `tasks.${task.slug}.acceptedAnswers`,
              severity: "error",
            });
          }
        }
        // Латиница a/b/c рядом с а/б/в дублирует радиокнопки; ввод ловит normalizeAnswer
        if (choiceOptionsHaveLatinCyrDup(opts)) {
          issues.push({
            code: "CHOICE_OPTIONS_LATIN_DUP",
            message: `Задача «${task.slug}»: options содержат латиницу и кириллицу a/а (или b/б, c/в) — оставь только кириллицу в UI`,
            path: `tasks.${task.slug}.options`,
            severity: "error",
          });
        }
      }
    }

    for (const docSlug of task.relatedDocSlugs) {
      if (!articleSlugs.has(docSlug)) {
        issues.push({
          code: "MISSING_DOC",
          message: `Задача «${task.slug}»: relatedDocSlugs содержит несуществующий slug «${docSlug}»`,
          path: `tasks.${task.slug}.relatedDocSlugs`,
          severity: "error",
        });
      }
    }

    const leakAnswers = leakDictionary(task.acceptedAnswers);

    for (const step of task.hintSteps) {
      if (textLeaksAnswer(step.text, leakAnswers)) {
        issues.push({
          code: "HINT_LEAK",
          message: `Задача «${task.slug}»: подсказка содержит эталонный ответ`,
          path: `tasks.${task.slug}.hintSteps`,
          severity: "error",
        });
      }
      if (step.docSlug && !articleSlugs.has(step.docSlug)) {
        issues.push({
          code: "MISSING_HINT_DOC",
          message: `Задача «${task.slug}»: docSlug подсказки «${step.docSlug}» не найден`,
          path: `tasks.${task.slug}.hintSteps`,
          severity: "error",
        });
      }
      if (step.docSlug && !task.relatedDocSlugs.includes(step.docSlug)) {
        issues.push({
          code: "HINT_DOC_UNRELATED",
          message: `Задача «${task.slug}»: docSlug «${step.docSlug}» не из relatedDocSlugs`,
          path: `tasks.${task.slug}.hintSteps`,
          // Warn: у T2–T7 ещё есть наследие; error только на instance (T1P-04).
          severity: "warn",
        });
      }
    }

    if (task.similarTaskSlug && !taskSlugs.has(task.similarTaskSlug)) {
      issues.push({
        code: "MISSING_SIMILAR",
        message: `Задача «${task.slug}»: similarTaskSlug «${task.similarTaskSlug}» не найден`,
        path: `tasks.${task.slug}.similarTaskSlug`,
        severity: "error",
      });
    } else if (task.similarTaskSlug) {
      // G-03 уточн.: закрепляющая после ошибок не должна быть сложнее исходной (warn).
      const similar = data.tasks.find((t) => t.slug === task.similarTaskSlug);
      if (similar) {
        const from = task.grade as OlympiadGrade;
        const to = similar.grade as OlympiadGrade;
        if (olympiadGradeRank(to) > olympiadGradeRank(from)) {
          issues.push({
            code: "SIMILAR_HARDER",
            message: `Задача «${task.slug}»: закрепляющая «${similar.slug}» сложнее (grade ${from} → ${to})`,
            path: `tasks.${task.slug}.similarTaskSlug`,
            severity: "warn",
          });
        }
      }
    }

    // Ответ *похожей* задачи в workedExample (кнопка B) допустим; эталон *текущей* — нет.
    if (task.workedExample && textLeaksAnswer(task.workedExample, leakAnswers)) {
      issues.push({
        code: "WORKED_EXAMPLE_LEAK",
        message: `Задача «${task.slug}»: workedExample содержит эталон текущей задачи`,
        path: `tasks.${task.slug}.workedExample`,
        severity: "error",
      });
    }
  }

  if (hasErrors(issues)) {
    return { ok: false, issues };
  }
  return { ok: true, data, issues };
}

/** Проверка фигур в statement (политика A/B, M6-0). */
function pushFigureIssues(
  issues: ContentValidationIssue[],
  label: string,
  statement: string,
  path: string,
): void {
  for (const fence of listFigureSvgFences(statement)) {
    const checked = assertSafeTaskSvg(fence);
    if (!checked.ok) {
      issues.push({
        code: "FIGURE_SVG_UNSAFE",
        message: `«${label}»: figure-svg — ${checked.reason}`,
        path,
        severity: "error",
      });
    }
  }
  for (const figPath of listFigurePublicPathsInText(statement)) {
    if (!isAllowedFigurePublicPath(figPath)) {
      issues.push({
        code: "FIGURE_PATH_INVALID",
        message: `«${label}»: недопустимый путь фигуры «${figPath}» (только /content/figures/…svg|png)`,
        path,
        severity: "error",
      });
    }
  }
  if (statementRefsMissingFigure(statement)) {
    issues.push({
      code: "FIGURE_REF_MISSING",
      message: `«${label}»: упоминание рисунка без figure-svg / /content/figures/…`,
      path,
      severity: "warn",
    });
  }
}

/** Подсказки без утечки канона / длинных синонимов. */
export function taskHintsAreSafe(task: TaskSeed): boolean {
  const leakAnswers = leakDictionary(task.acceptedAnswers);
  return !task.hintSteps.some((s) => textLeaksAnswer(s.text, leakAnswers));
}
