"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isThemeUnlockBypassLogin,
  isThemeUnlocked,
  parseUiTheme,
} from "@/lib/ui/theme";
import { revalidatePath } from "next/cache";

/**
 * Сохранить пресет оформления на User.
 * Гость / нет сессии — no-op.
 * Locked-тема без порога кубков — no-op (кроме SEED_TEST_USER / ученик).
 */
export async function setUiThemeAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  const theme = parseUiTheme(formData.get("uiTheme"));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalXp: true, login: true },
  });
  if (!user) return;

  const bypassUnlock = isThemeUnlockBypassLogin(user.login);
  if (!isThemeUnlocked(theme, user.totalXp, { bypassUnlock })) return;

  await prisma.user.update({
    where: { id: userId },
    data: { uiTheme: theme },
  });

  revalidatePath("/", "layout");
}
