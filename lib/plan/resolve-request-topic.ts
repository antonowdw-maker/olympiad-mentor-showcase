/**
 * Разрешить выбор плана: ?topic= → cookie → дефолт по прогрессу.
 * Cookie пишется только в Server Action — не из RSC.
 * selection = topic slug | "mixed".
 */
import { cookies } from "next/headers";
import {
  PLAN_TOPIC_COOKIE,
  resolvePlanTopicSlug,
  type PlanTopicChoice,
} from "@/lib/plan/topic-preference";
import { isMixedPlanScope } from "@/lib/plan/scope";
import { isGatherPlanScope } from "@/lib/plan/learn-session";

export type ResolvedPlanTopic = {
  /** topic slug | `mixed` | `gather` */
  topicSlug: string;
  /** Валидный ?topic= отличается от cookie — нужна запись cookie на клиенте (PT-03). */
  shouldSyncCookie: boolean;
};

export async function resolvePlanTopicForRequest(
  topics: PlanTopicChoice[],
  topicFromQuery: string | undefined,
): Promise<ResolvedPlanTopic> {
  const jar = await cookies();
  const fromCookie = jar.get(PLAN_TOPIC_COOKIE)?.value;
  const query = topicFromQuery?.trim() || "";
  const queryValid =
    query.length > 0 &&
    (topics.some((t) => t.slug === query) ||
      isMixedPlanScope(query) ||
      isGatherPlanScope(query));
  const preferred = queryValid ? query : fromCookie;
  const topicSlug = resolvePlanTopicSlug(preferred, topics);
  const shouldSyncCookie = queryValid && query !== fromCookie;
  return { topicSlug, shouldSyncCookie };
}
