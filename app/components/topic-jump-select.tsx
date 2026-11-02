"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TopicSelectField } from "@/app/components/topic-select-field";

type TopicLink = { slug: string; title: string };

type Props = {
  topics: TopicLink[];
};

/**
 * Выбор темы на вкладке «Темы» (UX-HOME).
 * Кастомный список: название целиком, ширина = контейнер.
 */
export function TopicJumpSelect({ topics }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  if (topics.length === 0) return null;

  return (
    <TopicSelectField
      label="Перейти к теме"
      ariaLabel="Выбор темы для перехода"
      placeholder="Выбери тему…"
      value={value}
      disabled={pending}
      options={topics.map((t) => ({ value: t.slug, label: t.title }))}
      onChange={(slug) => {
        setValue(slug);
        startTransition(() => {
          router.push(`/topics/${slug}`);
        });
      }}
    />
  );
}
