/**
 * Реестр сидов витрины: демо-набор задач.
 */
import { DEMO_TOPICS } from "./demo-topics";

/** Порядок = порядок сида (и желаемый Topic.order). */
export const TOPIC_SEEDS = DEMO_TOPICS;

/** Пороги валидации темы. */
export const TOPIC_SEED_VALIDATE = {
  minArticles: 5,
  minTasks: 15,
} as const;
