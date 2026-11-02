"use client";

import { useState } from "react";
import { serializeTableAnswer } from "@/lib/content/answer-table";
import type { AnswerTable } from "@/lib/content/schemas";

type Props = {
  table: AnswerTable;
  disabled?: boolean;
  /** Имя скрытого поля формы со строкой ответа (серверный action читает `answer`). */
  name?: string;
  /** Каждое изменение ячейки — строка ответа в формате «a, b; c, d». */
  onChange?: (answer: string) => void;
};

/**
 * Табличный ответ (P-TABLE-ANSWER): в каждой ячейке — выпадающий список значений столбца.
 * По умолчанию все ячейки пустые («—»), значения идут в нейтральном порядке из контента,
 * поэтому сама таблица не подсказывает ответ. Проверка — только целиком по «Проверить».
 * Desktop — обычная таблица; mobile — карточка на строку (тач-цели ≥44px).
 */
export function TableAnswer({ table, disabled = false, name = "answer", onChange }: Props) {
  const [cells, setCells] = useState<string[][]>(() =>
    table.rows.map(() => table.columns.map(() => "")),
  );

  function setCell(r: number, c: number, value: string) {
    const next = cells.map((row, ri) =>
      ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row,
    );
    setCells(next);
    onChange?.(serializeTableAnswer(next));
  }

  function renderSelect(r: number, c: number, className: string) {
    const col = table.columns[c]!;
    return (
      <select
        value={cells[r]![c]!}
        onChange={(e) => setCell(r, c, e.target.value)}
        disabled={disabled}
        aria-label={`${table.rows[r]}: ${col.title}`}
        className={`min-h-11 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] disabled:opacity-60 ${className}`}
      >
        <option value="">—</option>
        {col.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={serializeTableAnswer(cells)} />

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-[var(--line)] px-2 py-1 text-left font-medium text-[var(--muted)]">
                {table.rowHeader}
              </th>
              {table.columns.map((col) => (
                <th
                  key={col.title}
                  className="border-b border-[var(--line)] px-2 py-1 text-left font-medium text-[var(--muted)]"
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={row}>
                <th scope="row" className="px-2 py-1 text-left font-medium text-[var(--ink)]">
                  {row}
                </th>
                {table.columns.map((col, c) => (
                  <td key={col.title} className="px-2 py-1">
                    {renderSelect(r, c, "w-full min-w-[7rem]")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {table.rows.map((row, r) => (
          <fieldset key={row} className="space-y-2 rounded-lg border border-[var(--line)] p-3">
            <legend className="px-1 text-sm font-medium text-[var(--ink)]">{row}</legend>
            {table.columns.map((col, c) => (
              <label key={col.title} className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                {col.title}
                {renderSelect(r, c, "w-full")}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
