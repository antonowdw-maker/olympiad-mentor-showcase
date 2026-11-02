/**
 * P-PLAN-UNSOLVED: канон «исчерпан» для плана, если все instance с верным Attempt.
 * Частично решённый канон (есть нерешённый instance) остаётся доступным в плане.
 */

export type TaskInstancePool = {
  slug: string;
  instanceIds: readonly string[];
};

/**
 * Slug'и канонов, у которых нет ни одного instance без верного Attempt.
 * Пустой пул instance → не считаем исчерпанным (нечего «переиграть»).
 */
export function exhaustedTaskSlugsFromPool(input: {
  tasks: readonly TaskInstancePool[];
  correctlySolvedInstanceIds: ReadonlySet<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const t of input.tasks) {
    if (t.instanceIds.length === 0) continue;
    if (t.instanceIds.every((id) => input.correctlySolvedInstanceIds.has(id))) {
      out.add(t.slug);
    }
  }
  return out;
}
