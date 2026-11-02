/**
 * Лёгкий рендер учебных текстов: абзацы, **жирный**, маркированные и нумерованные списки.
 */
export function renderSimpleMarkdown(body: string): string {
  const blocks = body.split(/\n\n+/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const isUl = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "");
      const isOl = lines.every((l) => /^\s*\d+\.\s+/.test(l) || l.trim() === "");

      const escapeAndBold = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

      if (isUl && lines.some((l) => l.trim())) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeAndBold(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
      }
      if (isOl && lines.some((l) => l.trim())) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeAndBold(l.replace(/^\s*\d+\.\s+/, ""))}</li>`)
          .join("");
        return `<ol class="list-decimal space-y-1 pl-5">${items}</ol>`;
      }

      return `<p class="leading-relaxed">${escapeAndBold(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}
