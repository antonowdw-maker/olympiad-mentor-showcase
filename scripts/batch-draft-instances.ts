/**
 * Пакетная генерация drafts для задач темы без instances.
 * Usage: npx tsx scripts/batch-draft-instances.ts --topic=t1-logic [--limit=5] [--write]
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

/** Локальный .env для CLI (tsx не грузит сам). */
async function loadDotEnv() {
  try {
    const text = await readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]) process.env[key] = val;
    }
  } catch {
    /* нет .env */
  }
}

function arg(name: string, argv: string[]): string | undefined {
  const p = argv.find((a) => a.startsWith(`--${name}=`));
  return p?.slice(`--${name}=`.length);
}

async function gemini(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Нет GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 120000;
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
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("empty");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await loadDotEnv();
  const argv = process.argv.slice(2);
  const topicSlug = arg("topic", argv) ?? "t1-logic";
  const limit = Number(arg("limit", argv) ?? "0") || 999;
  const write = argv.includes("--write");

  const topic = TOPIC_SEEDS.find((t) => t.slug === topicSlug);
  if (!topic) {
    console.error("Тема не найдена:", topicSlug);
    process.exit(1);
  }

  const targets = topic.tasks.filter((t) => !t.instances || t.instances.length < 3).slice(0, limit);
  console.log(`Тема ${topicSlug}: без полного пула — ${targets.length} задач (limit=${limit})`);

  const dir = path.join(process.cwd(), "content", "drafts");
  await mkdir(dir, { recursive: true });

  let ok = 0;
  let fail = 0;
  for (const task of targets) {
    process.stdout.write(`… ${task.slug} `);
    try {
      const { system, user } = buildInstanceDraftPrompt({ task, count: 3 });
      const raw = await gemini(system, user);
      const parsed = parseInstanceDraftJson(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      const validated = validateInstanceDraftsAgainstTask(task, parsed.instances);
      if (!validated.ok) {
        throw new Error(validated.issues.map((i) => i.code).join(", "));
      }
      if (write) {
        const file = path.join(dir, instanceDraftFileName(task.slug));
        await writeFile(
          file,
          JSON.stringify(
            {
              taskSlug: task.slug,
              generatedAt: new Date().toISOString(),
              source: "gemini-batch",
              instances: parsed.instances,
            },
            null,
            2,
          ) + "\n",
          "utf8",
        );
      }
      console.log("OK");
      ok++;
    } catch (e) {
      console.log("FAIL", e instanceof Error ? e.message : e);
      fail++;
    }
    // пауза против 429
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Готово: ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
