"use client";

import { useEffect, useRef } from "react";
import { setPlanTopicPreferenceAction } from "@/lib/plan/actions";

/** Пишет cookie только если валидный ?topic= ещё не совпадает с cookie (PT-03). */
export function SyncPlanTopicCookie({
  topicSlug,
  shouldSync,
}: {
  topicSlug: string;
  shouldSync: boolean;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (!shouldSync || done.current) return;
    done.current = true;
    void setPlanTopicPreferenceAction(topicSlug);
  }, [shouldSync, topicSlug]);
  return null;
}
