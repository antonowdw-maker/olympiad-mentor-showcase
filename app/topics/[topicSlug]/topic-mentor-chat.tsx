"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  sendMentorTopicMessageAction,
  type MentorMessageDto,
} from "@/lib/mentor/actions";

type Props = {
  topicSlug: string;
  initialMessages: MentorMessageDto[];
};

/** Разбор `[название](slug:…)` — как у чата задачи. */
function renderMentorBody(body: string, topicSlug: string): ReactNode {
  const re = /\[([^\]]+)\]\(slug:([a-zA-Z0-9._-]+)\)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      nodes.push(body.slice(last, m.index));
    }
    const label = m[1];
    const slug = m[2];
    nodes.push(
      <a
        key={`slug-${key++}`}
        href={`/topics/${topicSlug}/articles/${slug}`}
        className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
      >
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    nodes.push(body.slice(last));
  }
  return nodes.length > 0 ? nodes : body;
}

/** Чат наставника на странице темы (без кнопки A / reveal). */
export function TopicMentorChat({ topicSlug, initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;

    const optimisticId = `local-${Date.now()}`;
    const optimistic: MentorMessageDto = {
      id: optimisticId,
      role: "user",
      body: msg,
      mode: "user",
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setText("");
    setError(null);

    startTransition(async () => {
      const result = await sendMentorTopicMessageAction(topicSlug, msg);
      if (!result.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimisticId));
        setError(result.error);
        return;
      }
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimisticId),
        result.user,
        result.reply,
      ]);
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white/80 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Наставник по теме</h2>
        <p className="text-xs text-[var(--muted)]">
          Без спойлеров задач: вопросы и ссылки на статьи темы
        </p>
      </div>

      <div className="max-h-[min(40vh,20rem)] space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-[var(--line)] bg-[var(--bg)]/50 p-3 sm:max-h-80">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Спроси, с чего начать тему или какую статью открыть первой.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-2 min-w-0 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm sm:ml-6"
                  : "mr-2 min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm sm:mr-6"
              }
            >
              <p className="mb-1 text-xs font-medium text-[var(--muted)]">
                {m.role === "user"
                  ? "Ты"
                  : m.mode === "fallback"
                    ? "Наставник (без ИИ)"
                    : "Наставник"}
              </p>
              <div className="whitespace-pre-wrap break-words text-[var(--ink)] [overflow-wrap:anywhere]">
                {renderMentorBody(m.body, topicSlug)}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Спросить про тему…"
          maxLength={2000}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Думаю…" : "Отправить"}
        </button>
      </form>

      {error ? (
        <p className="text-sm text-[var(--warn)]" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
