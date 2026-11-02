/**
 * Zod-схемы контента T1.
 * Server-схема знает эталон; client DTO — без acceptedAnswers (INV-01, REQ-CNT-13).
 */
import { z } from "zod";
import { OLYMPIAD_GRADES } from "./grade";

export const answerTypeSchema = z.enum(["text", "number", "choice", "table"]);

/**
 * Табличный ответ (P-TABLE-ANSWER): строки — объекты задачи, столбцы — признаки.
 * В каждой ячейке ученик выбирает значение из `values` своего столбца.
 * Порядок `values` — нейтральный (как в условии / по возрастанию), не порядок эталона.
 */
export const answerTableColumnSchema = z.object({
  title: z.string().min(1),
  values: z.array(z.string().min(1)).min(2),
});

export const answerTableSchema = z.object({
  /** Заголовок столбца с названиями строк («Дрессировщик»). */
  rowHeader: z.string().min(1),
  rows: z.array(z.string().min(1)).min(2),
  columns: z.array(answerTableColumnSchema).min(1),
});
export const difficultySchema = z.enum(["5", "5-6", "6"]);
/** Олимпиадный грейд (не уровень класса). */
export const olympiadGradeSchema = z.enum(OLYMPIAD_GRADES);

export const hintStepSchema = z.object({
  text: z.string().min(1),
  docSlug: z.string().min(1).optional(),
});

/** Полная задача при сиде/валидации (с эталоном). */
export const taskInstanceSeedSchema = z.object({
  /** Суффикс или полный slug; в БД — уникальный `taskSlug__…` */
  slug: z.string().min(1),
  order: z.number().int().nonnegative(),
  /**
   * Своё название варианта. Обязательно, если в названии канона есть число,
   * которого нет в условии варианта (валидатор INSTANCE_TITLE_MISMATCH).
   */
  title: z.string().min(1).optional(),
  statement: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  options: z.array(z.string().min(1)).min(2).optional(),
  /** Своя таблица варианта (answerType table); иначе наследуется таблица канона. */
  table: answerTableSchema.optional(),
  hintSteps: z.array(hintStepSchema).default([]),
});

export const taskSeedSchema = z.object({
  slug: z.string().min(1),
  /** Короткий заголовок для списков (RU) */
  title: z.string().min(1),
  statement: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  answerType: answerTypeSchema,
  /** Варианты для choice; для text/number не обязательны */
  options: z.array(z.string().min(1)).min(2).optional(),
  /** Таблица для answerType table (в БД хранится JSON в колонке options). */
  table: answerTableSchema.optional(),
  difficulty: difficultySchema,
  /** Олимпиадная сложность: low / mid / high (REQ-CNT / PLAN 10b) */
  grade: olympiadGradeSchema,
  order: z.number().int().nonnegative(),
  relatedDocSlugs: z.array(z.string().min(1)).min(1),
  hintSteps: z.array(hintStepSchema).default([]),
  similarTaskSlug: z.string().min(1).optional(),
  workedExample: z.string().min(1).optional(),
  /** Источник идей; не отдаём в client DTO */
  sourceHint: z.string().min(1).optional(),
  /**
   * Изоморфные экземпляры (iter 12a). Если заданы — ≥3; канон Task остаётся метаданными/фолбэком.
   */
  instances: z.array(taskInstanceSeedSchema).min(3).optional(),
});

export const articleSeedSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const topicSeedSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().nonnegative(),
  classLevels: z.array(z.string().min(1)).min(1),
  articles: z.array(articleSeedSchema).min(1),
  tasks: z.array(taskSeedSchema).min(1),
});

export type HintStep = z.infer<typeof hintStepSchema>;
export type TopicSeed = z.infer<typeof topicSeedSchema>;
export type TaskSeed = z.infer<typeof taskSeedSchema>;
export type TaskInstanceSeed = z.infer<typeof taskInstanceSeedSchema>;
export type AnswerTable = z.infer<typeof answerTableSchema>;

/** Подсказка в UI: текст + русское название статьи (если есть). */
export const hintStepPublicSchema = z.object({
  text: z.string().min(1),
  docSlug: z.string().min(1).optional(),
  docTitle: z.string().min(1).optional(),
});

/** DTO задачи для клиента — без эталона. */
export const taskPublicSchema = z.object({
  slug: z.string(),
  title: z.string(),
  statement: z.string(),
  answerType: answerTypeSchema,
  options: z.array(z.string()).optional(),
  /** Описание таблицы без эталона (answerType table). */
  table: answerTableSchema.optional(),
  difficulty: difficultySchema,
  grade: olympiadGradeSchema,
  order: z.number(),
  /** Выданный изоморф (12a); null если пула нет. */
  instanceId: z.string().nullable().optional(),
  instanceSlug: z.string().nullable().optional(),
  /** Есть ≥2 instance — кнопка «Другой вариант» (P-VARIANT-AFTER-CORRECT: только после верного). */
  hasOtherVariants: z.boolean().optional(),
  /** Связанные статьи с русскими заголовками */
  relatedDocs: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
    }),
  ),
  /** Только уже открытые ступени (тексты закрытых на клиент не отдаём). */
  hintSteps: z.array(hintStepPublicSchema),
  hintStepsTotal: z.number().int().nonnegative(),
  hintsOpenedCount: z.number().int().nonnegative(),
  hasMoreHints: z.boolean(),
  similarTask: z
    .object({
      slug: z.string(),
      order: z.number(),
      label: z.string(),
      title: z.string(),
    })
    .nullable()
    .optional(),
  workedExample: z.string().nullable().optional(),
  hasSimilarHelp: z.boolean(),
  /** Тела статей для превью в модалке (без ухода со страницы задачи) */
  articlePreviews: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      body: z.string(),
    }),
  ),
});

export type TaskPublic = z.infer<typeof taskPublicSchema>;
export type HintStepPublic = z.infer<typeof hintStepPublicSchema>;

export const articlePublicSchema = z.object({
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  order: z.number(),
});

export type ArticlePublic = z.infer<typeof articlePublicSchema>;
