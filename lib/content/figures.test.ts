import { describe, expect, it } from "vitest";
import {
  assertSafeTaskSvg,
  isAllowedFigurePublicPath,
  listFigurePublicPathsInText,
  listFigureSvgFences,
  splitStatementWithFigures,
  statementRefsMissingFigure,
} from "./figures";

describe("isAllowedFigurePublicPath", () => {
  it("принимает путь под /content/figures/ с svg|png", () => {
    expect(
      isAllowedFigurePublicPath("/content/figures/t6-geometry/m6-0-pilot.svg"),
    ).toBe(true);
    expect(isAllowedFigurePublicPath("/content/figures/x/a.PNG")).toBe(true);
  });

  it("отклоняет обход и внешние схемы", () => {
    expect(isAllowedFigurePublicPath("/content/figures/../secret.svg")).toBe(
      false,
    );
    expect(isAllowedFigurePublicPath("file:///content/figures/a.svg")).toBe(
      false,
    );
    expect(isAllowedFigurePublicPath("/other/figures/a.svg")).toBe(false);
    expect(
      isAllowedFigurePublicPath("/content/figures/a.svg?x=1"),
    ).toBe(false);
  });
});

describe("assertSafeTaskSvg", () => {
  it("принимает простой svg", () => {
    const r = assertSafeTaskSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="none" stroke="#000"/></svg>`,
    );
    expect(r.ok).toBe(true);
  });

  it("отклоняет script и обработчики", () => {
    expect(
      assertSafeTaskSvg(`<svg><script>alert(1)</script></svg>`).ok,
    ).toBe(false);
    expect(
      assertSafeTaskSvg(`<svg><rect onclick="x"/></svg>`).ok,
    ).toBe(false);
  });
});

describe("splitStatementWithFigures", () => {
  it("выделяет figure-svg и markdown img с путём B", () => {
    const statement = `Текст до.

\`\`\`figure-svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3"/></svg>
\`\`\`

После ![сетка](/content/figures/t6-geometry/m6-0-pilot.svg) конец.`;

    const parts = splitStatementWithFigures(statement);
    expect(parts.some((p) => p.type === "svg")).toBe(true);
    expect(parts.some((p) => p.type === "img")).toBe(true);
    expect(parts.filter((p) => p.type === "text").length).toBeGreaterThan(0);
  });
});

describe("statementRefsMissingFigure", () => {
  it("ломает «см. рисунок» без фигуры", () => {
    expect(statementRefsMissingFigure("См. рисунок: сколько клеток?")).toBe(
      true,
    );
    expect(
      statementRefsMissingFigure(
        "См. рисунок.\n\n```figure-svg\n<svg viewBox=\"0 0 1 1\"></svg>\n```",
      ),
    ).toBe(false);
  });
});

describe("list helpers", () => {
  it("собирает ограды и пути", () => {
    const t = `![a](/content/figures/t6/a.svg)\n\`\`\`figure-svg\n<svg></svg>\n\`\`\``;
    expect(listFigurePublicPathsInText(t)).toContain(
      "/content/figures/t6/a.svg",
    );
    expect(listFigureSvgFences(t).length).toBe(1);
  });
});
