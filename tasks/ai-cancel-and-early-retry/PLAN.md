# PLAN: отмена прогона при обрыве клиента и повтор при раннем обрыве

Дата: 2026-09-09

## Семантика abort в AI SDK 6.0.193 и Next 16 (проверено по исходникам)

| Факт | Где |
|---|---|
| Наш `abortSignal` сливается с тремя таймаут-сигналами в один; для SDK отмена клиента и таймаут неотличимы | `node_modules/ai/src/generate-text/stream-text.ts:543-548` |
| При abort `for await (result.textStream)` **завершается нормально, не бросает**; SDK вызывает `onAbort({ steps })` и закрывает поток | `stream-text.ts:1211-1248, 2287-2302` |
| `await result.finishReason`: 0 шагов → **reject** нашим `reason`; ≥1 шага → **`"other"`** | `stream-text.ts:1081-1104` |
| `onError` стрима при abort **не вызывается** | `stream-text.ts:887-889, 1235` |
| Инструменты получают `options.abortSignal`, но `wrapExecute` его игнорирует; SDK замечает abort только на следующем чанке, поэтому во время выполнения инструмента `for await` блокируется до его конца | `execute-tool-call.ts:105-112`, `tools.ts:88`, `stream-text.ts:1228-1238` |
| Отличать отмену по имени ошибки нельзя (`TimeoutError`/`AbortError` приходят и от таймаутов); **только по нашему `signal.aborted`** | `@ai-sdk/provider-utils/src/is-abort-error.ts` |
| 429 на первом запросе → `finishReason` reject `NoOutputGeneratedError` → наш `catch`; 429 на шаге 2 → `onError` + `finishReason === "other"`, исключения нет (баг 2) | `stream-text.ts:2115-2127, 2155-2166` |
| Next 16: `req.signal` abort при разрыве клиента (`res.once("close")`), `cancel()` у `ReadableStream` вызывается через `pipeTo` | `next/dist/server/web/spec-extension/adapters/next-request.js:46-63`, `pipe-readable.js:117-125` |
| После cancel `enqueue`/`close` бросают `Invalid state`; heartbeat в таймере даёт **uncaught exception** | route.ts:103-105 |

Вывод: красный риск снят. Abort определяется только по `signal.aborted`, проверка стоит раньше любой классификации ошибок; слот очереди освобождается слушателем abort, а не ожиданием выхода из `for await`.

## Шаги

1. `src/lib/ai/limits.ts` — `AI_RETRY_MAX_SHOWN_CHARS = 300` (порог «модель только объявила план»); обновить комментарий у `AI_MAX_RETRIES`: повтор возможен, пока прогон ранний (≤1 завершённый шаг и ≤300 показанных символов).
2. `src/lib/ai/orchestrator.ts`:
   - `StreamCallbacks.onAbort?: (partial: PartialRun) => void | Promise<void>`; `runChat(…, options: { signal?: AbortSignal } = {})`. Первая строка: `if (signal?.aborted) { onAbort(пусто); return }` до `getSystemPrompt`/`getLlm`.
   - `acquireRunSlot({ …, signal })`; в `.catch`: если `signal.aborted` → `onAbort`, `return null`, иначе прежний `onError`.
   - Сразу после получения `ticket`: `signal?.addEventListener("abort", () => ticket.release(), { once: true })` (release идемпотентен) — слот освобождается мгновенно, даже если SDK заблокирован внутри инструмента; в `finally` снять слушатель, очистить `warnTimer`, `release()`.
   - `streamText({ …, abortSignal: signal, onAbort: ({steps}) => log("[AI_ABORT] SDK прервал поток после N шагов") })`.
   - Локальные helpers: `partial()`, `finishAbort()` (лог `[AI_ABORT] Xs, N шагов, K символов сохранено` + `onAbort(partial())`), `isEarlyRun = () => stepNo <= 1 && partialText.length <= AI_RETRY_MAX_SHOWN_CHARS && allToolCalls.every(t => READ_ONLY_TOOLS.has(t.name))` (экспортировать `READ_ONLY_TOOLS` из `tools.ts`; write-инструменты на шаге 1 → без повтора), `waitBeforeRetry(verdict, attempt, note)`: расчёт паузы с Retry-After (вынести из `catch`), лог `[AI_RETRY] … после шага N, показано K символов`, при `partialText !== ""` пометка `"\n\n_Повтор из-за ошибки провайдера (причина), попытка N из M…_\n\n"` в `partialText` и через `onText`, `onStatus("retry_wait")`, `await sleep(delayMs, signal)`.
   - `sleep(ms, signal)` на уровне модуля: резолвится по abort (не reject), вызывающий проверяет `signal.aborted`.
   - После `const finishReason = await result.finishReason`: `if (signal?.aborted) { finishAbort(); return }`.
   - В ветке `finishReason !== "stop"`: `streamVerdict = lastStreamError ? classifyProviderError(lastStreamError) : null`; если `retryable && isEarlyRun() && attempt < maxRetries` → `await waitBeforeRetry(...)`, повторная проверка abort, `continue`; иначе лог `[AI_RETRY_SKIP] причина, шаг N, показано K символов` и прежний `[AI_INCOMPLETE]`.
   - В `catch`: первой строкой проверка `signal?.aborted` → `finishAbort()`; условие повтора `partialText === ""` заменить на `isEarlyRun()`, использовать `waitBeforeRetry`.
3. `src/lib/ai/tools.ts` — `wrapExecute`: сигнатура `(params, options?: { abortSignal?: AbortSignal })`, первой строкой при `options?.abortSignal?.aborted` вернуть `{ error: "aborted", message: "Запрос отменён." }`; экспорт `READ_ONLY_TOOLS`.
4. `src/app/api/ai/chat/route.ts`:
   - На уровне `POST`: `abort = new AbortController()`, `closed = false`, `heartbeat`, `cleanup()`, `abortRun(reason)` (идемпотентно: `cleanup()` + `abort.abort(...)`); `req.signal` → `abortRun`.
   - В `start`: `send` no-op при `closed`, `try/catch` вокруг `enqueue` ставит `closed = true`; единственная точка закрытия `finish()` (`closed = true; cleanup(); try { controller.close() } catch {}`), `onDone`/`onError` вызывают `finish()`; `await runChat(…)` в `try/catch` → при неожиданном исключении `send("error")` + `finish()`.
   - `runChat(…, { signal: abort.signal })`; `onAbort(partial)`: `cleanup()`, `saveConversation` с `assistantContent = partial.text + "\n\n_Запрос отменён пользователем._"`, `context: { toolCalls, aborted: true, cancelled: true, steps }`, **без `send` и без `close`**.
   - `cancel(reason)` у `ReadableStream`: `closed = true; abortRun(reason)`.
5. `scripts/ai-retry-check/mock-llm.mjs` — парсить тело, `secondStep = messages.some(m => m.role === "tool")`; `streamToolCall`: короткий текст + `tool_calls` на `list_scenarios` (формат проверен по `openai-chat-language-model.ts:553-622`) + `finish_reason: "tool_calls"`; режимы `fail_step2:<n>` (шаг 1 → tool call, первые n запросов шага 2 → 429, потом успех), `drip:<ms>` (текст каждые ms ~60 с), `stream_error:<n>` (ошибка внутри 200 SSE → `finishReason === "error"`); счётчик `closed` по `res.on("close")` при `!writableFinished`, в `/__stats`.
6. `scripts/ai-retry-check/retry-test.ts` — `run({ signal })`, сбор `text` и `aborted`; кейсы: 11 `fail_step2:1`, maxRetries 3 → done, 4 запроса, пометка о повторе в тексте, `active === 0`; 12 то же при maxRetries 0 → ошибка, 2 запроса; 13 abort во время запроса (`slow:5000`, 500 мс) → `onAbort` < 2 с, мок видит `closed ≥ 1`, следующий прогон без `queue_wait`; 14 abort посреди стрима (`drip:200`) → `aborted`, текст непустой, без исключений; 15 abort в очереди; 16 abort во время паузы повтора (`concurrent:99`, пауза 10 с, отмена через 1 с → выход ≤ 1.5 с); 17 `fail_step2` при длинном тексте шага 1 (> 300 символов) → без повтора, `[AI_RETRY_SKIP]`.
7. `docs/LIMITATIONS.md` — новая строка: отменённый первый ход нового диалога сохраняется, но `conversation_id` до клиента не доходит, следующее сообщение откроет новый диалог. `harness/PROJECT.md` — `onAbort`, `signal`, `AI_RETRY_MAX_SHOWN_CHARS`.
8. `npx tsc --noEmit`, `eslint` по изменённым файлам, `next build`, оба тестовых скрипта (регресс 25+14 и новые 11–17).
9. `tasks/ai-cancel-and-early-retry/{BRIEF,PLAN,REPORT}.md`; черновики строк для `DECISIONS.md` и `LESSONS.md`.

Порядок: 1 → 2 → 3 (проверяемы моком без route) → 4 → 5 → 6 → 7 → 8 → 9.

## Альтернативы

- **Только защитить `send` от закрытого потока, прогон не прерывать**: отвергнута, потому что не устраняет причину: отменённый прогон продолжает держать слот очереди и слот Gonka до 10+ минут, следующий запрос пользователя ждёт за ним, а провайдер отвечает «too many concurrent requests».
- **Повторять при обрыве стрима всегда, независимо от показанного текста**: отвергнута, потому что при длинном ответе повтор перерисовывает уже прочитанный текст и удваивает стоимость токенов; порог «≤ 1 шага, ≤ 300 символов» покрывает наблюдаемый случай (76 символов на шаге 1) без этой цены.
- **Прерывать по таймеру бездействия клиента вместо `AbortSignal`**: отвергнута, потому что добавляет задержку и эвристику там, где у платформы есть точный сигнал разрыва соединения.
- **Продолжать неудавшуюся попытку с шага 2 вместо перезапуска** (переслать накопленные сообщения с tool-результатами): отвергнута, потому что у `streamText` нет точки возобновления, сообщения попытки видны только после закрытия потока, а воспроизведение требует ручной сборки `ModelMessage` с совпадающими `toolCallId`; кэш инструментов уже делает полный перезапуск ценой одного дешёвого шага.

## Риски

- 🟢 (был 🔴, снят) SDK при abort не бросает из `for await`, `finishReason` = reject или `"other"` → abort проверяется по `signal.aborted` раньше любой классификации ошибки, во всех трёх точках (после `finishReason`, в ветке `!== "stop"`, в `catch`).
- 🟡 `cancel()` в Node-рантайме Next может прийти не всегда → следим: дублируем через `req.signal` (оба от одного `close`), обработчик идемпотентен; тест 13 проверяет фактическое закрытие на моке.
- 🟡 Инструменты в БД не прерываются сигналом, SDK замечает abort только на следующем чанке → следим: слот освобождается слушателем abort, а не выходом из `for await`; `wrapExecute` не начинает новые вызовы после отмены; текущий запрос в БД доживает, `onStepFinish` для него не приходит.
- 🟡 Мгновенное освобождение нашего слота может столкнуть следующий прогон с ещё занятым слотом Gonka → следим: это как раз гасится повтором на раннем прогоне (ничего не показано), поэтому обе правки идут вместе.
- 🟡 Повтор после шага 1 переисполнил бы write-инструменты → предикат `isEarlyRun` требует, чтобы все вызовы шага 1 были из `READ_ONLY_TOOLS`.
- 🟢 Отменённый первый ход нового диалога сохраняется, но `conversation_id` не доходит до клиента; следующее сообщение откроет новый диалог. Фиксируется в `LIMITATIONS.md`.
- 🟢 Пометка о повторе попадает в сохранённый текст диалога — желаемое поведение.

## Бюджет
- Файлов: 6 (limits, orchestrator, tools, route, mock, тест) + 3 документа (LIMITATIONS, PROJECT, tasks/) / Время: 1 день разработки, 1 день проверки заказчиком.

## Верификация
1. `npx tsc --noEmit` без новых ошибок (база: 14 в чужих файлах), `eslint` по изменённым файлам, `next build`.
2. Мок: регресс 25 + 14 проверок и новые кейсы 11–17 из шага 6.
3. На стенде заказчика: отмена во время «Шаг 1» → в консоли `[AI_ABORT]`, без `Controller is already closed`; повторный вопрос сразу стартует без `queue_wait`; искусственный 429 на шаге 2 воспроизвести нельзя, поэтому этот критерий закрывается моком.

## Чек-лист выхода
- [x] шаги конкретны (сделан/не сделан)
- [x] есть отвергнутая альтернатива с содержательной причиной
- [x] красных рисков нет (или решены)
- [x] бюджет назначен

