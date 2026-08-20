# PLAN: Админ-настройки LLM-подключений (/admin/llm)

Дата: 2026-08-19

## Шаги

1. Prisma: модель `LlmSetting` + рукописная миграция `20260819000000_add_llm_settings`
2. `requireAdmin()` → `src/lib/auth.ts`; убрать копипасту из двух admin/users-роутов
3. Zod-схемы `src/lib/validations/llm-setting.ts` (create/update/test; клампы 0–2 / 256–128000 / 30–600)
4. `src/lib/ai/provider.ts`: чистая фабрика `buildModel(config)` (openai_compatible → `.chat()`) + `getLlm()` (активный пресет из БД, иначе env-fallback c пустыми settings)
5. Call-sites: `orchestrator.ts` (getLlm + temperature/maxOutputTokens/timeout; экспорт `formatAIError`) и `gaps/auto-generate` (`temperature ?? 0.3`)
6. API: `/api/admin/llm` (GET/POST), `/api/admin/llm/[id]` (PATCH/DELETE, активную не удалять — 409), `/api/admin/llm/[id]/activate` (транзакция), `/api/admin/llm/test` (generateText-пинг, HTTP 200 с ok/error)
7. UI: `components/admin/LlmSettingForm.tsx` (Dialog + react-hook-form, ключ с Eye/EyeOff и «оставьте пустым»), `app/admin/llm/page.tsx` (список, бейдж «Активная», футер про env-fallback), Sidebar → массив adminLinks с активностью по href
8. Проверка: prisma generate, tsc --noEmit, коммит в dev-mvp3

## Альтернативы

- Пакет `@ai-sdk/openai-compatible`: отвергнут — уже установленный `@ai-sdk/openai` покрывает Chat Completions через `.chat()` (проверено по d.ts); новая зависимость расширяет поверхность обновлений при нулевом выигрыше.
- Частичный уникальный индекс `WHERE isActive` для «одной активной»: отвергнут — Prisma не выражает его в schema.prisma → перманентный drift на каждом `migrate dev`; вместо него транзакция в activate-эндпоинте.
- Кэш активного пресета в памяти (TTL): отвергнут — ломает «применяется без редеплоя» на границе TTL и между инстансами, экономя один индексированный SELECT на фоне секундных LLM-вызовов.

## Риски

- 🔴 Изменение обвязки чата может сломать текущее поведение без пресетов → ДО начала: env-fallback возвращает settings:{} (undefined-поля в generateText эквивалентны их отсутствию — поведение бит-в-бит)
- 🟡 Tool-calling через openai_compatible-шлюз зависит от шлюза; «Проверить подключение» это не проверяет → следим: ручной тест чата с инструментами после активации пресета; примечание в UI
- 🟡 Plaintext-ключи в БД (осознанное решение) → следим: ключ никогда не сериализуется в ответы API, только keyMask
- 🟢 Двое админов одновременно жмут «Сделать активной» — детерминированно разрешается findFirst(orderBy updatedAt desc)

## Бюджет

- Файлов: ~14 (2 новых prisma-артефакта, 5 API-файлов, 2 UI, 5 правок) / Время: ~2-3 ч

## Чек-лист выхода
- [x] шаги конкретны (сделан/не сделан)
- [x] есть отвергнутая альтернатива с содержательной причиной
- [x] красных рисков нет (или решены) — единственный 🔴 снят дизайном fallback
- [x] бюджет назначен
