# AGENTS.md — вход для агента

**Olympiad Mentor** — тренажёр + ИИ-наставник для олимпиадной математики. Здесь витрина: код и демо-набор задач.

- Запуск и проверки: [`README.md`](README.md).
- Архитектура и требования: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SRS.md`](docs/SRS.md).
- Процесс: [`docs/ENGINEERING-PROCESS.md`](docs/ENGINEERING-PROCESS.md), `.cursor/rules/*`.

Публичные DTO задач **без** `acceptedAnswers` / `sourceHint` / закрытых `hintSteps`.

## Не делать без команды

- Коммит / пуш / мерж
- Ручные/авто ТК
- Live Gemini в unit

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
