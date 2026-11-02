/**
 * Мета сессии закрепления для CTA на плане (скрытие после completed/skipped).
 */
import type { DayPlanPackageStatus, PlanItem } from "@/lib/plan/build";
import { findLastCompletedLearnPackage } from "@/lib/plan/learn-session";
import type { ReinforceSessionStatus } from "@/lib/reinforce/rules";
import { getReinforceSessionMeta } from "@/lib/reinforce/service";

export type ReinforceCtaMeta = {
  packageId: string;
  status: ReinforceSessionStatus;
  sessionId: string;
};

export async function loadReinforceCtaMeta(
  userId: string,
  packages: readonly {
    id: string;
    items: PlanItem[];
    status: DayPlanPackageStatus;
  }[],
  solvedTaskSlugs: ReadonlySet<string>,
): Promise<ReinforceCtaMeta | null> {
  const eligible = findLastCompletedLearnPackage(packages, solvedTaskSlugs);
  if (!eligible) return null;
  const meta = await getReinforceSessionMeta(userId, eligible.id);
  if (!meta) return null;
  return {
    packageId: eligible.id,
    status: meta.status,
    sessionId: meta.sessionId,
  };
}
