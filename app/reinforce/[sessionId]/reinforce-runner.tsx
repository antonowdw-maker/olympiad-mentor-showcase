"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GradeBadge } from "@/app/components/grade-badge";
import { TaskStatement } from "@/app/components/task-statement";
import { TableAnswer } from "@/app/components/table-answer";
import { isTableAnswerComplete } from "@/lib/content/answer-table";
import {
  skipReinforceSessionAction,
  submitReinforceAnswerAction,
} from "@/lib/reinforce/actions";
import type { ReinforceSessionDto } from "@/lib/reinforce/service";
import { SESSION_REINFORCE_XP } from "@/lib/progress/xp";
import {
  computeReinforceDurationSec,
  formatReinforceDuration,
} from "@/lib/reinforce/timer";

type Props = {
  initial: ReinforceSessionDto;
};

/** Раннер теста закрепления: 1 попытка на вопрос, без hints/A/mentor. */
export function ReinforceRunner({ initial }: Props) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [answer, setAnswer] = useState("");
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [rewardFlash, setRewardFlash] = useState(initial.reward);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [liveSec, setLiveSec] = useState(() =>
    computeReinforceDurationSec(initial.startedAt, new Date()),
  );

  const current =
    session.currentOrd != null
      ? session.questions.find((q) => q.ord === session.currentOrd)
      : null;
  const done = session.status === "completed" || session.currentOrd === null;
  // Таблицу отправляем только заполненной целиком — попытка в закреплении одна
  const answerReady =
    current?.answerType === "table" && current.table
      ? isTableAnswerComplete(answer, current.table)
      : answer.trim().length > 0;
  const timerActive = session.status === "active" && !done;

  useEffect(() => {
    if (!timerActive) return;
    const tick = () =>
      setLiveSec(computeReinforceDurationSec(session.startedAt, new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timerActive, session.startedAt]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await submitReinforceAnswerAction(
        session.id,
        current.itemId,
        answer,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastCorrect(result.isCorrect);
      setSession(result.session);
      if (result.reward) setRewardFlash(result.reward);
      setAnswer("");
    });
  }

  function onSkip() {
    startTransition(async () => {
      const result = await skipReinforceSessionAction(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/plan");
      router.refresh();
    });
  }

  if (session.status === "skipped") {
    return (
      <p className="text-sm text-[var(--muted)]">
        Закрепление пропущено.{" "}
        <Link href="/plan" className="text-[var(--brand)] underline-offset-2 hover:underline">
          К плану
        </Link>
      </p>
    );
  }

  if (done || session.status === "completed") {
    const pass = session.pass ?? rewardFlash?.pass ?? null;
    const passed = pass?.passed === true;
    const durationLabel =
      session.durationSec != null
        ? formatReinforceDuration(session.durationSec)
        : null;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Закрепление завершено</h1>
        <p className="text-sm text-[var(--muted)]">
          Список {session.packageSeq}: отвечено на {session.questions.length}{" "}
          {session.questions.length === 1 ? "вопрос" : "вопроса"}
          {durationLabel ? ` · время ${durationLabel}` : ""}.
        </p>
        {pass ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              passed
                ? "border-[var(--ok)]/40 bg-[var(--ok-soft)] text-[var(--ok)]"
                : "border-[var(--warn)]/40 bg-[var(--warn-soft,rgba(180,80,40,0.08))] text-[var(--ink)]"
            }`}
            role="status"
          >
            {passed ? "Сдано" : "Не сдано"}: {pass.score} из {pass.maxScore} баллов
            {Number.isFinite(pass.threshold)
              ? ` (нужно ≥ ${pass.threshold})`
              : ""}
            .
          </p>
        ) : null}
        <ul className="space-y-1 text-sm">
          {session.questions.map((q) => (
            <li key={q.itemId} className="flex flex-wrap items-baseline gap-2 text-[var(--ink)]">
              <span>
                {q.ord + 1}. {q.title}:{" "}
                <span className={q.isCorrect ? "text-[var(--ok)]" : "text-[var(--warn)]"}>
                  {q.isCorrect ? "верно" : "неверно"}
                </span>
              </span>
              {q.grade ? <GradeBadge grade={q.grade} /> : null}
            </li>
          ))}
        </ul>
        {rewardFlash && rewardFlash.xpGained > 0 ? (
          <p className="rounded-lg border border-[var(--ok)]/40 bg-[var(--ok-soft)] px-3 py-2 text-sm">
            +{rewardFlash.xpGained} кубков
            {rewardFlash.badge ? ` · бейдж «${rewardFlash.badge.title}»` : ""}
          </p>
        ) : passed ? (
          <p className="text-sm text-[var(--muted)]">Награда уже была начислена ранее.</p>
        ) : (
          <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-soft,rgba(180,80,40,0.08))] px-3 py-2 text-sm text-[var(--ink)]">
            Награды нет: для +{SESSION_REINFORCE_XP} кубков и бейджа нужно набрать порог баллов (не
            меньше ~70% от максимума по грейдам задач).
          </p>
        )}
        <Link
          href="/plan"
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white no-underline"
        >
          К плану
        </Link>
      </div>
    );
  }

  if (!current) {
    return <p className="text-sm text-[var(--warn)]">Нет текущего вопроса.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Закрепление</h1>
        <p className="text-sm tabular-nums text-[var(--muted)]">
          Вопрос {current.ord + 1} из {current.total} · список {session.packageSeq} ·{" "}
          <span className="text-[var(--ink)]" aria-live="polite">
            {formatReinforceDuration(liveSec)}
          </span>
        </p>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Одна попытка. Без подсказок и наставника. Таймер идёт с входа в тест.
      </p>
      {lastCorrect !== null ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            lastCorrect
              ? "border-[var(--ok)]/40 bg-[var(--ok-soft)] text-[var(--ok)]"
              : "border-[var(--warn)]/40 bg-[var(--surface)] text-[var(--warn)]"
          }`}
          role="status"
        >
          Предыдущий ответ зафиксирован: {lastCorrect ? "верно" : "неверно"}. Дальше — следующий
          вопрос.
        </p>
      ) : null}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{current.title}</h2>
        <TaskStatement
          statement={current.statement}
          className="whitespace-pre-wrap text-base leading-relaxed [overflow-wrap:anywhere]"
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {current.answerType === "table" && current.table ? (
          <TableAnswer
            key={current.itemId}
            table={current.table}
            disabled={pending}
            onChange={setAnswer}
          />
        ) : current.answerType === "choice" && current.options && current.options.length > 0 ? (
          <ul className="space-y-2">
            {current.options.map((opt) => (
              <li key={opt}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="answer"
                    value={opt}
                    checked={answer === opt}
                    onChange={() => setAnswer(opt)}
                    required
                    className="h-5 w-5 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{opt}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="min-h-11 w-full max-w-md rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--ink)]"
            placeholder="Ответ"
            required
            autoComplete="off"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || !answerReady}
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Проверяю…" : "Ответить"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
          >
            Прервать
          </button>
        </div>
      </form>

      {error ? (
        <p className="text-sm text-[var(--warn)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
