/**
 * P-VARIANT-AFTER-CORRECT: можно ли нажать «Другой вариант».
 * Разрешено только после верного Attempt на текущем instance — и на первом визите,
 * и после каждой смены (иначе вариант можно «перелистывать», не решая).
 */
export function canRequestOtherVariant(input: {
  poolSize: number;
  currentInstanceId: string | null;
  currentHasCorrect: boolean;
}): boolean {
  if (input.poolSize < 2) return false;
  if (!input.currentInstanceId) return false;
  return input.currentHasCorrect;
}
