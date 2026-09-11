import { streamText, generateText, stepCountIs } from "ai";
import { getLlm } from "./provider";
import {
  buildTools,
  createToolRunStats,
  READ_ONLY_TOOLS,
  type ToolRunStats,
} from "./tools";
import { getSystemPrompt } from "./system-prompt";
import { createToolNameFilter } from "./tool-labels";
import { createThinkFilter, type ReasoningBoundary } from "./think-filter";
import {
  LANGUAGE_REMINDER,
  buildRepairPrompt,
  findForeignFragments,
  isSafeRepair,
} from "./language";
import {
  AI_CHUNK_TIMEOUT_MS,
  AI_RUN_CONTEXT_BUDGET_BYTES,
  AI_DEFAULT_TOTAL_TIMEOUT_MS,
  AI_LOOP_SAFETY_MS,
  AI_MAX_STEPS,
  AI_ROUTE_MAX_DURATION_SEC,
  AI_STEP_TIMEOUT_MS,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
  AI_RETRY_DELAY_CAP_MS,
  AI_MAX_CONCURRENT_RUNS,
  AI_QUEUE_TIMEOUT_MS,
  AI_RETRY_MAX_SHOWN_CHARS,
  AI_DEBUG_RAW_CHUNK_MAX_CHARS,
  AI_LANGUAGE_REPAIR_TIMEOUT_MS,
} from "./limits";
import { acquireRunSlot, QueueTimeoutError } from "./run-queue";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onToolCall: (info: ToolCallInfo) => void;
  onStatus: (phase: string, detail?: string) => void;
  onProgress: (toolName: string, step: string) => void;
  onDone: (fullResponse: string, toolCalls: ToolCallInfo[]) => void;
  onError: (error: Error, partial: PartialRun) => void;
  onMeta: (meta: RunMeta) => void;
  /**
   * Клиент отменил запрос (кнопка «Отмена», закрытие вкладки). Поток к нему
   * уже закрыт: сюда только сохранение собранного, ничего не отправлять.
   */
  onAbort?: (partial: PartialRun) => void | Promise<void>;
  /** Сервер переписал готовый ответ (починка языка) — заменить текст в чате. */
  onReplace?: (text: string) => void;
}

export interface RunChatOptions {
  /** Сигнал отмены от клиента; прерывает очередь, паузы повторов и стрим. */
  signal?: AbortSignal;
}

/**
 * Run metadata for the live status indicator: the client cannot know the
 * budget or the current step on its own — only this side does.
 */
export type RunMeta =
  | { type: "budget"; totalMs: number; maxSteps: number }
  | { type: "step_start"; step: number; inputKb: number };

/** What a turn managed to produce before it was aborted. */
export interface PartialRun {
  /** Text the model emitted across completed steps (already streamed to the UI). */
  text: string;
  /** Tools that ran, in order. */
  toolNames: string[];
  /** Steps that completed. */
  steps: number;
}

/**
 * Run a conversation turn with the configured LLM provider,
 * handling tool use loops. Reports progress via callbacks.
 */
export async function runChat(
  messages: ChatMessage[],
  scenarioId: string,
  scenarioName: string,
  callbacks: StreamCallbacks,
  options: RunChatOptions = {},
): Promise<void> {
  const { signal } = options;
  const emptyPartial = (): PartialRun => ({ text: "", toolNames: [], steps: 0 });
  // Клиент ушёл ещё до старта — не тратим ни БД, ни слот.
  if (signal?.aborted) {
    console.log("[AI_ABORT] отмена до старта прогона");
    await callbacks.onAbort?.(emptyPartial());
    return;
  }

  const {
    prompt: systemPrompt,
    isCustom: promptIsCustom,
    kbDocs,
  } = await getSystemPrompt(scenarioName);
  const allToolCalls: ToolCallInfo[] = [];

  const onToolProgress = (toolName: string, step: string) => {
    callbacks.onProgress(toolName, step);
  };

  // Resolve the LLM first: the tool-result cap comes from the active preset.
  const { model, settings, info } = await getLlm();
  // Per-preset run limits; the limits.ts constants are the defaults.
  const maxSteps = settings.maxSteps ?? AI_MAX_STEPS;
  const chunkMs = settings.chunkTimeoutMs ?? AI_CHUNK_TIMEOUT_MS;
  const contextBudgetBytes =
    settings.runContextBudgetBytes ?? AI_RUN_CONTEXT_BUDGET_BYTES;
  const toolStats = createToolRunStats();
  const tools = buildTools(
    scenarioId,
    onToolProgress,
    settings.toolResultMaxBytes,
    toolStats,
    contextBudgetBytes,
  );

  // Total budget: the preset's timeoutSec, or a generous default. The clamp
  // below the platform's maxDuration applies ONLY on Vercel — locally there is
  // no platform limit, and a self-imposed 280s ceiling was exactly what kept
  // killing long reasoning runs.
  let totalMs = settings.timeoutMs ?? AI_DEFAULT_TOTAL_TIMEOUT_MS;
  let vercelClamped = false;
  if (process.env.VERCEL) {
    const platformBudget = AI_ROUTE_MAX_DURATION_SEC * 1000 - AI_LOOP_SAFETY_MS;
    if (totalMs > platformBudget) {
      totalMs = platformBudget;
      vercelClamped = true;
      console.log(
        `[AI_LIMIT] timeout урезан до ${sec(platformBudget)}s` +
          ` (Vercel maxDuration ${AI_ROUTE_MAX_DURATION_SEC}s − запас ${sec(AI_LOOP_SAFETY_MS)}s)`,
      );
    }
  }
  const stepMs = Math.min(settings.stepTimeoutMs ?? AI_STEP_TIMEOUT_MS, totalMs);
  // Повторы и очередь — тоже из пресета, дефолты в limits.ts.
  const maxRetries = settings.maxRetries ?? AI_MAX_RETRIES;
  const retryDelayMs = settings.retryDelayMs ?? AI_RETRY_DELAY_MS;
  const maxConcurrentRuns = settings.maxConcurrentRuns ?? AI_MAX_CONCURRENT_RUNS;
  const queueTimeoutMs = settings.queueTimeoutMs ?? AI_QUEUE_TIMEOUT_MS;

  // Who is actually answering and under what caps. maxOutputTokens is nullable
  // in the preset, and an absent cap is a different thing from an unknown one —
  // for a reasoning model it means nothing bounds the generation.
  console.log(
    `[AI_RUN] ${info.source === "preset" ? `пресет "${info.name}"` : "env-конфигурация"}` +
      ` · ${info.provider} · ${info.model}` +
      ` · maxOutputTokens=${settings.maxOutputTokens ?? "НЕ ЗАДАН"}` +
      ` · temperature=${settings.temperature ?? "по умолчанию"}` +
      ` · timeout total ${sec(totalMs)}s / step ${sec(stepMs)}s / chunk ${sec(chunkMs)}s${vercelClamped ? " (Vercel clamp)" : ""}` +
      ` · tool-cap ${settings.toolResultMaxBytes ?? "по умолчанию"}` +
      ` · шагов ≤${maxSteps} · контекст ≤${contextBudgetBytes}B` +
      ` · повторов ≤${maxRetries} × ${sec(retryDelayMs)}s · слотов ${maxConcurrentRuns} · очередь ≤${sec(queueTimeoutMs)}s` +
      ` · инструментов ${Object.keys(tools).length}` +
      ` · промпт ${promptIsCustom ? "изменён" : "стандартный"}` +
      ` · документы БЗ: ${kbDocs.count > 0 ? `${kbDocs.count} (${(kbDocs.bytes / 1024).toFixed(1)} КБ)` : "нет"}`,
  );

  // Слот к провайдеру: сверх лимита прогоны ждут здесь (с видимой позицией),
  // а не бьются о 429 шлюза. Слот удерживается весь прогон, включая паузы
  // повторов — у шлюза он в это время всё равно занят.
  const ticket = await acquireRunSlot({
    max: maxConcurrentRuns,
    timeoutMs: queueTimeoutMs,
    signal,
    onWait: (position, ahead) => {
      callbacks.onStatus(
        "queue_wait",
        `В очереди к AI-провайдеру: позиция ${position}` +
          (ahead > 0 ? `, впереди ${ahead}` : "") +
          "…",
      );
    },
  }).catch(async (error: unknown) => {
    if (signal?.aborted) {
      console.log("[AI_ABORT] отмена во время ожидания в очереди");
      await callbacks.onAbort?.(emptyPartial());
      return null;
    }
    console.error("[AI_QUEUE]", error instanceof Error ? error.message : error);
    callbacks.onError(new Error(formatAIError(error)), emptyPartial());
    return null;
  });
  if (!ticket) return;
  if (ticket.waitedMs > 0) {
    console.log(`[AI_QUEUE] слот получен после ожидания ${sec(ticket.waitedMs)}s`);
  }
  // Отмена клиента освобождает слот сразу, не дожидаясь выхода из стрима:
  // SDK замечает abort только на следующем чанке, а инструмент может идти в БД.
  const releaseOnAbort = () => ticket.release();
  signal?.addEventListener("abort", releaseOnAbort, { once: true });

  // Step timing: the gaps between steps are the model's own latency, which
  // is what a whole-loop timeout usually burns through.
  const runStartedAt = Date.now();
  let stepNo = 0;
  let firstStepMs = 0;
  // A step that never finishes leaves no [AI_STEP] line at all, so the only
  // way to name the culprit on abort is to record it when it starts.
  let inFlightStep = 0;
  let inFlightStartedAt = 0;
  let inFlightInputBytes = 0;
  let partialText = "";
  // Сколько символов черновика скрыто за прогон — в сводку [AI_DONE].
  let hiddenChars = 0;
  // Диагностика формата шлюза: печать сырых чанков включается переменной
  // окружения, чтобы разово посмотреть, есть ли у провайдера отдельное поле
  // рассуждений вместо <think> внутри content.
  const rawChunkLimit = Math.max(0, Number(process.env.AI_DEBUG_RAW_CHUNKS ?? 0) || 0);

  // Warn the user a minute before the total budget runs out. Lives here (not
  // in the route) because only this side knows the actual budget.
  const warnTimer =
    totalMs > 120_000
      ? setTimeout(
          () => callbacks.onStatus("timeout_warning"),
          totalMs - 60_000,
        )
      : null;

  // With streaming, the underlying failure (429, network…) is delivered to
  // the onError callback, while the iteration throws a NoOutputGeneratedError
  // wrapper — mapping errors off the caught object alone is blind.
  let lastStreamError: unknown;
  // Age of the last sign of life from the provider: tells a chunk-timeout
  // stall apart from an exhausted total budget in the finish handling.
  let lastActivityAt = Date.now();

  const partial = (): PartialRun => ({
    text: partialText,
    toolNames: allToolCalls.map((t) => t.name),
    steps: stepNo,
  });
  const finishAbort = async () => {
    console.log(
      `[AI_ABORT] ${sec(Date.now() - runStartedAt)}s, ${stepNo} шаг(ов),` +
        ` ${partialText.length} символов сохранено`,
    );
    await callbacks.onAbort?.(partial());
  };
  // «Ранний» прогон можно перезапустить: модель успела только объявить план,
  // а все её вызовы были read-only — повтор возьмёт их из кэша, а не повторит
  // запись в БД.
  const isEarlyRun = () =>
    stepNo <= 1 &&
    partialText.length <= AI_RETRY_MAX_SHOWN_CHARS &&
    allToolCalls.every((t) => READ_ONLY_TOOLS.has(t.name));
  // Пауза перед повтором: настроенная — минимум, Retry-After провайдера может
  // её увеличить, но не дальше потолка. Если текст уже показан — честная
  // пометка в чат, чтобы перезапуск не выглядел как сбой.
  const waitBeforeRetry = async (verdict: ProviderErrorVerdict, attempt: number) => {
    const delayMs = Math.max(
      retryDelayMs,
      Math.min(verdict.retryAfterMs ?? 0, AI_RETRY_DELAY_CAP_MS),
    );
    console.log(
      `[AI_RETRY] ${verdict.reason} — попытка ${attempt + 1} из ${maxRetries},` +
        ` пауза ${sec(delayMs)}s` +
        (verdict.retryAfterMs != null
          ? ` (Retry-After ${sec(verdict.retryAfterMs)}s)`
          : "") +
        ` · после шага ${stepNo}, показано ${partialText.length} символов`,
    );
    if (partialText !== "") {
      const note =
        `\n\n_Повтор из-за ошибки провайдера (${verdict.reason}),` +
        ` попытка ${attempt + 1} из ${maxRetries}…_\n\n`;
      partialText += note;
      callbacks.onText(note);
    }
    callbacks.onStatus(
      "retry_wait",
      `Провайдер занят (${verdict.reason}) — повтор через ${Math.round(delayMs / 1000)} с,` +
        ` попытка ${attempt + 1} из ${maxRetries}…`,
    );
    await sleep(delayMs, signal);
  };

  // Иероглифы и другие чужие письменности в готовом ответе: один вызов той
  // же модели без инструментов «перепиши по-русски». Ответ уже показан, поэтому
  // результат уходит событием replace; при любом сомнении остаётся исходный.
  const repairLanguage = async (text: string, foreign: string[]): Promise<string | null> => {
    const startedAt = Date.now();
    const found = foreign.join(", ");
    callbacks.onStatus("llm_analyzing");
    try {
      const res = await generateText({
        model,
        prompt: buildRepairPrompt(text),
        temperature: 0,
        maxOutputTokens: settings.maxOutputTokens,
        abortSignal: signal,
        timeout: AI_LANGUAGE_REPAIR_TIMEOUT_MS,
        maxRetries: 0,
      });
      // Модель может ответить с рассуждениями и внутренними именами инструментов.
      const think = createThinkFilter();
      const names = createToolNameFilter();
      const stripped = think.push(res.text).text + think.endStep({ toolCalls: false }).text;
      const clean = (names.push(stripped) + names.flush()).trim();
      if (!isSafeRepair(text, clean)) {
        console.log(
          `[AI_LANG] найдено: ${found} → не исправлено (результат отклонён: чужие символы или числа разошлись)` +
            ` за ${sec(Date.now() - startedAt)}s`,
        );
        return null;
      }
      console.log(
        `[AI_LANG] найдено: ${found} → исправлено за ${sec(Date.now() - startedAt)}s` +
          ` (длина ${text.length} → ${clean.length})`,
      );
      return clean;
    } catch (error) {
      console.log(
        `[AI_LANG] найдено: ${found} → не исправлено (${errorTextOf(error).slice(0, 120)})`,
      );
      return null;
    }
  };

  try {
    for (let attempt = 0; ; attempt++) {
      lastStreamError = undefined;
      stepNo = 0;
      firstStepMs = 0;
      inFlightStep = 0;
      inFlightStartedAt = 0;
      inFlightInputBytes = 0;
      hiddenChars = 0;
      lastActivityAt = Date.now();

      try {
        callbacks.onMeta({ type: "budget", totalMs, maxSteps });
        callbacks.onStatus("llm_thinking");

        const result = streamText({
          model,
          temperature: settings.temperature,
          maxOutputTokens: settings.maxOutputTokens,
          // Повторы — только наш цикл ниже: встроенные у SDK быстрые (~7 с на
          // 3 запроса) и удваивают счёт; с 0 «попытка N из M» = число реальных
          // HTTP-запросов.
          maxRetries: 0,
          abortSignal: signal,
          includeRawChunks: rawChunkLimit > 0,
          onAbort: ({ steps }) => {
            console.log(`[AI_ABORT] SDK прервал поток после ${steps.length} шаг(ов)`);
          },
          timeout: {
            totalMs,
            stepMs,
            chunkMs,
          },
          system: systemPrompt,
          messages: messages.map((m, i) => ({
            role: m.role,
            // Напоминатель о языке — только в копии для модели: последний ход
            // пользователя весит у открытых моделей больше системного промпта.
            // В чат и в сохранённый диалог он не попадает.
            content:
              m.role === "user" && i === messages.length - 1
                ? `${m.content}\n\n${LANGUAGE_REMINDER}`
                : m.content,
          })),
          tools,
          stopWhen: stepCountIs(maxSteps),
          onError: ({ error }) => {
            lastStreamError = error;
            console.error(
              "[AI_STREAM_ERROR]",
              error instanceof Error ? error.message : error,
            );
          },
          experimental_onStepStart: ({ stepNumber, messages: stepMessages }) => {
            // Streamed deltas of consecutive steps would otherwise concatenate
            // into one paragraph.
            if (partialText && !partialText.endsWith("\n\n")) {
              partialText += "\n\n";
              callbacks.onText("\n\n");
            }
            inFlightStep = stepNumber + 1;
            inFlightStartedAt = Date.now();
            lastActivityAt = Date.now();
            inFlightInputBytes = Buffer.byteLength(
              JSON.stringify(stepMessages),
              "utf8",
            );
            console.log(
              `[AI_STEP_START] #${inFlightStep} +${sec(inFlightStartedAt - runStartedAt)}s` +
                ` · сообщений ${stepMessages.length}` +
                ` · вход ~${kb(inFlightInputBytes)} КБ`,
            );
            callbacks.onMeta({
              type: "step_start",
              step: inFlightStep,
              inputKb: Math.round(inFlightInputBytes / 1024),
            });
          },
          onStepFinish: ({ text, toolCalls, toolResults }) => {
            lastActivityAt = Date.now();
            stepNo += 1;
            if (stepNo === 1) firstStepMs = Date.now() - runStartedAt;
            console.log(
              `[AI_STEP] #${stepNo} +${Date.now() - runStartedAt}ms` +
                `, tools: ${toolCalls?.map((t) => t.toolName).join(", ") || "—"}` +
                `, text: ${text ? text.length : 0} chars`,
            );
            // Text is NOT sent from here any more — it already went out as
            // stream deltas; re-sending would duplicate every step's text.
            if (toolCalls && toolCalls.length > 0) {
              for (let i = 0; i < toolCalls.length; i++) {
                const tc = toolCalls[i];
                const tr = toolResults?.[i] as
                  | Record<string, unknown>
                  | undefined;
                const tcAny = tc as Record<string, unknown>;
                const toolInput = tcAny.input ?? tcAny.args ?? {};
                const trResult = tr?.result;
                const info: ToolCallInfo = {
                  name: tc.toolName,
                  input: toolInput as Record<string, unknown>,
                  result:
                    typeof trResult === "string"
                      ? trResult
                      : JSON.stringify(trResult ?? ""),
                };
                allToolCalls.push(info);
                callbacks.onStatus("tool_completed", tc.toolName);
                callbacks.onToolCall(info);
              }
              callbacks.onStatus("llm_analyzing");
            }
          },
        });

        // Drive the stream: deltas reach the user the moment the model emits them,
        // and whatever is on screen at an abort is exactly what partialText holds.
        // Читаем fullStream, а не textStream: границу шага и признак «шаг
        // закончился инструментами» знает только он, а по ним фильтр решает,
        // отбросить черновик или показать его (страховка).
        // Два фильтра подряд: think — прячет рассуждения, name — переписывает
        // внутренние имена инструментов; оба удерживают хвост, поэтому push/flush.
        const nameFilter = createToolNameFilter();
        const thinkFilter = createThinkFilter();
        let reasoningAnnounced = false;
        let rawSeen = 0;

        const emit = (chunk: string) => {
          if (!chunk) return;
          const out = nameFilter.push(chunk);
          if (out) {
            partialText += out;
            callbacks.onText(out);
          }
        };
        const noteHidden = (n: number) => {
          if (n <= 0) return;
          if (!reasoningAnnounced) {
            reasoningAnnounced = true;
            callbacks.onStatus("llm_reasoning");
          }
        };
        const finishStep = (toolCalls: boolean) => {
          const end = thinkFilter.endStep({ toolCalls });
          emit(end.text);
          if (end.hidden > 0) {
            hiddenChars += end.hidden;
            console.log(
              `[AI_REASONING] шаг ${inFlightStep || stepNo + 1}: скрыто ${end.hidden} символов,` +
                ` граница: ${BOUNDARY_LABEL[end.boundary]}`,
            );
          }
          reasoningAnnounced = false;
          rawSeen = 0;
        };

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta": {
              lastActivityAt = Date.now();
              const out = thinkFilter.push(part.text);
              noteHidden(out.hidden);
              emit(out.text);
              break;
            }
            case "reasoning-delta": {
              // Провайдер отдал рассуждения отдельным каналом — показывать их
              // тем более незачем.
              lastActivityAt = Date.now();
              const text = (part as { text?: string }).text ?? "";
              noteHidden(thinkFilter.hide(text).hidden);
              break;
            }
            case "finish-step": {
              lastActivityAt = Date.now();
              finishStep(part.finishReason === "tool-calls");
              break;
            }
            case "raw": {
              if (rawSeen < rawChunkLimit) {
                rawSeen += 1;
                const dump = JSON.stringify(part.rawValue) ?? "";
                console.log(`[AI_RAW] ${dump.slice(0, AI_DEBUG_RAW_CHUNK_MAX_CHARS)}`);
              }
              break;
            }
            default:
              // text-start/end, tool-*, source, file, start/finish, error, abort —
              // обрабатываются колбэками SDK или ниже по finishReason.
              break;
          }
        }
        // Поток мог закончиться без finish-step (ошибка, обрыв) — дочистить,
        // чтобы удержанный хвост не пропал.
        finishStep(false);
        const filterRest = nameFilter.flush();
        if (filterRest) {
          partialText += filterRest;
          callbacks.onText(filterRest);
        }

        const finishReason = await result.finishReason;
        if (signal?.aborted) {
          await finishAbort();
          return;
        }
        logRunSummary(
          Date.now() - runStartedAt,
          stepNo,
          firstStepMs,
          toolStats,
          await result.totalUsage,
          finishReason,
          hiddenChars,
        );

        // A stream timeout does NOT throw — the stream just ends with
        // finish: "other". Anything but a clean "stop" is an interrupted answer
        // and must look like one, not like a finished report cut mid-sentence.
        if (finishReason !== "stop") {
          // Ошибка провайдера посреди прогона (429 на шаге 2) тоже приходит
          // сюда, а не в catch: SDK кладёт её в onError и тихо закрывает поток.
          const streamVerdict =
            lastStreamError !== undefined
              ? classifyProviderError(lastStreamError)
              : null;
          if (streamVerdict?.retryable && isEarlyRun() && attempt < maxRetries) {
            await waitBeforeRetry(streamVerdict, attempt);
            if (signal?.aborted) {
              await finishAbort();
              return;
            }
            continue;
          }
          if (streamVerdict) {
            console.log(
              `[AI_RETRY_SKIP] ${streamVerdict.reason} · ` +
                (streamVerdict.retryable ? "retryable" : "не retryable") +
                ` · шаг ${stepNo}, показано ${partialText.length} символов,` +
                ` попытка ${attempt + 1} из ${maxRetries + 1}`,
            );
          }
          const silenceMs = Date.now() - lastActivityAt;
          console.log(
            `[AI_INCOMPLETE] finish: ${finishReason} → оформлен как обрыв` +
              ` (тишина ${sec(silenceMs)}s)` +
              (streamVerdict ? ` · причина: ${streamVerdict.reason}` : ""),
          );
          // Известная ошибка провайдера (429 на шаге 2 и т.п.) должна звучать
          // как она сама, а не как «таймаут»; повтора не было — скажем почему.
          const message = streamVerdict
            ? formatAIError(lastStreamError) +
              (streamVerdict.retryable
                ? ` Ответ прерван после ${stepNo} шаг(ов); автоповтор не выполнен,` +
                  ` так как часть ответа уже показана. Повторите запрос.`
                : "")
            : finishMessage(finishReason, silenceMs, chunkMs, maxSteps);
          callbacks.onError(new Error(message), {
            text: partialText,
            toolNames: allToolCalls.map((t) => t.name),
            steps: stepNo,
          });
          return;
        }

        const foreign = findForeignFragments(partialText);
        if (foreign.length > 0 && !signal?.aborted) {
          const fixed = await repairLanguage(partialText, foreign);
          if (fixed && !signal?.aborted) {
            partialText = fixed;
            callbacks.onReplace?.(fixed);
          }
        }
        callbacks.onDone(partialText, allToolCalls);
        return;
      } catch (error) {
        // Отмена клиента: при 0 шагов finishReason отклоняется нашим reason,
        // а отменённое ожидание в очереди/паузе бросает сюда же. Никаких
        // повторов и никакого onError — клиент уже сам показал отмену.
        if (signal?.aborted) {
          await finishAbort();
          return;
        }
        const realError = pickRealError(error, lastStreamError);

        // Retryable-ошибки провайдера (лимит запросов, занятый слот шлюза,
        // перегрузка, сетевой обрыв) — повтор с настоящей паузой, пока прогон
        // «ранний» (см. isEarlyRun): повтор начинает ответ заново.
        const verdict = classifyProviderError(realError);
        if (verdict.retryable && isEarlyRun() && attempt < maxRetries) {
          await waitBeforeRetry(verdict, attempt);
          if (signal?.aborted) {
            await finishAbort();
            return;
          }
          continue;
        }

        const elapsed = Date.now() - runStartedAt;
        // inFlightStep > stepNo means that step started and never finished — that
        // is the one that hung, and the log below is the only place it is named.
        const hung =
          inFlightStep > stepNo
            ? ` · шаг #${inFlightStep} висел ${sec(Date.now() - inFlightStartedAt)}s` +
              ` (вход ~${kb(inFlightInputBytes)} КБ)`
            : "";
        console.error(
          `[AI_CHAT_ERROR] ${sec(elapsed)}s, ${stepNo} шаг(ов)` +
            ` · инструменты ${sec(toolStats.totalMs)}s (${formatToolCalls(toolStats)})` +
            ` · модель ~${sec(Math.max(0, elapsed - toolStats.totalMs))}s` +
            hung,
          realError,
        );
        callbacks.onError(new Error(formatAIError(realError)), {
          text: partialText,
          toolNames: allToolCalls.map((t) => t.name),
          steps: stepNo,
        });
        return;
      }
    }
  } finally {
    signal?.removeEventListener("abort", releaseOnAbort);
    if (warnTimer) clearTimeout(warnTimer);
    ticket.release();
  }
}

/**
 * Пауза, которую можно прервать отменой клиента. Резолвится (не отклоняется)
 * по abort — вызывающий сразу проверяет signal.aborted.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The error worth reporting: streaming surfaces the underlying failure only
 * via the onError callback, while iteration throws a generic
 * NoOutputGeneratedError wrapper.
 */
function pickRealError(caught: unknown, streamError: unknown): unknown {
  const msg = caught instanceof Error ? caught.message : String(caught);
  if (streamError !== undefined && msg.includes("No output generated")) {
    return streamError;
  }
  return caught;
}

export interface ProviderErrorVerdict {
  retryable: boolean;
  /** Короткая причина для лога и баннера, например «429, лимит запросов». */
  reason: string;
  /** Пауза, которую просит провайдер (заголовок Retry-After), если есть. */
  retryAfterMs?: number;
}

/**
 * Что делать с ошибкой провайдера: ждать и повторять или отдать пользователю.
 * Порядок проверок важен: месячный лимит и ошибки авторизации могут нести те
 * же коды (4xx/429), но повторять их бессмысленно.
 */
export function classifyProviderError(error: unknown): ProviderErrorVerdict {
  const e = (error ?? {}) as {
    statusCode?: unknown;
    responseBody?: unknown;
    responseHeaders?: unknown;
  };
  const msg = errorTextOf(error);
  const body = typeof e.responseBody === "string" ? e.responseBody : "";
  const text = `${msg}\n${body}`.toLowerCase();
  const status = typeof e.statusCode === "number" ? e.statusCode : undefined;
  const retryAfterMs = parseRetryAfter(e.responseHeaders);

  if (text.includes("usage limit")) {
    return { retryable: false, reason: "лимит использования API" };
  }
  if (
    status === 401 ||
    status === 403 ||
    text.includes("authentication") ||
    text.includes("api_key") ||
    text.includes("api key")
  ) {
    return { retryable: false, reason: "аутентификация" };
  }
  if (text.includes("too many concurrent requests")) {
    return { retryable: true, reason: "429, занят слот шлюза", retryAfterMs };
  }
  if (
    status === 429 ||
    text.includes("429") ||
    text.includes("rate_limit") ||
    text.includes("rate limit") ||
    text.includes("tokens per minute")
  ) {
    return { retryable: true, reason: "429, лимит запросов", retryAfterMs };
  }
  if (
    status === 529 ||
    status === 503 ||
    status === 502 ||
    text.includes("overloaded") ||
    text.includes("529")
  ) {
    return {
      retryable: true,
      reason: `${status ?? 529}, перегрузка провайдера`,
      retryAfterMs,
    };
  }
  if (
    text.includes("econnreset") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("fetch failed") ||
    text.includes("socket hang up")
  ) {
    return { retryable: true, reason: "сетевой обрыв" };
  }
  return {
    retryable: false,
    reason: status != null ? `HTTP ${status}` : "ошибка провайдера",
  };
}

/**
 * Текст ошибки провайдера. Через onError стрима SDK отдаёт не только Error,
 * но и «голый» объект из тела SSE ({ message, type }) или { error: {...} } —
 * String(obj) дал бы «[object Object]», и классификатор ослеп бы.
 */
function errorTextOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const o = error as { message?: unknown; error?: { message?: unknown } };
    if (typeof o.message === "string") return o.message;
    if (o.error && typeof o.error.message === "string") return o.error.message;
    try {
      return JSON.stringify(error);
    } catch {
      /* циклический объект */
    }
  }
  return String(error);
}

/** Retry-After: секунды или HTTP-дата → миллисекунды ожидания. */
function parseRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as Record<string, unknown>;
  const raw = h["retry-after"] ?? h["Retry-After"];
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/** Как определилась граница «черновик / ответ» — для строки [AI_REASONING]. */
const BOUNDARY_LABEL: Record<ReasoningBoundary, string> = {
  marker: "маркер",
  close_tag: "закрывающий тег",
  tool_calls: "инструменты (отброшено)",
  revealed: "не найдена (раскрыто)",
  none: "—",
};

/** ms → seconds with one decimal, for log readability. */
function sec(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Bytes of tool output are what the context budget guards — show them. */
function formatToolCalls(stats: ToolRunStats): string {
  return (
    `${stats.calls} вызов(ов), ${stats.cached} из кэша, ` +
    `${(stats.bytesOut / 1024).toFixed(1)} КБ`
  );
}

/** bytes → KB with one decimal. */
function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

function tok(n: number | undefined): string {
  return n === undefined ? "н/д" : String(n);
}

/**
 * One-line summary of a finished chat turn: where the wall-clock went
 * (model vs tools), token usage and why generation stopped.
 * Providers behind OpenAI-compatible gateways may omit usage — hence "н/д".
 */
function logRunSummary(
  elapsedMs: number,
  steps: number,
  firstStepMs: number,
  toolStats: ToolRunStats,
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }
    | undefined,
  finishReason: string,
  hiddenChars: number,
): void {
  const modelMs = Math.max(0, elapsedMs - toolStats.totalMs);
  console.log(
    `[AI_DONE] ${steps} шаг(ов) · ${sec(elapsedMs)}s ` +
      `(модель ${sec(modelMs)}s / инструменты ${sec(toolStats.totalMs)}s, ${formatToolCalls(toolStats)})` +
      ` · токены ${tok(usage?.inputTokens)} in + ${tok(usage?.outputTokens)} out` +
      ` (reasoning ${tok(usage?.reasoningTokens)}, cached ${tok(usage?.cachedInputTokens)})` +
      ` · finish: ${finishReason}` +
      (hiddenChars > 0 ? ` · рассуждений скрыто ${hiddenChars} симв.` : ""),
  );

  // A first step that dwarfs everything else is provider-side latency
  // (cold start of the node, system-prompt + tool-schema ingestion),
  // not something to look for in application code.
  if (firstStepMs > 30_000 && firstStepMs > elapsedMs * 0.5) {
    const pct = Math.round((firstStepMs / elapsedMs) * 100);
    console.log(
      `[AI_SLOW_START] шаг #1 занял ${sec(firstStepMs)}s (${pct}% от общего)` +
        ` — задержка на стороне провайдера (холодный старт узла / обработка` +
        ` системного промпта), не в коде приложения`,
    );
  }
}

/** Human-readable reason for a stream that ended without a clean "stop". */
function finishMessage(
  reason: string,
  silenceMs: number,
  chunkMs: number,
  maxSteps: number,
): string {
  switch (reason) {
    case "other":
    case "unknown":
      // A stall (silence ≈ chunk timeout) is the provider dropping the
      // stream — raising the budget would not help; say so.
      if (silenceMs >= chunkMs - 5_000) {
        return (
          `Поток данных от провайдера прервался (тишина ${Math.round(silenceMs / 1000)} с) — ` +
          "обрыв на стороне шлюза. Повторите запрос."
        );
      }
      return "Генерация оборвана по таймауту. Увеличьте таймаут в Настройки → LLM или сузьте запрос.";
    case "length":
      return "Достигнут лимит токенов ответа (maxOutputTokens) — увеличьте его в Настройки → LLM.";
    case "tool-calls":
      return `Достигнут предел шагов анализа (${maxSteps}). Сузьте запрос или разбейте его на части.`;
    case "error":
      return "Провайдер прервал генерацию.";
    default:
      return `Генерация не завершена (finish: ${reason}).`;
  }
}

export function formatAIError(error: unknown): string {
  // Очередь на слот провайдера — текст уже человеческий.
  if (error instanceof QueueTimeoutError) return error.message;

  const raw = errorTextOf(error);
  const body = (error as Record<string, unknown>)?.responseBody as
    | string
    | undefined;
  // Провайдер может вернуть код без слова в тексте («Invalid API key
  // provided» при 401) — поэтому смотрим и на statusCode, и на тело ответа.
  const statusRaw = (error as Record<string, unknown>)?.statusCode;
  const status = typeof statusRaw === "number" ? statusRaw : undefined;
  const lower = `${raw}\n${body ?? ""}`.toLowerCase();

  // API rate/usage limit
  if (raw.includes("usage limit") || body?.includes("usage limit")) {
    const dateMatch = (body ?? raw).match(/access on (\d{4}-\d{2}-\d{2})/);
    const until = dateMatch ? ` до ${dateMatch[1]}` : "";
    return `Достигнут лимит API${until}. Попробуйте позже или смените AI-провайдер (AI_PROVIDER в .env).`;
  }

  // Authentication
  if (
    status === 401 ||
    status === 403 ||
    raw.includes("401") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("api_key") ||
    lower.includes("api key")
  ) {
    return "Ошибка аутентификации API. Проверьте API-ключ в настройках подключения (Настройки → LLM) или в .env.";
  }

  // Gateway concurrent-slot limit: an aborted request still holds its slot
  // for a while — waiting is the fix, not a smaller request.
  if (raw.includes("too many concurrent requests")) {
    return (
      "Провайдер ограничил число одновременных запросов: прерванный запрос " +
      "ещё завершается на его стороне. Подождите 1–2 минуты и повторите."
    );
  }

  // Rate limiting (429) — including per-minute token limits
  if (
    status === 429 ||
    raw.includes("429") ||
    raw.includes("rate_limit") ||
    raw.includes("rate limit") ||
    raw.includes("tokens per minute")
  ) {
    return "Слишком много запросов. Подождите минуту и попробуйте снова.";
  }

  // Model overloaded
  if (
    status === 529 ||
    status === 503 ||
    status === 502 ||
    lower.includes("overloaded") ||
    raw.includes("529")
  ) {
    return "AI-сервис временно перегружен. Попробуйте через несколько минут.";
  }

  // Network/connection errors
  if (
    raw.includes("ECONNREFUSED") ||
    raw.includes("ETIMEDOUT") ||
    raw.includes("fetch failed")
  ) {
    return "Не удалось подключиться к AI-сервису. Проверьте сетевое соединение.";
  }

  // SDK wrapper when a stream produced nothing and the real error was not
  // captured — the least-informative case, keep a readable text anyway.
  if (raw.includes("No output generated")) {
    return "Модель не вернула данных — поток завершился ошибкой на стороне провайдера. Повторите запрос.";
  }

  // Generic fallback — truncate long messages
  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
}
