"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestOtherTaskVariantAction } from "@/lib/content/request-other-variant";
import { submitAnswerAction } from "@/lib/trainer/submit-answer";
import { useState, useTransition } from "react";
import { TableAnswer } from "@/app/components/table-answer";
import { TABLE_INCOMPLETE_ERROR, isTableAnswerComplete } from "@/lib/content/answer-table";
import type { AnswerTable } from "@/lib/content/schemas";

type Props = {
  topicSlug: string;
  taskSlug: string;
  answerType: string;
  options?: string[];
  /** Описание таблицы для answerType table (без эталона). */
  table?: AnswerTable;
  /** Уже была верная попытка — показываем статус */
  alreadySolved?: boolean;
  /** Ссылка на следующую задачу (после верного ответа) */
  nextTaskHref?: string | null;
  nextTaskLabel?: string | null;
  /** Сообщить родителю про усиление помощи после 3 неверных */
  onBoostHelp?: () => void;
  /** Контекст визита закрепления (`?reinforce=1`) — для effective total на submit. */
  reinforce?: string | null;
  /** Изоморф (12a). */
  instanceId?: string | null;
  /** Пул ≥2 — кнопка «Другой вариант». */
  hasOtherVariants?: boolean;
  /**
   * P-VARIANT-AFTER-CORRECT: серверный флаг — есть верный Attempt на текущем варианте.
   * Пока false, кнопка «Другой вариант» не рендерится вовсе (появится после верного ответа).
   */
  otherVariantAllowed?: boolean;
  /** Режим тест (13): анти-угадайка binary, без reinforce. */
  testMode?: boolean;
};

/**
 * Форма ответа: отправка на сервер → Attempt; эталон не показываем.
 * hintsOpenedCount пишет сервер из TaskHintProgress / instance show.
 */
export function AnswerForm({
  topicSlug,
  taskSlug,
  answerType,
  options,
  table,
  alreadySolved = false,
  nextTaskHref = null,
  nextTaskLabel = null,
  onBoostHelp,
  reinforce: reinforceVisit = null,
  instanceId = null,
  hasOtherVariants = false,
  otherVariantAllowed = false,
  testMode = false,
}: Props) {
  const [message, setMessage] = useState<string | null>(
    alreadySolved && !testMode ? "Эта задача уже отмечена как решённая." : null,
  );
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(
    alreadySolved && !testMode ? true : null,
  );
  /** После успешной смены — локальный замок до refresh / верного ответа. */
  const [variantLockedLocal, setVariantLockedLocal] = useState(false);
  const [reinforce, setReinforce] = useState<{ href: string; label: string } | null>(null);
  const [newBadges, setNewBadges] = useState<{ code: string; title: string }[]>([]);
  const [locked, setLocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [variantPending, startVariantTransition] = useTransition();
  const [variantError, setVariantError] = useState<string | null>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    // Неполную таблицу не отправляем: это не попытка (сервер проверяет так же)
    if (
      answerType === "table" &&
      table &&
      !isTableAnswerComplete(String(formData.get("answer") ?? ""), table)
    ) {
      setMessage(TABLE_INCOMPLETE_ERROR);
      setLastCorrect(null);
      return;
    }
    startTransition(async () => {
      const result = await submitAnswerAction(formData);
      if (!result.ok) {
        setMessage(result.error);
        setLastCorrect(null);
        setReinforce(null);
        setNewBadges([]);
        if (result.locked) setLocked(true);
        return;
      }
      setLastCorrect(result.isCorrect);
      if (result.locked) setLocked(true);
      if (result.isCorrect) {
        setVariantLockedLocal(false);
        const xpPart =
          result.xpGained > 0
            ? ` +${result.xpGained} кубков (всего ${result.totalXp})`
            : result.totalXp > 0
              ? ` · повтор без новых кубков (всего ${result.totalXp})`
              : "";
        setMessage(`Верно!${xpPart}`);
        setNewBadges(result.newBadges);
        if (result.offerReinforce && result.reinforceHref && result.reinforceLabel) {
          setReinforce({ href: result.reinforceHref, label: result.reinforceLabel });
        } else {
          setReinforce(null);
        }
      } else {
        setMessage(
          result.locked
            ? "Неверно. В тесте повторный ответ на этот вопрос закрыт — перейди дальше."
            : result.boostHelp
              ? "Пока неверно. Открой следующую подсказку или связанные статьи — эталон сам не покажем."
              : "Пока неверно — попробуй ещё или открой подсказку.",
        );
        setReinforce(null);
        setNewBadges([]);
        if (result.boostHelp) onBoostHelp?.();
      }
    });
  }

  function onOtherVariant() {
    setVariantError(null);
    startVariantTransition(async () => {
      const result = await requestOtherTaskVariantAction(topicSlug, taskSlug);
      if (!result.ok) {
        setVariantError(result.error);
        // PPV-03: локальный замок только при реальном gate «сначала реши»,
        // не при логине/сети/«нет вариантов».
        if (result.error.includes("Сначала реши")) {
          setVariantLockedLocal(true);
        }
        return;
      }
      setVariantLockedLocal(true);
      setMessage("Новый вариант условия. Сначала реши его верно — потом можно сменить снова.");
      setLastCorrect(null);
      setNewBadges([]);
      setReinforce(null);
      router.refresh();
    });
  }

  const showNext = (lastCorrect === true || locked) && nextTaskHref;
  // Серверный флаг — источник истины; lastCorrect === true — свежая верная проверка в этой сессии UI.
  const variantAllowed =
    !variantLockedLocal && (otherVariantAllowed || lastCorrect === true);
  // Кнопка появляется только после подтверждённого верного ответа на текущий вариант.
  const showOtherVariant = hasOtherVariants && !testMode && variantAllowed;
  const variantDisabled = variantPending || pending;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white/80 p-4">
      <h2 className="text-lg font-semibold">Твой ответ</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="topicSlug" value={topicSlug} />
        <input type="hidden" name="taskSlug" value={taskSlug} />
        {instanceId ? <input type="hidden" name="instanceId" value={instanceId} /> : null}
        {reinforceVisit && !testMode ? (
          <input type="hidden" name="reinforce" value={reinforceVisit} />
        ) : null}

        {answerType === "table" && table ? (
          <TableAnswer table={table} disabled={locked || pending} />
        ) : answerType === "choice" && options && options.length > 0 ? (
          <fieldset className="space-y-2" disabled={locked || pending}>
            <legend className="sr-only">Варианты</legend>
            {options.map((opt) => (
              <label
                key={opt}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-[var(--ink)]"
              >
                <input
                  type="radio"
                  name="answer"
                  value={opt}
                  required
                  className="h-5 w-5 accent-[var(--brand)]"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">{opt}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <input
            name="answer"
            type="text"
            inputMode={answerType === "number" ? "decimal" : "text"}
            required
            disabled={locked || pending}
            placeholder={answerType === "number" ? "Число" : "Ответ"}
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--brand)] disabled:opacity-60"
            autoComplete="off"
          />
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || locked}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Проверяю…" : locked ? "Вопрос закрыт" : "Проверить"}
          </button>
          {/* Напоминание о культуре решения; на узком экране скрыто, чтобы блок ответа не рос */}
          <p className="hidden max-w-xl text-xs italic leading-snug text-[var(--muted)] sm:block">
            Решить задачу — это не угадать ответ! Объяснить решение — это не только дать ответ.
            Решение должно содержать логическое обоснование всех его этапов с формулировкой
            предположений и выводов.
          </p>
        </div>
      </form>

      {message ? (
        <p
          className={
            lastCorrect === true
              ? "text-sm text-[var(--ok)]"
              : lastCorrect === false
                ? "text-sm text-[var(--warn)]"
                : "text-sm text-[var(--muted)]"
          }
          role="status"
        >
          {message}
        </p>
      ) : null}

      {newBadges.length > 0 ? (
        <ul className="space-y-1 text-sm text-[var(--brand)]" role="status">
          {newBadges.map((b) => (
            <li key={b.code}>Новый бейдж: {b.title}</li>
          ))}
        </ul>
      ) : null}

      {reinforce ? (
        <p className="rounded-lg border border-[var(--brand)]/30 bg-[var(--brand-soft)] px-3 py-2 text-sm">
          Ты открыл несколько подсказок — закрепи приём на похожей:{" "}
          <Link href={reinforce.href} className="font-medium text-[var(--brand)] underline-offset-2 hover:underline">
            {reinforce.label}
          </Link>
        </p>
      ) : null}

      {showOtherVariant ? (
        <div className="space-y-1">
          <button
            type="button"
            disabled={variantDisabled}
            onClick={onOtherVariant}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] disabled:opacity-60"
          >
            {variantPending ? "Меняю вариант…" : "Другой вариант"}
          </button>
          <p className="text-xs text-[var(--muted)]">
            Новые числа/формулировка. Дополнительных кубков за этот переход нет.
          </p>
        </div>
      ) : null}

      {variantError && !testMode ? (
        <p className="text-sm text-[var(--warn)]" role="alert">
          {variantError}
        </p>
      ) : null}

      {showNext ? (
        <p>
          <Link
            href={nextTaskHref}
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--ok-soft)] px-3 py-2 text-sm font-medium text-[var(--ok)] no-underline hover:underline"
          >
            Дальше: {nextTaskLabel ?? "следующая задача"} →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
