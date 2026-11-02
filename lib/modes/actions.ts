"use server";

import { auth } from "@/lib/auth";
import {
  BLOCK_MODE_COOKIE,
  BLOCK_MODE_LEARN,
  BLOCK_MODE_TEST,
  type BlockMode,
} from "@/lib/modes/block-mode";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Сохранить режим блока. До 13B принимаем только learn (REQ-MODE-10).
 * Тест будет через сессию закрепления, не cookie.
 */
export async function setBlockModeAction(
  modeRaw: string,
): Promise<{ ok: true; mode: BlockMode } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Нужно войти" };
  }
  const normalized = modeRaw.trim().toLowerCase();
  if (normalized === BLOCK_MODE_TEST) {
    return {
      ok: false,
      error: "Тест доступен после прохождения пакета (кнопка закрепления).",
    };
  }
  if (normalized !== BLOCK_MODE_LEARN) {
    return { ok: false, error: "Неизвестный режим" };
  }

  const jar = await cookies();
  jar.set(BLOCK_MODE_COOKIE, BLOCK_MODE_LEARN, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/");
  revalidatePath("/plan");
  return { ok: true, mode: BLOCK_MODE_LEARN };
}

/**
 * Режим блока из cookie.
 * До 13B (сессия закрепления) cookie `test` игнорируем — иначе старый
 * переключатель v1 ломает обучение (REQ-MODE-10).
 */
export async function readBlockModeFromCookies(): Promise<BlockMode> {
  return BLOCK_MODE_LEARN;
}
