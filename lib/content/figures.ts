/**
 * Политика рисунков в условиях задач (M6-0 / CONTENT-QUALITY §5).
 *
 * **A (предпочтительный):** SVG-блок в `statement` — ограда ` ```figure-svg ` … ` ``` `.
 * **B (допуск):** файл в `public/content/figures/{topic}/{slug}.(svg|png)` и ссылка
 * только вида `/content/figures/...` (markdown `![…](url)` или голый путь в тексте).
 */
export const FIGURE_PUBLIC_PREFIX = "/content/figures/";

/** Расширения, допустимые для варианта B. */
export const FIGURE_PUBLIC_EXTENSIONS = [".svg", ".png"] as const;

const FIGURE_SVG_FENCE_RE =
  /```figure-svg\s*\n([\s\S]*?)```/gi;

const MD_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

/** Опасные фрагменты внутри SVG (скрипты, обработчики, внешние ресурсы). */
const SVG_DANGEROUS_RE =
  /<script|javascript:|data:text\/html|\bon[a-z]+\s*=|<foreignObject|<iframe|<object|<embed|<animate|<set[\s>]|<use[\s>][^>]*(?:href|xlink:href)\s*=\s*["'](?!#)/i;

/**
 * Путь варианта B: только `/content/figures/...` без `..`, `file://`, query/hash.
 */
export function isAllowedFigurePublicPath(raw: string): boolean {
  const path = raw.trim();
  if (!path.startsWith(FIGURE_PUBLIC_PREFIX)) return false;
  if (path.includes("..") || path.includes("\\")) return false;
  if (/^[a-z]+:/i.test(path)) return false; // file://, http:// …
  if (path.includes("?") || path.includes("#")) return false;
  const rest = path.slice(FIGURE_PUBLIC_PREFIX.length);
  if (!rest || rest.startsWith("/")) return false;
  const lower = rest.toLowerCase();
  return FIGURE_PUBLIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Проверка SVG для встраивания в HTML условия (вариант A).
 * Не полный санитайзер DOM — allowlist по строке + запрет опасных паттернов.
 */
export function assertSafeTaskSvg(
  raw: string,
): { ok: true; svg: string } | { ok: false; reason: string } {
  const svg = raw.trim();
  if (!svg) return { ok: false, reason: "пустой SVG" };
  if (!/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    return { ok: false, reason: "ожидается один корневой <svg>…</svg>" };
  }
  if (SVG_DANGEROUS_RE.test(svg)) {
    return { ok: false, reason: "SVG содержит запрещённые элементы/атрибуты" };
  }
  // Запрет внешних URL в href/src (кроме якорей #).
  if (/(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(svg)) {
    return { ok: false, reason: "SVG ссылается на внешний ресурс" };
  }
  return { ok: true, svg };
}

export type StatementPart =
  | { type: "text"; text: string }
  | { type: "svg"; svg: string }
  | { type: "img"; src: string; alt: string };

/**
 * Разбор условия: текст + figure-svg ограды + markdown-картинки с путями B.
 * Некорректные SVG/пути остаются текстом (рендер не падает); validate ловит при сиде.
 */
export function splitStatementWithFigures(statement: string): StatementPart[] {
  const parts: StatementPart[] = [];
  let cursor = 0;
  const re = new RegExp(FIGURE_SVG_FENCE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(statement)) !== null) {
    if (m.index > cursor) {
      parts.push(...splitTextWithMdImages(statement.slice(cursor, m.index)));
    }
    const checked = assertSafeTaskSvg(m[1] ?? "");
    if (checked.ok) {
      parts.push({ type: "svg", svg: checked.svg });
    } else {
      parts.push({ type: "text", text: m[0] });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < statement.length) {
    parts.push(...splitTextWithMdImages(statement.slice(cursor)));
  }
  return parts.length > 0 ? parts : [{ type: "text", text: statement }];
}

function splitTextWithMdImages(chunk: string): StatementPart[] {
  const out: StatementPart[] = [];
  let cursor = 0;
  const re = new RegExp(MD_IMAGE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) !== null) {
    if (m.index > cursor) {
      out.push({ type: "text", text: chunk.slice(cursor, m.index) });
    }
    const src = (m[1] ?? "").trim();
    const altMatch = /^!\[([^\]]*)]/.exec(m[0]);
    const alt = altMatch?.[1] ?? "";
    if (isAllowedFigurePublicPath(src)) {
      out.push({ type: "img", src, alt });
    } else {
      out.push({ type: "text", text: m[0] });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < chunk.length) {
    out.push({ type: "text", text: chunk.slice(cursor) });
  }
  return out;
}

/** Все пути `/content/figures/…` в тексте (markdown img + голые вхождения). */
export function listFigurePublicPathsInText(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(MD_IMAGE_RE)) {
    const src = (m[1] ?? "").trim();
    if (src.startsWith(FIGURE_PUBLIC_PREFIX)) found.add(src);
  }
  for (const m of text.matchAll(/\/content\/figures\/[^\s)"']+/g)) {
    found.add(m[0].replace(/[.,;:]+$/, ""));
  }
  return [...found];
}

/** Извлечь сырые тела figure-svg оград (для validate). */
export function listFigureSvgFences(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(FIGURE_SVG_FENCE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push((m[1] ?? "").trim());
  }
  return out;
}

/**
 * Эвристика «см. рисунок» без фигуры в продукте — warn при сиде.
 */
export function statementRefsMissingFigure(statement: string): boolean {
  const mentions =
    /см\.\s*рис|смотри\s+рис|на\s+рисунке|рис\.\s*\d/i.test(statement);
  if (!mentions) return false;
  const hasSvg = listFigureSvgFences(statement).length > 0;
  const hasImg = listFigurePublicPathsInText(statement).some(isAllowedFigurePublicPath);
  return !hasSvg && !hasImg;
}
