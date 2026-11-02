/**
 * Выбор изоморфного instance (iter 12a): сначала не показанные, иначе цикл по order.
 * Iter 13: обучение/тест — не отдавать instance с верным Attempt, если есть альтернатива.
 */
export type InstanceRef = { id: string; order: number };

/**
 * Липкость: держим последний показанный, пока явно не запрошен другой вариант.
 * (Не менять условие после «Проверить» / revalidate — иначе после верного ответа
 * страница «прыгает» на новый изоморф без кнопки «Другой вариант».)
 */
export function shouldStickToCurrentInstance(
  lastShownInstanceId: string | null,
  forceNew: boolean,
): boolean {
  return Boolean(lastShownInstanceId) && !forceNew;
}

/**
 * Обучение / обычный просмотр задачи: липнем к последнему показу.
 * PPV-02: при заходе с плана (`unstickIfSolvedAndOpenExists`) не липнем к уже
 * верному instance, если в пуле ещё есть нерешённый — иначе снова i0 «уже решена».
 * После «Проверить» / revalidate без этого флага sticky сохраняется (REQ-INST-02).
 */
export function shouldStickInLearnMode(
  lastShownInstanceId: string | null,
  forceNew: boolean,
  correctlySolvedIds: ReadonlySet<string>,
  options?: {
    unstickIfSolvedAndOpenExists?: boolean;
    openInstanceExists?: boolean;
  },
): boolean {
  if (!lastShownInstanceId || forceNew) return false;
  if (
    options?.unstickIfSolvedAndOpenExists &&
    options.openInstanceExists &&
    correctlySolvedIds.has(lastShownInstanceId)
  ) {
    return false;
  }
  return true;
}

/**
 * @param instances — пул instance канона
 * @param shownInstanceIds — уже когда-либо показанные user×instance
 * @param lastShownInstanceId — последний по времени показа (для цикла)
 */
export function pickTaskInstance(
  instances: InstanceRef[],
  shownInstanceIds: readonly string[],
  lastShownInstanceId: string | null,
): InstanceRef | null {
  if (instances.length === 0) return null;

  const byOrder = [...instances].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const shown = new Set(shownInstanceIds);
  const unseen = byOrder.filter((i) => !shown.has(i.id));
  if (unseen.length > 0) {
    return unseen[0]!;
  }

  if (!lastShownInstanceId) {
    return byOrder[0]!;
  }
  const idx = byOrder.findIndex((i) => i.id === lastShownInstanceId);
  if (idx < 0) {
    return byOrder[0]!;
  }
  return byOrder[(idx + 1) % byOrder.length]!;
}

/**
 * Обучение / тест: предпочесть instance без верного Attempt.
 * Если все верны — null (вызывающий решает: цикл или отказ).
 */
export function pickUnsolvedTaskInstance(
  instances: InstanceRef[],
  shownInstanceIds: readonly string[],
  lastShownInstanceId: string | null,
  correctlySolvedIds: ReadonlySet<string>,
): InstanceRef | null {
  const open = instances.filter((i) => !correctlySolvedIds.has(i.id));
  if (open.length === 0) return null;
  return pickTaskInstance(open, shownInstanceIds, lastShownInstanceId);
}
