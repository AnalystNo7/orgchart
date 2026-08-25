# Карта проекта: OrgChart Modeler / «Цифровой двойник организации»

> Карта описывает ветку **dev-mvp4** (основная ветка разработки; создана 2026-08-22 от dev-mvp3). Составлена по коду 2026-08-19, актуализируется по ходу задач.

## Что это
AI-платформа моделирования и анализа организационной структуры («цифровой двойник»):
дерево подразделений с типизацией по ШЕТИЛ (зарабатывающие / ресурсные / сервисные / бэк-офис),
сотрудники (ПП/ОПП/АУП, FTE, ставки, тарифы), договоры и помесячные привязки,
P&L по подразделениям в 3 режимах аллокации выручки, сценарии as-is/to-be с diff,
процессы (RACI, flowchart/VAD), компетенции, цели BSC/OKR, клиенты/pipeline, бюджеты,
OHI-индекс, AI-ассистент с 33 инструментами и RAG-базой знаний.
Целевая аудитория (из `docs/CONCEPT-DIGITAL-TWIN.md` и `src/lib/ai/system-prompt.ts`):
аналитик/руководство ИТ-интегратора на 500–2000 сотрудников.

## Стек
- **Next.js 16.1.6** (App Router), `output: "standalone"`; **React 19.2.3**; **TypeScript 5** (strict; но `next.config.ts: typescript.ignoreBuildErrors = true` — билд не ловит ошибки типов)
- **Prisma 6.19.2** + **PostgreSQL** (в compose — образ `pgvector/pgvector:pg16`, но pgvector в коде пока не используется — поиск in-memory)
- **NextAuth 4.24** — credentials + JWT, `isAdmin` в сессии; `src/middleware.ts` (withAuth) закрывает всё, кроме `/login`, `/api/auth`, статики
- **AI**: Vercel AI SDK (`ai` ^6) + `@ai-sdk/anthropic|openai|google` — мультипровайдер: активный пресет из БД (`LlmSetting`, /admin/llm) или env-fallback `AI_PROVIDER`/`AI_MODEL` (дефолт anthropic / claude-sonnet-4); RAG-эмбеддинги — **Voyage AI** `voyage-3` (1024 dim, raw fetch, `VOYAGE_API_KEY`)
- UI: **Tailwind 4** + shadcn/ui (Radix, lucide), **@xyflow/react 12** + **dagre** (граф-канвасы), **zustand 5**, **@tanstack/react-table 8**, **react-hook-form 7** + **zod 4**, react-markdown
- Файлы: **xlsx** (импорт/экспорт Excel), **pdf-parse** / **mammoth** (PDF/DOCX для базы знаний; `serverExternalPackages`)
- Инфраструктура: Docker multi-stage (node:20-alpine, CMD = `prisma migrate deploy && node server.js`), `docker-compose.yml` (Dokploy) + `docker-compose.prod.yml` (Traefik/letsencrypt)

## Структура
```
prisma/
  schema.prisma        # 25 enum, 32 модели (ядро: Scenario→Department/Employee; Contract/EmployeeContract/Tariff;
                       #   Process*/Goal*/Competency*/Client/PipelineDeal/Budget*/Knowledge*/AIInsight*/PnlCache/ActionLog)
  migrations/          # 6 миграций + migration_lock.toml (postgresql)
  seed.ts              # admin@orgchart.local/admin123 (isAdmin); тарифы K-1..K-6 (1500..6000 ₽/ч);
                       #   baseline-сценарий: 21 подразделение, 52 сотрудника, 6 договоров, 13 процессов
src/
  middleware.ts        # withAuth: всё под логином, кроме /login и /api/auth
  app/                 # 21 страница + 66 API route.ts
    page.tsx           # дашборд, 3 вида: Оргструктура | P&L Heatmap | CEO Dashboard (ViewMode в store)
    scenarios/ strategy/ finance/ processes/(+[id]) competencies/(+gaps) clients/ compare/
    gap-analysis/ benchmarks/ knowledge/ references/(employees|contracts|tariffs) admin/(users|llm)/ login/
    api/               # группы: auth+admin users/llm(7), scenarios(3), departments(3), employees(3),
                       #   pnl+finance+budgets+benchmarks+ohi(8), contracts+tariffs+clients+pipeline(11),
                       #   competencies(6), goals+gaps+insights(6), processes+diagrams(7),
                       #   ai+knowledge(6), import/export(3), actions undo/redo(3)
  lib/                 # 39 файлов — вся бизнес-логика (см. таблицу модулей)
  components/          # 15 директорий, 63 файла: org-chart/ pnl/ dashboard/ ai-chat/ admin/ compare/
                       #   department-card/ employees/ contracts/ competencies/ gap-analysis/
                       #   process-diagram/ scenarios/ layout/ ui(18 примитивов, из них кастомные:
                       #   money-input, resizable-panel)
  types/               # index.ts (SHETIL_CONFIG, словари лейблов, DepartmentWithMetrics), next-auth.d.ts (isAdmin)
docs/
  CONCEPT-DIGITAL-TWIN.md   # концепция продукта (1198 строк)
  DEPLOY-GUIDE.md           # деплой на VPS через Dokploy
  IMPLEMENTATION-STATUS.md  # статус: «8 спринтов завершены»
  LIMITATIONS.md            # известные ограничения (P&L не учитывает дженерики/вакансии)
  1_1.xlsx                  # демо-выгрузка оргданных для импорта (бинарь, ~2 МБ)
harness/               # эта карта, DECISIONS.md, LESSONS.md, REQUIREMENTS.md (реестр требований
                       #   по Вигерсу; обновляется только по команде «обнови требования»),
                       #   templates/{BRIEF,PLAN,REQUIREMENTS}.md
scripts/
  requirements-docx/   # сборка harness/REQUIREMENTS.md в .docx по корпоративному образцу:
                       #   build.mjs (без зависимостей) + template/ (донор оформления:
                       #   стили, нумерация, 3 колонтитула, тема). Готовый .docx в git не хранится
tasks/                 # рабочие папки задач (tasks/<задача>/BRIEF.md, PLAN.md)
```

## Ключевые модули и точки входа
| Модуль | Где | За что отвечает |
|--------|-----|-----------------|
| P&L-калькулятор | `src/lib/pnl-calculator.ts` (745 стр.) | `calculatePnl(scenarioId, mode, period, allocationMode)`. `PnlMode`: plan/forecast/combined (фильтр по статусу договора). `PnlAllocationMode`: **earning** (выручка только REVENUE-блокам), **fte** (всем участникам), **transfer** (contract-first пре-проход `computeTransferAllocations`; `transferBreakdown` с sells/purchases). Мера вклада привязки — **FTE-часы периода обеспечения** (`fte × getWorkingHours(период привязки ∩ окно)`): выручка подразделения = amount × его FTE-часы в окне / FTE-часы всего срока обеспечения; TP-продажа = `Tariff.rate × FTE-часы в окне`; даты договора время не задают (REV-007 устарел), помесячные привязки эквивалентны длинным. Инвариант: ΣP&L орг. в transfer ≡ fte. Кэш — `PnlCache` (upsert по 6-полевому ключу) |
| P&L-кэш (не используется) | `src/lib/pnl-calculator.ts:684` | `calculateAndCachePnl` пишет `PnlCache`, но **никто её не вызывает** — ни API, ни AI-инструмент; кэш никогда не читается. Оставлено осознанно (решение 2026-08-20): расчёт всегда свежий |
| Производственный календарь | `src/lib/work-calendar.ts` | Рабочие часы РФ 2025–2027 (хардкод по месяцам), `getWorkingHours(start,end)` с пропорцией частичных месяцев |
| AI-ассистент | `src/lib/ai/` (10 файлов) | `orchestrator.runChat` (streamText — текст стримится дельтами, ≤30 шагов tool-loop; SSE-событие `meta` — бюджет и номер шага для живого статуса; finish ≠ stop оформляется как честный обрыв через onError; chunk-обрыв (провайдер замолчал) отличается от таймаута по тишине; 429 «too many concurrent requests» — авто-повтор 3×20 с, пока ничего не показано; имена инструментов в тексте ответа заменяются русскими метками (`src/lib/ai/tool-labels.ts` — общий словарь сервера и чипов UI), стиль «статус → результат» задан в технической части промпта; клон/what-if сценарий получает имя «Название (из: Родитель)» в точке клонирования, для старых связь показывает подстрочник из createdFrom); **tools.ts — 33 инструмента**, `wrapExecute` — единая точка: замер, кэш read-only вызовов за прогон, предохранитель бюджета контекста, `capToolResult`; `tool-executor.ts` — единый диспетчер, включая `run_whatif_scenario`; `local-query.ts` — ответы без LLM (бенчмарки/отклонения/поиск KB); `system-prompt.ts` — промпт из двух половин: методическая (редактируется в `/admin/settings/prompt`, хранится в `AiPromptSetting`; нет строки = дефолт из кода) + техническая (маркировка 【OSINT】/【KB】/【LLM】, порядок работы с инструментами — только в коде) |
| Бюджеты AI-прогона | `src/lib/ai/limits.ts`, `tool-result-limit.ts`, пресет LLM | Все лимиты per-preset (пусто = дефолт из limits.ts): total `timeoutSec` ≤3600 / шаг `stepTimeoutSec` (600 с) / тишина стрима `chunkTimeoutSec` (120 с) / шагов `maxSteps` (30) / бюджет контекста `runContextBudgetBytes` (120 КБ) / `toolResultMaxBytes` (60 КБ на результат); подрезка под `maxDuration` (300, литерал в `/api/ai/chat`) — только при `process.env.VERCEL`. Логи: `[AI_RUN]`, `[AI_STEP_START]`, `[AI_TOOL]`, `[AI_STEP]`, `[AI_DONE]`, `[AI_BUDGET]`, `[AI_CHAT_ERROR]` |
| LLM-пресеты | `src/lib/ai/provider.ts`, `/api/admin/llm*`, `/admin/settings/llm` (со старого `/admin/llm` redirect) | `getLlm()`: активный пресет `LlmSetting` из БД (provider openai_compatible/anthropic/openai/google, baseURL, ключ plaintext+маска, temperature, maxOutputTokens, timeout) или env-fallback; `buildModel()` — фабрика (openai_compatible → `.chat()`); переключение без редеплоя; «Проверить подключение» |
| Бенчмарки | `src/lib/ai/benchmarks/` | Статические OSINT-нормы: 20 метрик × 6 отраслей (org_design/financial/hr), min/optimal/max |
| RAG / база знаний | `src/lib/rag/` (7 файлов), `/knowledge` | Чанкинг (2000/200 симв.), Voyage-эмбеддинги, `retrieveChunks` — **in-memory cosine** (MVP; в коде пометка «заменить на pgvector <=>»), PDF/DOCX-парсеры. Флажок `includeInPrompt`: полный текст документа в системном промпте каждого запроса (бюджет `AI_KB_PROMPT_BUDGET_BYTES` 45 КБ — из лимита шлюза 65 536 Б на блок; включение сверх бюджета отклоняется, при сборке не влезающий документ пропускается целиком с `[AI_KB]`-логом); RAG-поиск от флажка не зависит. Просмотр извлечённого текста — диалог на `/knowledge` (оригинал файла не хранится) |
| OHI + health check | `src/lib/ohi-calculator.ts`, `org-analyzer.ts` | Индекс здоровья 0–100 из 7 взвешенных компонентов; `runHealthCheck` генерит `AIInsight`+рекомендации по порогам |
| Undo/Redo | `src/lib/action-logger.ts` | 17 типов действий через `ActionLog` (payload/undoPayload), API `/api/actions/*`, хоткеи в OrgChart |
| Граф-раскладка | `src/lib/layout/hybrid-layout.ts` | Общий движок OrgChart и PnlHeatmap: dagre TB + ручные «вертикальные» поддеревья (каскадный флаг, L-образные рёбра bottom→left) |
| Diff сценариев | `src/lib/diff.ts` | `computeDiff` по `originId`: added/removed/modified/moved + русские описания изменений |
| Автосумма договора | `src/lib/contract-auto-calc.ts` | При `amountAutoCalc`: Σ `tariff.rate × ec.fte × часы` по привязкам |
| AI-экспорт | `src/lib/ai-export.ts` | `/api/export/ai-analysis` — markdown-снапшот сценария (11 секций, P&L в fte+transfer, сотрудники анонимизированы «Employee #N») для внешней LLM |
| Импорты Excel | `components/employees/ExcelImport.tsx`, `ReferenceImport.tsx`, `/api/import`, `/api/import/reference` | Оргструктура+сотрудники (иерархия 4 уровней); справочник: матч по ФИО, тарифы К1–К6, договоры, помесячные FTE-периоды |
| Клиентский стор | `src/lib/store.ts`, `ai-store.ts` | `useOrgChartStore`: сценарий, viewMode, P&L-режимы (persist в localStorage), collapse/vertical, фильтры, undo/redo. `useAiChatStore`: стриминг-чат, фазы, беседы |
| Аутентификация | `src/lib/auth.ts`, `middleware.ts`, `/api/admin/users*` | Credentials+JWT+isAdmin; общий `requireAdmin()` в `lib/auth.ts` для admin-API, страницы `/admin/*` — только клиентский редирект |

## Как запустить / проверить
```bash
npm install
docker compose up -d db            # pgvector/pgvector:pg16 на :5432 (orgchart/orgchart)

# .env создать вручную (в репо нет .env.example). Используются:
#   DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL,
#   AI_PROVIDER (anthropic|openai|google), AI_MODEL,
#   ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY (по провайдеру),
#   VOYAGE_API_KEY (RAG-эмбеддинги; без него база знаний не индексируется)

npm run db:generate && npm run db:migrate && npm run db:seed
# логин: admin@orgchart.local / admin123

npm run dev                        # http://localhost:3000
npm run lint                       # eslint (flat config)
npx tsc --noEmit                   # ручная проверка типов — билд её НЕ делает (ignoreBuildErrors)

docker compose up --build          # полный стек; порт ${APP_PORT:-3001}; prod-вариант — docker-compose.prod.yml (Traefik)
```
Тестов нет: 0 файлов `*.test/*.spec`, нет тест-раннера, нет скрипта `test`.

## Known issues
- **`typescript.ignoreBuildErrors: true`** в `next.config.ts` — прод-билд собирается с ошибками типов. Сейчас `npx tsc --noEmit` даёт **14 pre-existing ошибок в 4 файлах**: `process-diagram/FlowchartEditor.tsx` (7), `rag/retrieval.ts` (4), `rag/ingestion.ts` (2), `employees/ExcelImport.tsx` (1). Новый код проверять tsc вручную и не добавлять новых.
- **RAG-поиск — in-memory** cosine по всем чанкам из БД; образ pgvector уже в compose, но SQL-оператор `<=>` не используется (пометка в `rag/retrieval.ts`). На больших базах знаний будет медленно.
- **Нет тестов** вообще; критичная логика (pnl-calculator, tool-executor) не покрыта.
- **Нет `.env.example`** — состав переменных задокументирован только здесь и в docker-compose.
- **Права**: страница `/admin/users` защищена только клиентским редиректом; серверная проверка isAdmin есть лишь в `/api/admin/users*`. Остальные API полагаются на общий middleware (любой залогиненный).
- **README.md** — дефолтный create-next-app, вводной информации о проекте не содержит (реальные доки — в `docs/`).
- **P&L**: не учитывает «дженерики»/вакантные позиции (`docs/LIMITATIONS.md`); `revenueStatus` привязок (PROVIDED/PLANNED/NOT_PROVIDED) в расчёте пока не участвует — решение 2026-08-22.
- **Календарь рабочих часов захардкожен на 2025–2027**; вне диапазона — усреднение 168 ч/мес. С 2028 г. потребуется дополнение таблицы.
- Демо-файл `docs/1_1.xlsx` (~2 МБ бинарь) лежит в репозитории.
