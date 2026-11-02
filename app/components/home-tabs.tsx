import Link from "next/link";
import {
  HOME_TAB_GATHER,
  HOME_TAB_TODAY,
  HOME_TAB_TOPICS,
  homeTabHref,
  type HomeTab,
} from "@/lib/home/tab";

type Props = {
  current: HomeTab;
  /** Показать вкладку gather (нужен вошедший + темы). */
  showGather?: boolean;
};

const LABELS: { id: HomeTab; label: string }[] = [
  { id: HOME_TAB_TODAY, label: "Что сегодня" },
  { id: HOME_TAB_GATHER, label: "Собрать обучение" },
  { id: HOME_TAB_TOPICS, label: "Темы" },
];

/**
 * Навигация вкладок главной (UX-HOME). Ссылки с ?home=…; дефолт today без query.
 */
export function HomeTabs({ current, showGather = true }: Props) {
  const tabs = LABELS.filter((t) => showGather || t.id !== HOME_TAB_GATHER);

  return (
    <div
      className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-2"
      role="tablist"
      aria-label="Разделы главной"
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={homeTabHref(t.id)}
            role="tab"
            aria-selected={active}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm no-underline transition ${
              active
                ? "bg-[var(--brand-soft)] font-medium text-[var(--brand)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
