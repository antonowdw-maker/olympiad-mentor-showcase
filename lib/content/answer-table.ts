/**
 * Табличный ответ (P-TABLE-ANSWER): сериализация ячеек в строку и обратно.
 *
 * Формат строки ответа: строки таблицы через «;», ячейки внутри строки через «,».
 * Пример: «20, коза, Вокруг света, 11:00; 18, попугай, Прыжок над бездной, 9:00».
 * Такая строка хранится в acceptedAnswers и в Attempt.submittedAnswer, поэтому
 * значения ячеек не могут содержать «,» и «;» (проверяет валидатор контента).
 *
 * Модуль чистый (без БД/сервера) — используется и формой ответа на клиенте.
 */
import { answerTableSchema, type AnswerTable } from "./schemas";

export const TABLE_ROW_SEPARATOR = ";";
export const TABLE_CELL_SEPARATOR = ",";

/** Сообщение, если ученик отправил таблицу не целиком. */
export const TABLE_INCOMPLETE_ERROR = "Заполни все ячейки таблицы";

/** Приведение значения ячейки к виду для сравнения: регистр, пробелы, ё→е. */
export function normalizeTableCell(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");
}

/** Ячейки (строки × столбцы) → строка ответа в каноническом виде. */
export function serializeTableAnswer(cells: readonly (readonly string[])[]): string {
  return cells
    .map((row) => row.map((c) => c.trim()).join(`${TABLE_CELL_SEPARATOR} `))
    .join(`${TABLE_ROW_SEPARATOR} `);
}

/** Строка ответа → ячейки. Пустая строка → пустой массив. */
export function parseTableAnswer(raw: string): string[][] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(TABLE_ROW_SEPARATOR)
    .map((row) => row.split(TABLE_CELL_SEPARATOR).map((c) => c.trim()));
}

/** Нормализованная строка табличного ответа — для сравнения с эталоном. */
export function normalizeTableAnswer(raw: string): string {
  return parseTableAnswer(raw)
    .map((row) => row.map(normalizeTableCell).join(TABLE_CELL_SEPARATOR))
    .join(TABLE_ROW_SEPARATOR);
}

export type TableAnswerShapeIssue =
  | { kind: "rows"; expected: number; actual: number }
  | { kind: "cells"; row: number; expected: number; actual: number }
  | { kind: "empty"; row: number; column: number }
  | { kind: "value"; row: number; column: number; value: string };

/**
 * Проверяет, что ответ заполняет таблицу целиком и каждое значение
 * взято из списка своего столбца. Возвращает первую найденную проблему или null.
 */
export function findTableAnswerShapeIssue(
  raw: string,
  table: AnswerTable,
): TableAnswerShapeIssue | null {
  const cells = parseTableAnswer(raw);
  if (cells.length !== table.rows.length) {
    return { kind: "rows", expected: table.rows.length, actual: cells.length };
  }
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r]!;
    if (row.length !== table.columns.length) {
      return { kind: "cells", row: r, expected: table.columns.length, actual: row.length };
    }
    for (let c = 0; c < row.length; c++) {
      const value = row[c]!;
      if (!value) return { kind: "empty", row: r, column: c };
      const allowed = table.columns[c]!.values.map(normalizeTableCell);
      if (!allowed.includes(normalizeTableCell(value))) {
        return { kind: "value", row: r, column: c, value };
      }
    }
  }
  return null;
}

/** Ответ заполняет всю таблицу допустимыми значениями. */
export function isTableAnswerComplete(raw: string, table: AnswerTable): boolean {
  return findTableAnswerShapeIssue(raw, table) === null;
}

/**
 * Значение колонки options в БД: для таблицы — JSON описания таблицы,
 * для choice — JSON массива вариантов, иначе null (отдельной колонки под таблицу нет).
 */
export function optionsColumnJson(source: {
  options?: string[];
  table?: AnswerTable;
}): string | null {
  if (source.table) return JSON.stringify(source.table);
  return source.options ? JSON.stringify(source.options) : null;
}

/** JSON из колонки options → описание таблицы (или null, если это не таблица). */
export function parseAnswerTableJson(json: string | null | undefined): AnswerTable | null {
  if (!json) return null;
  try {
    const parsed = answerTableSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
