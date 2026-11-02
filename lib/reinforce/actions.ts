"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getReinforceSessionForUser,
  skipReinforceSession,
  startReinforceSession,
  submitReinforceAnswer,
  type ReinforceSessionDto,
} from "@/lib/reinforce/service";
import type { ReinforceAwardResult } from "@/lib/reinforce/award";
import { TABLE_INCOMPLETE_ERROR } from "@/lib/content/answer-table";

export type StartReinforceResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

export async function startReinforceSessionAction(
  packageId: string,
): Promise<StartReinforceResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Нужно войти" };
  try {
    const dto = await startReinforceSession(session.user.id, packageId.trim());
    revalidatePath("/");
    revalidatePath("/plan");
    return { ok: true, sessionId: dto.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PACKAGE_NOT_FOUND") return { ok: false, error: "Пакет не найден" };
    if (msg === "PACKAGE_NOT_LEARN") {
      return { ok: false, error: "Закрепление доступно только для учебного списка" };
    }
    if (msg === "INCOMPLETE") {
      return { ok: false, error: "Сначала реши все задачи пакета" };
    }
    // ALREADY_DONE: start возвращает DTO итога (I13BC-08), эта ветка — запасная
    if (msg === "ALREADY_DONE") {
      return { ok: false, error: "Этот пакет уже закреплён" };
    }
    if (msg === "SKIPPED") {
      return { ok: false, error: "Закрепление по этому пакету прервано и больше недоступно" };
    }
    if (msg === "NO_TESTABLE_TASKS") {
      return {
        ok: false,
        error: "Нет задач с другим вариантом для теста (нужен пул instance ≥2)",
      };
    }
    console.error("[reinforce] start:", e);
    return { ok: false, error: "Не удалось начать закрепление" };
  }
}

export type SkipReinforceResult = { ok: true } | { ok: false; error: string };

export async function skipReinforceSessionAction(
  sessionId: string,
): Promise<SkipReinforceResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Нужно войти" };
  try {
    await skipReinforceSession(session.user.id, sessionId.trim());
    revalidatePath("/");
    revalidatePath("/plan");
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_NOT_FOUND") {
      return { ok: false, error: "Сессия не найдена" };
    }
    console.error("[reinforce] skip:", e);
    return { ok: false, error: "Не удалось пропустить" };
  }
}

export type SubmitReinforceResult =
  | {
      ok: true;
      isCorrect: boolean;
      session: ReinforceSessionDto;
      reward: ReinforceAwardResult | null;
    }
  | { ok: false; error: string };

export async function submitReinforceAnswerAction(
  sessionId: string,
  itemId: string,
  answer: string,
): Promise<SubmitReinforceResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Нужно войти" };
  try {
    const result = await submitReinforceAnswer({
      userId: session.user.id,
      sessionId: sessionId.trim(),
      itemId: itemId.trim(),
      answer,
    });
    revalidatePath(`/reinforce/${sessionId}`);
    revalidatePath("/");
    revalidatePath("/plan");
    return {
      ok: true,
      isCorrect: result.isCorrect,
      session: result.session,
      reward: result.reward,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, string> = {
      SESSION_NOT_FOUND: "Сессия не найдена",
      SESSION_NOT_ACTIVE: "Сессия уже завершена",
      ITEM_NOT_FOUND: "Вопрос не найден",
      ALREADY_ANSWERED: "Ответ уже зафиксирован",
      NOT_CURRENT_ITEM: "Сначала ответь на текущий вопрос",
      BAD_CONTENT: "Ошибка контента задачи",
      TABLE_INCOMPLETE: TABLE_INCOMPLETE_ERROR,
    };
    if (msg && map[msg]) return { ok: false, error: map[msg]! };
    console.error("[reinforce] submit:", e);
    return { ok: false, error: "Не удалось проверить ответ" };
  }
}

export async function loadReinforceSessionAction(
  sessionId: string,
): Promise<{ ok: true; session: ReinforceSessionDto } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Нужно войти" };
  try {
    const dto = await getReinforceSessionForUser(session.user.id, sessionId.trim());
    return { ok: true, session: dto };
  } catch {
    return { ok: false, error: "Сессия не найдена" };
  }
}
