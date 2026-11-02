/**
 * Левое nav-меню (AC-NAV): иерархия класс → предмет → темы.
 */

export type SideNavTopicProgress = {
  solvedTasks: number;
  totalTasks: number;
  percent: number;
};

/** Классы в меню: банк сейчас у 6; 7–11 — задел (пустые). 5 кл. не показываем (дубль с 6 через «5-6»). */
export const SIDE_NAV_GRADES = [6, 7, 8, 9, 10, 11] as const;

export type SideNavGrade = (typeof SIDE_NAV_GRADES)[number];

/** В меню витрины — только класс с контентом. */
export const SIDE_NAV_VISIBLE_GRADES: readonly SideNavGrade[] = [6];

export const SIDE_NAV_SUBJECTS = [
  { id: "math", label: "Математика" },
  { id: "russian", label: "Русский" },
  { id: "literature", label: "Литература" },
  { id: "history", label: "История" },
  { id: "physics", label: "Физика" },
  { id: "chemistry", label: "Химия" },
  { id: "english", label: "Английский" },
] as const;

export type SideNavSubjectId = (typeof SIDE_NAV_SUBJECTS)[number]["id"];

/** В меню витрины — только предмет с контентом. */
export const SIDE_NAV_VISIBLE_SUBJECTS = SIDE_NAV_SUBJECTS.filter((s) => s.id === "math");

export type SideNavTopicRef = {
  slug: string;
  title: string;
  order: number;
  /** JSON classLevels темы, напр. ["5","5-6","6"]. */
  classLevels: string[];
};

const SUBJECT_ID_SET = new Set<string>(SIDE_NAV_SUBJECTS.map((s) => s.id));

/** Парсинг ?subject= из URL; неизвестное → null. */
export function parseSideNavSubjectId(
  raw: string | null | undefined,
): SideNavSubjectId | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!SUBJECT_ID_SET.has(v)) return null;
  return v as SideNavSubjectId;
}

/** Парсинг ?grade=; вне каталога SIDE_NAV_GRADES → null. */
export function parseSideNavGrade(
  raw: string | null | undefined,
): SideNavGrade | null {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (!(SIDE_NAV_GRADES as readonly number[]).includes(n)) return null;
  return n as SideNavGrade;
}

/**
 * Короткий слоган предмета для главной (вместо hero).
 * Пока наполнен только math; остальные — задел формулировок.
 */
export function subjectHomeTagline(subjectId: SideNavSubjectId): string {
  switch (subjectId) {
    case "math":
      return "Олимпиадная математика: статьи, задачи и наставник без спойлеров.";
    case "russian":
      return "Олимпиадный русский: статьи, задачи и наставник без спойлеров.";
    case "literature":
      return "Олимпиадная литература: статьи, задачи и наставник без спойлеров.";
    case "history":
      return "Олимпиадная история: статьи, задачи и наставник без спойлеров.";
    case "physics":
      return "Олимпиадная физика: статьи, задачи и наставник без спойлеров.";
    case "chemistry":
      return "Олимпиадная химия: статьи, задачи и наставник без спойлеров.";
    case "english":
      return "Олимпиадный английский: статьи, задачи и наставник без спойлеров.";
    default:
      return "Статьи, задачи и наставник без спойлеров.";
  }
}

/**
 * Темы для слота класс×предмет.
 * Контент только у math; метка «5-6» попадает в слот **6** (5 кл. в меню нет).
 */
export function topicsForNavSlot(
  topics: ReadonlyArray<SideNavTopicRef>,
  grade: SideNavGrade,
  subjectId: SideNavSubjectId,
): SideNavTopicRef[] {
  if (subjectId !== "math") return [];
  const g = String(grade);
  return topics.filter((t) => {
    const levels = t.classLevels ?? [];
    if (levels.includes(g)) return true;
    if (grade === 6 && levels.includes("5-6")) return true;
    return false;
  });
}

/**
 * Общий прогресс по банку: сумма solved/total по темам, % round.
 * Пустой банк / нулевой total → null.
 */
export function overallProgressPercent(
  topics: ReadonlyArray<Pick<SideNavTopicProgress, "solvedTasks" | "totalTasks">>,
): number | null {
  let solved = 0;
  let total = 0;
  for (const t of topics) {
    const s = Number.isFinite(t.solvedTasks) ? Math.max(0, Math.floor(t.solvedTasks)) : 0;
    const n = Number.isFinite(t.totalTasks) ? Math.max(0, Math.floor(t.totalTasks)) : 0;
    solved += s;
    total += n;
  }
  if (total <= 0) return null;
  return Math.min(100, Math.round((100 * solved) / total));
}
