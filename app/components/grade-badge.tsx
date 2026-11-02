/**
 * Бейдж олимпиадного грейда (не уровень класса).
 */
import { gradeLabelRu, type OlympiadGrade } from "@/lib/content/grade";

export function GradeBadge({ grade }: { grade: OlympiadGrade }) {
  return (
    <span
      className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--ink)]"
      title="Олимпиадная сложность (не класс)"
    >
      грейд: {gradeLabelRu(grade)}
    </span>
  );
}
