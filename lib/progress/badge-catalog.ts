/**
 * Каталог визуала бейджей «учёные» (iter 15b).
 * Коды наград и пороги L1 не меняются — только отображение.
 */
import {
  isTechniqueBadgeCode,
  SESSION_REINFORCED_BADGE_PREFIX,
  topicSlugFromTechniqueBadge,
  type MilestoneBadgeCode,
} from "@/lib/progress/xp";

export type BadgeVisualKind = "milestone" | "technique" | "reinforce" | "unknown";

export type BadgeCatalogEntry = {
  /** Отображаемое название (может обогащать title из БД). */
  title: string;
  /** Короткий факт для tooltip. */
  fact: string;
  /** Имя «образа» (учёный / персонаж). */
  scientist: string;
  /** Ключ SVG-портрета в UI. */
  portrait: string;
  kind: BadgeVisualKind;
};

const MILESTONE: Record<MilestoneBadgeCode, BadgeCatalogEntry> = {
  debut: {
    title: "Первый успех",
    scientist: "Архимед",
    fact: "Архимед искал опору для рычага — и для первой решённой задачи тоже нужна точка опоры: начать.",
    portrait: "archimedes",
    kind: "milestone",
  },
  steady: {
    title: "Уверенный старт",
    scientist: "Леонард Эйлер",
    fact: "Эйлер решал задачи пачками и вёл дневники решений — привычка важнее вспышки вдохновения.",
    portrait: "euler",
    kind: "milestone",
  },
  deep: {
    title: "Глубокая практика",
    scientist: "Карл Фридрих Гаусс",
    fact: "Гаусса звали «королём математиков»: он любил докапываться до сути, а не останавливаться на первом ответе.",
    portrait: "gauss",
    kind: "milestone",
  },
};

/** Приёмы темы → образ учёного (абстрактный портрет, без чужих IP). */
const TECHNIQUE_BY_TOPIC: Record<string, BadgeCatalogEntry> = {
  "t1-logic": {
    title: "Приёмы: Логика",
    scientist: "Джордж Буль",
    fact: "Буль формализовал «и / или / не» — язык, на котором удобно рассуждать о правде и лжи.",
    portrait: "boole",
    kind: "technique",
  },
  "t2-parity": {
    title: "Приёмы: Чётность",
    scientist: "Эмми Нётер",
    fact: "Нётер показала, как симметрии и инварианты объясняют законы — чётность тоже инвариант.",
    portrait: "noether",
    kind: "technique",
  },
  "t3-combinatorics": {
    title: "Приёмы: Комбинаторика",
    scientist: "Блез Паскаль",
    fact: "Треугольник Паскаля помогает считать сочетания — сколько способов выбрать без перебора всего подряд.",
    portrait: "pascal",
    kind: "technique",
  },
  "t4-divisibility": {
    title: "Приёмы: Делимость",
    scientist: "Евклид",
    fact: "Алгоритм Евклида ищет наибольший общий делитель шагами — основа теории делимости.",
    portrait: "euclid",
    kind: "technique",
  },
  "t5-algorithms": {
    title: "Приёмы: Алгоритмы",
    scientist: "аль-Хорезми",
    fact: "От имени аль-Хорезми произошло слово «алгоритм» — пошаговый план решения задачи.",
    portrait: "khwarizmi",
    kind: "technique",
  },
  "t6-geometry": {
    title: "Приёмы: Геометрия",
    scientist: "Пифагор",
    fact: "Школа Пифагора связывала числа и фигуры: площадь и длина часто «договариваются» через квадраты.",
    portrait: "pythagoras",
    kind: "technique",
  },
  "t7-games": {
    title: "Приёмы: Игры",
    scientist: "Джон Нэш",
    fact: "Нэш изучал равновесия в играх: иногда лучший ход — тот, после которого сопернику некуда улучшать ответ.",
    portrait: "nash",
    kind: "technique",
  },
};

const REINFORCE: BadgeCatalogEntry = {
  title: "Материал закреплён",
  scientist: "Дьёрдь Пойа",
  fact: "Пойа учил: сначала пойми задачу, составь план, выполни, проверь — закрепление как раз про «проверь».",
  portrait: "polya",
  kind: "reinforce",
};

const FALLBACK: BadgeCatalogEntry = {
  title: "Бейдж",
  scientist: "Исследователь",
  fact: "Новая отметка в коллекции — продолжай решать и собирать приёмы.",
  portrait: "explorer",
  kind: "unknown",
};

/**
 * Метаданные бейджа по коду награды.
 * Неизвестный code → fallback (чтобы UI не падал на старых/новых кодах).
 */
export function lookupBadgeCatalog(
  code: string,
  storedTitle?: string,
): BadgeCatalogEntry {
  if (code === "debut" || code === "steady" || code === "deep") {
    const entry = MILESTONE[code];
    return storedTitle ? { ...entry, title: storedTitle } : entry;
  }

  if (isTechniqueBadgeCode(code)) {
    const slug = topicSlugFromTechniqueBadge(code);
    const entry =
      (slug && TECHNIQUE_BY_TOPIC[slug]) ||
      ({
        ...FALLBACK,
        title: storedTitle ?? "Приёмы темы",
        scientist: "Математик",
        fact: "Пять разных верных задач в теме — знак, что приём уже «в руках».",
        portrait: "explorer",
        kind: "technique" as const,
      } satisfies BadgeCatalogEntry);
    return storedTitle ? { ...entry, title: storedTitle } : entry;
  }

  if (code.startsWith(SESSION_REINFORCED_BADGE_PREFIX)) {
    return storedTitle ? { ...REINFORCE, title: storedTitle } : REINFORCE;
  }

  return {
    ...FALLBACK,
    title: storedTitle?.trim() || FALLBACK.title,
  };
}

/** Список портретов, для которых есть SVG в UI (документация / тесты). */
export const BADGE_PORTRAIT_IDS = [
  "archimedes",
  "euler",
  "gauss",
  "boole",
  "noether",
  "pascal",
  "euclid",
  "khwarizmi",
  "pythagoras",
  "nash",
  "polya",
  "explorer",
] as const;

export type BadgePortraitId = (typeof BADGE_PORTRAIT_IDS)[number];
