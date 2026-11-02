/**
 * CLI 12b: черновики TaskInstance через Gemini (opt-in).
 *
 *   npx tsx scripts/draft-task-instances.ts --task=t1-tf-even-sum
 *   npx tsx scripts/draft-task-instances.ts --task=… --fixture=path.json
 *   npx tsx scripts/draft-task-instances.ts --task=… --write
 *
 * Без --write только печатает результат. Live Gemini не в unit.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TOPIC_SEEDS } from "../content/seed";
import {
  buildInstanceDraftPrompt,
  instanceDraftFileName,
  parseInstanceDraftJson,
  validateInstanceDraftsAgainstTask,
} from "../lib/content/instance-draft";

type Args = {
  taskSlug: string;
  count: number;
  write: boolean;
  fixture: string | null;
};

function parseArgs(argv: string[]): Args {
  let taskSlug = "";
  let count = 3;
  let write = false;
  let fixture: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--task=")) taskSlug = a.slice("--task=".length).trim();
    else if (a.startsWith("--count=")) count = Number(a.slice("--count=".length)) || 3;
    else if (a === "--write") write = true;
    else if (a.startsWith("--fixture=")) fixture = a.slice("--fixture=".length).trim();
  }
  if (!taskSlug) {
    console.error(
      "Usage: npx tsx scripts/draft-task-instances.ts --task=<slug> [--count=3] [--write] [--fixture=file]",
    );
    process.exit(1);
  }
  return { taskSlug, count: Math.max(3, count), write, fixture };
}

function findTask(slug: string) {
  for (const topic of TOPIC_SEEDS) {
    const task = topic.tasks.find((t) => t.slug === slug);
    if (task) return { topic, task };
  }
  return null;
}

/** Локальный вызов Gemini без server-only (для CLI). */
async function generateDraftText(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Нет GEMINI_API_KEY — задай в .env или используй --fixture=");
  }
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 90000;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("Пустой ответ Gemini");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const found = findTask(args.taskSlug);
  if (!found) {
    console.error(`Задача «${args.taskSlug}» не найдена в content/seed`);
    process.exit(1);
  }

  const { task } = found;
  const { system, user } = buildInstanceDraftPrompt({
    task,
    count: args.count,
  });

  let raw: string;
  if (args.fixture) {
    raw = await readFile(path.resolve(args.fixture), "utf8");
    console.log(`Fixture: ${args.fixture}`);
  } else {
    console.log(`Gemini draft для ${task.slug} (count=${args.count})…`);
    raw = await generateDraftText(system, user);
  }

  const parsed = parseInstanceDraftJson(raw);
  if (!parsed.ok) {
    console.error("Parse:", parsed.error);
    console.error("Raw slice:", raw.slice(0, 400));
    process.exit(1);
  }

  const validated = validateInstanceDraftsAgainstTask(task, parsed.instances);
  if (!validated.ok) {
    console.error("Validate errors:");
    for (const i of validated.issues) {
      console.error(`  [${i.code}] ${i.message}`);
    }
    process.exit(1);
  }

  const payload = {
    taskSlug: task.slug,
    generatedAt: new Date().toISOString(),
    source: args.fixture ? "fixture" : "gemini",
    instances: parsed.instances,
  };

  console.log(`OK: ${parsed.instances.length} instance(s) для ${task.slug}`);
  for (const inst of parsed.instances) {
    console.log(`  - ${inst.slug} order=${inst.order}: ${inst.statement.slice(0, 60)}…`);
  }

  if (args.write) {
    const dir = path.join(process.cwd(), "content", "drafts");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, instanceDraftFileName(task.slug));
    await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`Записано: ${file}`);
    console.log("Дальше: ручной review → перенести instances в сид темы (не авто).");
  } else {
    console.log("(dry-run; добавь --write чтобы сохранить в content/drafts/)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
