"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TopicSelectField } from "@/app/components/topic-select-field";
import { setPlanTopicPreferenceAction } from "@/lib/plan/actions";
import {
  PLAN_SCOPE_GATHER,
  PLAN_SCOPE_MIXED,
  shouldShowMixedPlanOption,
  type PlanTopicChoice,
} from "@/lib/plan/topic-preference";

type Props = {
  topics: PlanTopicChoice[];
  currentSlug: string;
  /**
   * Куда перейти после смены темы (с ?topic=).
   * На главной не передаём — только cookie + refresh, без ухода на /plan.
   */
  returnTo?: string;
};

/** Выбор темы плана: cookie; навигация — только если задан returnTo. */
export function PlanTopicPicker({ topics, currentSlug, returnTo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const showMixed = shouldShowMixedPlanOption(topics, currentSlug);

  if (topics.length === 0) {
    return null;
  }

  const options = [
    ...(showMixed ? [{ value: PLAN_SCOPE_MIXED, label: "Разные темы" }] : []),
    { value: PLAN_SCOPE_GATHER, label: "Собранное обучение" },
    ...topics.map((t) => ({
      value: t.slug,
      label: `${t.title}${t.hasUnsolved ? "" : " (закрыта)"}`,
    })),
  ];

  return (
    <TopicSelectField
      label="Тема плана"
      ariaLabel="Тема плана на день"
      options={options}
      value={currentSlug}
      disabled={pending}
      onChange={(slug) => {
        startTransition(async () => {
          const result = await setPlanTopicPreferenceAction(slug);
          if (!result.ok) return;
          if (returnTo) {
            const url = new URL(returnTo, window.location.origin);
            url.searchParams.set("topic", slug);
            router.push(`${url.pathname}${url.search}`);
          } else {
            router.refresh();
          }
        });
      }}
    />
  );
}
