/**
 * Ключ границы клиентского дерева задачи (I12A-R2-01).
 * После «Другой вариант» + router.refresh() RSC обновляет props, но React
 * сохраняет useState — без смены key остаются reveal/mentor/hints старого instance.
 */
export function taskClientBoundaryKey(
  instanceId: string | null | undefined,
): string {
  return instanceId && instanceId.length > 0 ? `inst:${instanceId}` : "canon";
}
