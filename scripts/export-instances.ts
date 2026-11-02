/**
 * Выгрузка вариантов темы для аудита эталонов (P-AUDIT-INSTANCES).
 *
 *   npm run content:export-instances -- --topic=t9-algebra [--out=tmp-audit-t9.md]
 *
 * Без --out печатает в stdout. Файл выгрузки в git не кладём (tmp-*).
 */
import { writeFileSync } from "node:fs";
import { TOPIC_SEEDS } from "../content/seed/index";
import {
  collectInstanceExportRows,
  formatInstanceExport,
} from "../lib/content/instance-export";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const topicSlug = arg("topic");
const outPath = arg("out");

if (!topicSlug) {
  console.error(
    `Нужен --topic=<slug>. Темы: ${TOPIC_SEEDS.map((t) => t.slug).join(", ")}`,
  );
  process.exit(1);
}

const topic = TOPIC_SEEDS.find((t) => t.slug === topicSlug);
if (!topic) {
  console.error(`Тема «${topicSlug}» не найдена`);
  process.exit(1);
}

const md = formatInstanceExport(topic, collectInstanceExportRows(topic));
if (outPath) {
  writeFileSync(outPath, md, "utf8");
  console.log(`[export-instances] ${topic.slug} → ${outPath}`);
} else {
  process.stdout.write(md);
}
