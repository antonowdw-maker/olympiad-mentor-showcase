"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPlanTopicPreferenceAction } from "@/lib/plan/actions";
import {
  otherOpenTopics,
  type PlanTopicChoice,
} from "@/lib/plan/topic-preference";

type Props = {
  topicSlug: string;
  topics: PlanTopicChoice[];
  tab: "current" | "history";
  /**
   * home — сменить cookie и остаться (тизер на главной);
   * plan — перейти на /plan с новой темой.
   */
  navigateTo?: "home" | "plan";
};

/** Ссылки на другие темы с незакрытыми задачами (пишет cookie). */
export function AlternatePlanTopics({
  topicSlug,
  topics,
  tab,
  navigateTo = "plan",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const alts = otherOpenTopics(topicSlug, topics);
  if (alts.length === 0) return null;

  return (
    <p className="text-sm text-[var(--muted)]">
      Другие темы с задачами:{" "}
      {alts.map((t, i) => (
        <span key={t.slug}>
          {i > 0 ? ", " : null}
          <button
            type="button"
            disabled={pending}
            className="text-[var(--brand)] underline-offset-2 hover:underline disabled:opacity-60"
            onClick={() => {
              startTransition(async () => {
                const result = await setPlanTopicPreferenceAction(t.slug);
                if (!result.ok) return;
                if (navigateTo === "home") {
                  router.refresh();
                } else {
                  router.push(`/plan?topic=${encodeURIComponent(t.slug)}&tab=${tab}`);
                }
              });
            }}
          >
            {t.title}
          </button>
        </span>
      ))}
    </p>
  );
}
