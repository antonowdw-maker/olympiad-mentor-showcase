# Архитектура — Olympiad Mentor

> Версия: 0.2 · Дата: 2026-09-08  
> Статус: **утверждено** (согласовано с SRS v0.2); стек в коде — Next.js **16** / React **19** / Prisma 5 / Auth.js v5 JWT.  
> Прикладной код — только после AC на слайс и «делай».

---

## 1. Решение

Выбран **вариант 3 — Next.js monolith** (долгоживущий free-стек).

| Критерий | Как закрыт |
|----------|------------|
| Бесплатно | Нет обязательных платных SaaS; SQLite локально; Gemini — free-квота |
| Долгоживущий | Не завязаны на короткий триал BaaS |
| Простота | Один процесс (`next dev`), один язык (TypeScript) |
| Стабильность | Prisma, Zod, Tailwind; минимум «магии» между UI и API |
| UI | Tailwind v4 + Lucide; адаптив с первых экранов |
| ИИ | Gemini API + **обязательный fallback без LLM** |
| Не берём | Ollama, Supabase как ядро, отдельный Express |

Отложено: Playwright/E2E (после MVP), Turso/облачный деплой — по необходимости. Банк, пагинация и TaskInstance — уже в продукте.

---

## 2. Стек (зафиксировано)

| Слой | Технология | Заметки |
|------|------------|---------|
| Runtime | Node.js LTS | Windows |
| App | **Next.js 16** (App Router) + TypeScript | UI + Route Handlers / Server Actions; request-interceptor — `proxy.ts` (не `middleware.ts`) |
| UI | React **19**, **Tailwind CSS v4**, Lucide | RU UI; задел i18n |
| Валидация | **Zod** | Отдельные схемы: server (с эталоном) vs client DTO (без) |
| ORM / БД | **Prisma 5** + **SQLite** | Рантайм-контент и прогресс в БД; `*.db` не в git; перед `dev`/`test`/`build` — `scripts/ensure-prisma-client.ts` |
| Auth | **Auth.js** (NextAuth v5) | Credentials; **`session.strategy = 'jwt'`**; демо-пользователь `SEED_TEST_USER` из `.env`; Prisma — для домена, не как обязательный session-store |
| LLM | **Google Gemini** + opt-in **DeepSeek** (13b) | Server-side; цепочка `Gemini → DeepSeek → fallback без LLM`; дефолт Gemini **gemini-3.5-flash**, DeepSeek **deepseek-v4-flash**; таймаут **60 с** (`GEMINI_TIMEOUT_MS` / `DEEPSEEK_TIMEOUT_MS`); запасные Gemini при 503/429/404 (`GEMINI_FALLBACK_MODELS`); исходящий прокси `OUTBOUND_HTTPS_PROXY` (`instrumentation.ts` → `http.setGlobalProxyFromEnv`, Node ≥ 24; порт проверяется при старте) |
| Fallback | Подсказки/статьи из БД | Без сети к LLM |
| Unit | **Vitest** | ~85% на `lib/*` (домен); без live LLM |
| E2E | Playwright — после MVP | |
| Хостинг MVP | Локально | |
| Секреты | `.env` / `.env.local` | Не коммитить |

### LLM — правила

1. Клиент не держит ключ и не вызывает Gemini.
2. Fallback без LLM обязателен.
3. **Failover (итерация 13b):** цепочка Gemini → DeepSeek (opt-in, `DEEPSEEK_API_KEY`) при 429/timeout/`no_key`/http/empty/network; финальный fallback — подсказки/статьи из БД.
3. No-spoiler: INV-07..09 в SRS (серверный reveal, фильтр ответа, без PII в промпте).
4. Ollama не используем.

### Контент

- Рантайм: **только SQLite** (Topic, DocArticle, Task, **TaskInstance**, Attempt, DayPlanPackage, MentorSession, …).
- Обновления: скрипт сида/заливки (оператор), не правка «на лету» учеником.
- Исходники сида могут лежать в `prisma/seed` / `content/seed` **вне** `public/` и не отдаваться статикой.
- Эталоны (`acceptedAnswers`) читают только server-модули в `lib/`.
- Табличный ответ (`answerType: table`, P-TABLE-ANSWER): описание таблицы (`rowHeader`, `rows`, `columns[{title, values}]`) хранится JSON в **существующей** колонке `options` у `Task` / `TaskInstance` (без миграции схемы; для choice там по-прежнему массив вариантов). Строка ответа — «ячейки через `,`, строки через `;`»; чистые хелперы — `lib/content/answer-table.ts` (общие для сервера и формы).

### БД — эволюция

- MVP: SQLite.
- Позже: Turso/Postgres без смены доменной модели — отдельное решение.

---

## 3. Границы приложения (модули / scopes)

| Scope | Ответственность |
|-------|-----------------|
| `web` | Страницы, layout, UI |
| `content` | Сид, валидация, чтение статей/задач из БД |
| `auth` | Seed-login, JWT-сессия |
| `progress` | Attempt, % по теме, DayPlanPackage, L1 XP/`TaskXpAward`/`UserBadge` |
| `trainer` | Проверка ответа, ступени, кнопка A (только SEED_TEST_USER), B, закрепление |
| `mentor` | Чат, фильтр, Gemini, fallback |
| `api` | Route Handlers / server-only при явном коммите |
| `agents` | Редко |

**Домен (`lib/`):** чистые функции принимают `userId`/данные параметрами, **без** импорта next/auth внутри доменной логики (NFR-08). UI и route handlers — тонкая обёртка.

Комментарии в коде — подробно на русском.

---

## 4. Структура репозитория

```
olympiad-mentor/
  app/                 # App Router
  proxy.ts             # Next 16 (бывший middleware)
  instrumentation.ts   # OUTBOUND_HTTPS_PROXY для Gemini
  lib/                 # домен + prisma client + auth helpers
  prisma/
    schema.prisma
    seed.ts            # демо-пользователь + демо-контент
  content/seed/        # исходники сида (НЕ public/)
  .env.example
  package.json
```

- `package-lock.json` — **в git**.
- SQLite файл — в `.gitignore`.
- Никакого эталонного контента под `public/`.

---

## 5. Потоки данных (MVP)

```
Ученик
  → Next.js
      → Auth.js (JWT)
      → Prisma → SQLite (контент + Attempt + прогресс)
      → trainer: normalize + match acceptedAnswers (server)
               hintSteps / boost после 3 неверных / кнопка A (только SEED_TEST_USER) / B / закрепление
               канон + «Другой вариант» (TaskInstance)
      → mentor: политика → фильтр INV-08 → [Gemini | DeepSeek | fallback]
```

---

## 6. NFR (архитектурный минимум)

См. также SRS §6. Кратко: заранее созданные пользователи, LLM opt-in, unit на домене, один процесс `next` для smoke, бэкап `*.db` в GUIDE.

---

## 7. Вне архитектуры MVP

- Express/FastAPI, Supabase/Firebase как ядро
- Ollama
- Playwright / ручные ТК
- Mobile-first продукт (адаптив 15 ✅ — не то же самое)
- I2: генерация новых задач моделью (instance 12a уже в продукте)
- Платный API как единственный путь
- Открытая регистрация
