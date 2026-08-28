# PLAN: лимиты AI-прогона per-preset

Дата: 2026-08-21

## Шаги
1. schema + миграция add_llm_run_limits: maxSteps, stepTimeoutSec,
   chunkTimeoutSec, runContextBudgetBytes (все Int?); generate.
2. zod: границы 1–100 / 30–3600 / 15–600 / 20000–2000000.
3. toLlmSettingDto + POST/PATCH: прокинуть поля.
4. provider: LlmGenerationSettings + маппинг (сек → мс).
5. orchestrator: фактические maxSteps/stepMs/chunkMs везде (stopWhen,
   timeout, [AI_RUN], meta.budget, finishMessage, детект тишины);
   бюджет контекста в buildTools.
6. tools: параметр contextBudgetBytes, сообщение отказа от фактического числа.
7. форма: 4 optional-поля с подстрочниками «пусто = N»; payload, defaults,
   summaryLine.
8. PROJECT.md; tsc + build; сценарии из BRIEF.

## Альтернативы
- **Глобальные настройки отдельно от пресета**: отвергнута — лимиты
  зависят от модели/шлюза и должны переключаться вместе с пресетом.
- **Обязательные поля**: отвергнута пользователем — пусто = дефолт,
  старые пресеты работают без миграции значений.

## Риски
- 🟡 stepTimeout > timeoutSec бессмыслен → следим: stepMs = min(step, total)
  уже в коде.
- 🟡 chunkTimeout меньше пауз между reasoning-токенами шлюза порвёт живой
  стрим → следим: нижняя граница 15 с, дефолт 120 с, значение видно в [AI_RUN].
- 🟢 Новые колонки nullable — migrate deploy без даунтайма.

## Бюджет
- Файлов: 8 изменяемых + 2 документа задачи / Время: ~1 ч

## Чек-лист выхода
- [x] шаги конкретны (сделан/не сделан)
- [x] есть отвергнутая альтернатива с содержательной причиной
- [x] красных рисков нет (или решены)
- [x] бюджет назначен
