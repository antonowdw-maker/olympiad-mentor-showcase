"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startReinforceSessionAction } from "@/lib/reinforce/actions";

type Props = {
  packageId: string;
  packageSeq: number;
};

/**
 * CTA закрепления после пройденного пакета (REQ-MODE-03/04).
 * «Позже» — локальный dismiss без сессии и без награды.
 */
export function ReinforceCta({ packageId, packageSeq }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  function onStart() {
    setError(null);
    startTransition(async () => {
      const result = await startReinforceSessionAction(packageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/reinforce/${result.sessionId}`);
    });
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-[var(--brand)]/40 bg-[var(--brand-soft)] px-3 py-3"
      role="status"
      data-reinforce-package={packageId}
    >
      <p className="text-sm text-[var(--ink)]">
        Список {packageSeq} решён. Закрепи материал тестированием (другие варианты задач, без
        подсказок).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Готовлю…" : "Закрепить пройденный материал"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white/80 px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Позже
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--warn)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
