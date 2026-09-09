/**
 * Очередь прогонов AI-чата к LLM-провайдеру: не больше `max` одновременно
 * на один процесс приложения.
 *
 * Зачем: шлюз (Gonka) отклоняет запрос, пока прерванный ещё держит слот
 * («too many concurrent requests»). Вместо того чтобы биться о 429 и ждать
 * повторов, второй пользователь ждёт здесь и видит свою позицию.
 *
 * Состояние — синглтон в globalThis: переживает HMR в `next dev`, но живёт
 * только внутри одного процесса (см. docs/LIMITATIONS.md).
 */

export class QueueTimeoutError extends Error {
  constructor(waitedMs: number) {
    super(
      `Очередь к AI-провайдеру: превышено время ожидания (${Math.max(1, Math.round(waitedMs / 1000))} с). Попробуйте позже.`,
    );
    this.name = "QueueTimeoutError";
  }
}

export interface RunSlotTicket {
  /** Сколько ждали в очереди; 0 — слот был свободен сразу. */
  waitedMs: number;
  /** Освободить слот. Повторный вызов безопасен. */
  release(): void;
}

export interface AcquireOptions {
  /** Максимум одновременных прогонов (≥ 1). */
  max: number;
  /** Максимум ожидания в очереди, мс. */
  timeoutMs: number;
  /** Отключение клиента — снимает ожидающего из очереди. */
  signal?: AbortSignal;
  /** Позиция в очереди (с 1) и сколько прогонов должны завершиться раньше. */
  onWait?: (position: number, ahead: number) => void;
}

interface Waiter {
  max: number;
  startedAt: number;
  onWait?: AcquireOptions["onWait"];
  resolve: (ticket: RunSlotTicket) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
}

interface QueueState {
  active: number;
  waiters: Waiter[];
}

const store = globalThis as unknown as { __aiRunQueue?: QueueState };

function state(): QueueState {
  if (!store.__aiRunQueue) store.__aiRunQueue = { active: 0, waiters: [] };
  return store.__aiRunQueue;
}

/** Для логов и проверок: сколько прогонов идёт и сколько ждёт. */
export function getRunQueueSnapshot(): { active: number; waiting: number } {
  const s = state();
  return { active: s.active, waiting: s.waiters.length };
}

export function acquireRunSlot(opts: AcquireOptions): Promise<RunSlotTicket> {
  const s = state();
  const max = Math.max(1, Math.floor(opts.max));
  const startedAt = Date.now();

  if (s.active < max && s.waiters.length === 0) {
    s.active += 1;
    return Promise.resolve(makeTicket(s, 0));
  }

  return new Promise<RunSlotTicket>((resolve, reject) => {
    const waiter: Waiter = {
      max,
      startedAt,
      onWait: opts.onWait,
      resolve,
      reject,
      timer: setTimeout(() => {
        remove(s, waiter);
        reject(new QueueTimeoutError(Date.now() - startedAt));
      }, opts.timeoutMs),
    };

    if (opts.signal) {
      const onAbort = () => {
        remove(s, waiter);
        clearTimeout(waiter.timer);
        reject(new Error("Запрос отменён во время ожидания в очереди."));
      };
      if (opts.signal.aborted) {
        clearTimeout(waiter.timer);
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
      waiter.cleanup = () => opts.signal?.removeEventListener("abort", onAbort);
    }

    s.waiters.push(waiter);
    dispatch(s);
  });
}

function makeTicket(s: QueueState, waitedMs: number): RunSlotTicket {
  let released = false;
  return {
    waitedMs,
    release() {
      if (released) return;
      released = true;
      s.active = Math.max(0, s.active - 1);
      dispatch(s);
    },
  };
}

/** Пускает голову очереди, пока есть свободные слоты, и обновляет позиции. */
function dispatch(s: QueueState): void {
  while (s.waiters.length > 0 && s.active < s.waiters[0].max) {
    const w = s.waiters.shift()!;
    clearTimeout(w.timer);
    w.cleanup?.();
    s.active += 1;
    w.resolve(makeTicket(s, Date.now() - w.startedAt));
  }
  s.waiters.forEach((w, i) => w.onWait?.(i + 1, s.active + i));
}

function remove(s: QueueState, w: Waiter): void {
  const i = s.waiters.indexOf(w);
  if (i < 0) return;
  s.waiters.splice(i, 1);
  w.cleanup?.();
  s.waiters.forEach((x, j) => x.onWait?.(j + 1, s.active + j));
}
