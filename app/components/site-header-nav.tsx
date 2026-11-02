"use client";

import Link from "next/link";
import { BrawlXpHud } from "@/app/components/brawl-xp-hud";
import { CupsHud } from "@/app/components/cups-hud";
import { TOUCH_BTN_CLASS, headerItemsInSlot } from "@/lib/ui/mobile";
import type { UiTheme } from "@/lib/ui/theme";

type Props = {
  /** Вошёл ли ученик. */
  authenticated: boolean;
  totalXp: number | null;
  uiTheme: UiTheme;
};

const linkMuted =
  "no-underline text-[var(--muted)] hover:text-[var(--brand)] inline-flex items-center min-h-11";

/**
 * Шапка (nav-left follow-up): только кубки + ур./ранг (или «Войти» для гостя).
 * Статистика / ник / Выйти — в левом меню (`AppChrome`).
 */
export function SiteHeaderNav({ authenticated, totalXp, uiTheme }: Props) {
  const chromeIds = headerItemsInSlot("chrome", authenticated);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
      {chromeIds.map((id) => {
        if (id === "xp") {
          if (totalXp == null) return null;
          return (
            <XpDisplay key="chrome-xp" totalXp={totalXp} uiTheme={uiTheme} />
          );
        }
        if (id === "login") {
          return (
            <Link
              key="chrome-login"
              href="/login"
              className={`${linkMuted} ${TOUCH_BTN_CLASS} px-3`}
            >
              Войти
            </Link>
          );
        }
        return null;
      })}
    </div>
  );
}

function XpDisplay({
  totalXp,
  uiTheme,
}: {
  totalXp: number;
  uiTheme: UiTheme;
}) {
  if (uiTheme === "brawl") {
    return <BrawlXpHud totalXp={totalXp} />;
  }
  return <CupsHud totalXp={totalXp} />;
}
