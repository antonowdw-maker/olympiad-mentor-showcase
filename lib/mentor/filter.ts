/**
 * Фильтр утечки эталона в ответах наставника (INV-08 / REQ-MNT-03).
 * Если reveal не разрешён — дословные acceptedAnswers и вердикты по ответу вычищаются.
 */
import {
  isNumericAnswerToken,
  isShortAnswerToken,
  leakDictionary,
  leakDictionaryFromTaskGroups,
  numericAnswerTokenRegex,
  shortAnswerCueRegex,
} from "@/lib/content/validate";

/** task — кнопка A; topic — без привязки к конкретной задаче (BCF-01). */
export type MentorFilterScope = "task" | "topic";

const REPLACEMENT_TASK =
  "…(скрыто — сначала попробуй сам или открой решение кнопкой A)…";
const REPLACEMENT_TOPIC =
  "…(скрыто — сначала попробуй сам по статьям темы)…";
const FOOTER_TASK =
  "(Я не раскрываю готовый ответ этой задачи — давай разберём шагами.)";
const FOOTER_TOPIC =
  "(Я не раскрываю ответы задач банка — давай разберём общий приём.)";

function leakReplacement(scope: MentorFilterScope): string {
  return scope === "topic" ? REPLACEMENT_TOPIC : REPLACEMENT_TASK;
}

function leakFooter(scope: MentorFilterScope): string {
  return scope === "topic" ? FOOTER_TOPIC : FOOTER_TASK;
}

/**
 * Вердикты по итоговому ответу без reveal.
 * Не трогаем наводящие «верно ли…» — только связку ответ↔верный/правильный.
 * Важно: \w в JS не включает кириллицу — пишем явные хвосты.
 */
const VERDICT_LEAK_PATTERNS: RegExp[] = [
  /(?:твой|ваш)\s+(?:итоговый\s+)?ответ[\s\S]{0,160}?(?:абсолютно\s+)?(?:верн(?:ый|о|ая|ые)|правильн(?:ый|о|ая|ые)|точн(?:ый|о|ая|ые))/giu,
  /(?:правильный|верный)\s+ответ\s*[,:\-—–]?\s*[«"]?[\wа-яёА-ЯЁ\-]+[»"]?/giu,
  /\bответ\b[\s\S]{0,160}?(?:абсолютно\s+)?(?:не)?верн(?:ый|о|ая|ые)\b/giu,
  /ты\s+(?:совершенно\s+)?прав(?:а|ы)?\s*(?:насчёт|в)\s+(?:ответе|решении)/giu,
];

export type MentorAnswerType = "text" | "number" | "choice" | string;

/**
 * Удаляет/заменяет вхождения эталонов в тексте.
 * - number / числовой канон: самостоятельный токен + cue-обороты (I5-01);
 * - да/нет и короткие: расширенные cue из validate.ts;
 * - длинные: все вхождения канона / длинных синонимов;
 * - вердикты «ответ верный» (REQ-MNT-03).
 */
export function filterMentorReply(
  text: string,
  acceptedAnswers: string[],
  revealAllowed: boolean,
  answerType?: MentorAnswerType,
): { text: string; redacted: boolean } {
  if (revealAllowed || acceptedAnswers.length === 0) {
    return { text, redacted: false };
  }
  return filterWithLeakDict(text, leakDictionary(acceptedAnswers), {
    answerType,
    scope: "task",
  });
}

/**
 * Фильтр по нескольким задачам: канон каждой группы отдельно (BC-01).
 * Scope topic — нейтральные формулировки без кнопки A (BCF-01).
 */
export function filterMentorReplyForTaskGroups(
  text: string,
  answerGroups: string[][],
  revealAllowed: boolean,
  scope: MentorFilterScope = "topic",
): { text: string; redacted: boolean } {
  if (revealAllowed || answerGroups.length === 0) {
    return { text, redacted: false };
  }
  const dict = leakDictionaryFromTaskGroups(answerGroups);
  if (dict.length === 0) {
    return { text, redacted: false };
  }
  return filterWithLeakDict(text, dict, { scope });
}

function filterWithLeakDict(
  text: string,
  dict: string[],
  opts: { answerType?: MentorAnswerType; scope: MentorFilterScope },
): { text: string; redacted: boolean } {
  const replacement = leakReplacement(opts.scope);
  let out = text;
  let redacted = false;

  const verdict = scrubVerdictLeaks(out, opts.scope);
  if (verdict.redacted) {
    out = verdict.text;
    redacted = true;
  }

  const treatAsNumber = opts.answerType === "number";

  for (const ans of dict) {
    const na = ans.trim();
    if (!na) continue;

    if (treatAsNumber || isNumericAnswerToken(na)) {
      const cueRe = shortAnswerCueRegex(na);
      cueRe.lastIndex = 0;
      if (cueRe.test(out)) {
        cueRe.lastIndex = 0;
        out = out.replace(cueRe, replacement);
        redacted = true;
      }
      const tokRe = numericAnswerTokenRegex(na);
      tokRe.lastIndex = 0;
      if (tokRe.test(out)) {
        tokRe.lastIndex = 0;
        out = out.replace(tokRe, replacement);
        redacted = true;
      }
      continue;
    }

    if (isShortAnswerToken(na)) {
      const cueRe = shortAnswerCueRegex(na);
      cueRe.lastIndex = 0;
      if (cueRe.test(out)) {
        cueRe.lastIndex = 0;
        out = out.replace(cueRe, replacement);
        redacted = true;
      }
      continue;
    }

    const re = new RegExp(escapeRe(na), "giu");
    if (re.test(out)) {
      out = out.replace(re, replacement);
      redacted = true;
    }
  }

  if (redacted) {
    out = `${out.trim()}\n\n${leakFooter(opts.scope)}`;
  }

  return { text: out, redacted };
}

/** Срезает подтверждение/опровержение итогового ответа без reveal. */
export function scrubVerdictLeaks(
  text: string,
  scope: MentorFilterScope = "task",
): { text: string; redacted: boolean } {
  const replacement = leakReplacement(scope);
  let out = text;
  let redacted = false;
  for (const re of VERDICT_LEAK_PATTERNS) {
    re.lastIndex = 0;
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    const next = out.replace(re, replacement);
    if (next !== out) {
      out = next;
      redacted = true;
    }
  }
  if (redacted) {
    out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  return { text: out, redacted };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
