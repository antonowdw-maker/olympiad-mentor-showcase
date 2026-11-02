/**
 * Условие задачи с поддержкой фигур M6-0 (SVG-in-statement и /content/figures/…)
 * и плашки «Игра по правилам мизера!» (C-NIT / Verifier).
 */
import { splitStatementWithFigures } from "@/lib/content/figures";
import { splitMisereBanner } from "@/lib/content/statement-banners";

type Props = {
  statement: string;
  className?: string;
};

export function TaskStatement({ statement, className }: Props) {
  const parts = splitStatementWithFigures(statement);
  const textClass =
    className ??
    "whitespace-pre-wrap text-lg leading-relaxed [overflow-wrap:anywhere]";

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text.trim()) return null;
          const { banner, body } = splitMisereBanner(part.text);
          return (
            <div key={`t-${i}`} className="space-y-2">
              {banner ? (
                <p
                  role="note"
                  className="rounded-md border border-amber-700/40 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
                >
                  Игра по правилам мизера!
                </p>
              ) : null}
              {body.trim() ? <p className={textClass}>{body}</p> : null}
            </div>
          );
        }
        if (part.type === "svg") {
          return (
            <div
              key={`s-${i}`}
              className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white p-3"
              // SVG уже проверен assertSafeTaskSvg при разборе.
              dangerouslySetInnerHTML={{ __html: part.svg }}
            />
          );
        }
        return (
          // eslint-disable-next-line @next/next/no-img-element -- локальные фигуры из public/
          <img
            key={`i-${i}`}
            src={part.src}
            alt={part.alt || "Рисунок к условию"}
            className="max-h-64 max-w-full rounded-lg border border-[var(--line)] bg-white p-2"
          />
        );
      })}
    </div>
  );
}
