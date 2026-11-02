/**
 * HUD темы brawl: кубки + уровень/ранг.
 */
import { CupIcon } from "@/app/components/cup-icon";
import { cupsFromXp, rankInfoFromXp } from "@/lib/progress/level-rank";

type Props = {
  totalXp: number;
  className?: string;
};

export function BrawlXpHud({ totalXp, className = "" }: Props) {
  const cups = cupsFromXp(totalXp);
  const rank = rankInfoFromXp(totalXp);
  const fillPct = Math.min(100, Math.max(0, rank.fillPct));

  return (
    <span
      className={`inline-flex min-h-11 max-w-[15rem] items-center gap-0 ${className}`}
      title={`${rank.title} · ур. ${rank.level} · ${cups} кубков`}
    >
      <span
        className="relative z-10 flex h-10 w-12 shrink-0 flex-col items-center justify-center border-[3px] border-[#1a0a12] bg-gradient-to-b from-[#ffe566] to-[#ffb020] shadow-[0_3px_0_#1a0a12]"
        style={{ clipPath: "polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)" }}
      >
        <CupIcon className="h-3 w-3 text-[#1a0a12]" />
        <span
          className="text-sm font-black leading-none text-white"
          style={{ textShadow: "0 1px 0 #1a0a12, 1px 0 0 #1a0a12, -1px 0 0 #1a0a12" }}
        >
          {rank.level}
        </span>
      </span>
      <span className="-ml-1 flex h-8 min-w-[7.5rem] flex-1 flex-col justify-center overflow-hidden rounded-r-md border-[3px] border-l-0 border-[#1a0a12] bg-[#5a1040] shadow-[0_3px_0_#1a0a12]">
        <span className="truncate px-1.5 text-[0.55rem] font-black leading-none text-[#ffd84d]">
          {rank.title}
        </span>
        <span className="relative mx-0.5 mb-0.5 flex h-4 items-center overflow-hidden rounded-sm bg-[#3a0a28]">
          <span
            className="absolute inset-y-0 left-0 bg-gradient-to-b from-[#ffb84d] to-[#ff7a18] transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
          <span
            className="relative z-10 inline-flex items-center gap-0.5 px-1.5 text-[0.65rem] font-black tabular-nums text-white"
            style={{
              textShadow:
                "0 1px 0 #1a0a12, 1px 0 0 #1a0a12, -1px 0 0 #1a0a12, 0 -1px 0 #1a0a12",
            }}
          >
            <CupIcon className="h-3 w-3 shrink-0" />
            {cups}
          </span>
        </span>
      </span>
    </span>
  );
}
