/**
 * Шапка для Классика / Игровая / Дорама: кубки + уровень/ранг (единая шкала).
 */
import { CupIcon } from "@/app/components/cup-icon";
import { cupsFromXp, rankInfoFromXp } from "@/lib/progress/level-rank";

type Props = {
  totalXp: number;
  className?: string;
};

export function CupsHud({ totalXp, className = "" }: Props) {
  const cups = cupsFromXp(totalXp);
  const rank = rankInfoFromXp(totalXp);

  return (
    <span
      className={`inline-flex min-h-11 flex-col justify-center leading-tight text-[var(--brand)] ${className}`}
      title={`${rank.title} · ур. ${rank.level} · ${cups} кубков`}
    >
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
        <CupIcon className="h-3.5 w-3.5 shrink-0" />
        {cups}
      </span>
      <span className="text-[0.65rem] font-medium text-[var(--muted)]">
        ур. {rank.level} · {rank.title}
      </span>
    </span>
  );
}
