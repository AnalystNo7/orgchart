/**
 * Потоковый фильтр рассуждений модели.
 *
 * Reasoning-модели через OpenAI-совместимые шлюзы кладут ход рассуждений
 * прямо в текст ответа, открывая `<think>`. Закрывающий `</think>` приходит
 * не всегда (Gonka/MiniMax его не присылает), поэтому граница «черновик /
 * ответ» определяется тремя способами по убыванию надёжности:
 *
 *   1. строка-маркер `### Ответ` (её требует системный промпт) — boundary "marker";
 *   2. закрывающий тег `</think>` — boundary "close_tag";
 *   3. структура tool-цикла: текст шага, который закончился вызовом
 *      инструментов, — это планирование, показывать его незачем — "tool_calls".
 *
 * Если ни одного признака не нашлось на ФИНАЛЬНОМ шаге, накопленный черновик
 * отдаётся пользователю целиком (boundary "revealed"): показать лишнее лучше,
 * чем потерять ответ — ровно на этом провалилась прошлая версия фильтра
 * (см. tasks/think-and-typography, откат 084980d).
 *
 * Теги и маркер могут прийти разрезанными границей дельт («<thi» + «nk>»,
 * «### От» + «вет\n»), поэтому фильтр удерживает хвост, который ещё может
 * дорасти до тега или строки-маркера, и отдаёт его, как только становится
 * ясно, что это обычный текст. По образцу createToolNameFilter
 * (tool-labels.ts): чистая функция без внешнего состояния — проверяется
 * скриптом без обращения к LLM.
 */
import { AI_ANSWER_MARKER } from "./limits";

/** Как определилась граница «черновик / ответ» на шаге. */
export type ReasoningBoundary =
  | "marker"
  | "close_tag"
  | "tool_calls"
  | "revealed"
  | "none";

export interface ThinkFilterChunk {
  /** Текст для пользователя. */
  text: string;
  /** Сколько символов ушло в черновик на этой дельте. */
  hidden: number;
}

export interface ThinkFilterStepEnd {
  /** Хвост, который надо дослать пользователю (в т.ч. раскрытый черновик). */
  text: string;
  /** Скрыто символов за шаг. */
  hidden: number;
  boundary: ReasoningBoundary;
}

const OPEN_TAG = /<think(?:ing)?>/i;
const CLOSE_TAG = /<\/think(?:ing)?>/i;
const OPEN_LONGEST = "<thinking>";
const CLOSE_LONGEST = "</thinking>";

/** Хвост после последнего `<`, если он ещё может дорасти до тега `full`. */
function heldTagPrefix(buf: string, full: string): string {
  const lt = buf.lastIndexOf("<");
  if (lt === -1) return "";
  const candidate = buf.slice(lt);
  if (candidate.length >= full.length) return "";
  return full.startsWith(candidate.toLowerCase()) ? candidate : "";
}

/** Слово маркера без решёток: «### Ответ» → «Ответ». */
function markerWord(marker: string): string {
  return marker.replace(/^[#\s]+/, "").trim();
}

/**
 * Маркер как ЦЕЛАЯ строка. Требуем перевод строки в конце: иначе «### Ответ»
 * в хвосте буфера сработал бы раньше, чем станет ясно, что там «### Ответы…».
 */
function markerRegex(marker: string): RegExp {
  const esc = markerWord(marker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t]*#{1,6}[ \\t]*${esc}[ \\t]*\\r?\\n`, "im");
}

/** Может ли хвост строки ещё дорасти до маркера. */
function couldBecomeMarker(candidate: string, word: string): boolean {
  const m = /^[ \t]*#{0,6}[ \t]*([\s\S]*)$/.exec(candidate);
  if (!m) return false;
  const typed = m[1];
  if (typed.length > word.length) return false;
  return word.toLowerCase().startsWith(typed.toLowerCase());
}

/** Хвост последней (незавершённой) строки, если она ещё может стать маркером. */
function heldMarkerPrefix(buf: string, word: string): string {
  const candidate = buf.slice(buf.lastIndexOf("\n") + 1);
  if (candidate.length > word.length + 8) return "";
  return couldBecomeMarker(candidate, word) ? candidate : "";
}

/** Оба удержания — суффиксы буфера, поэтому длинное поглощает короткое. */
function longest(a: string, b: string): string {
  return a.length >= b.length ? a : b;
}

export function createThinkFilter(marker: string = AI_ANSWER_MARKER): {
  push: (delta: string) => ThinkFilterChunk;
  /** Рассуждения, пришедшие отдельным потоком провайдера (reasoning-delta). */
  hide: (delta: string) => ThinkFilterChunk;
  endStep: (opts: { toolCalls: boolean }) => ThinkFilterStepEnd;
} {
  const word = markerWord(marker);
  const MARKER = markerRegex(marker);

  let inside = false;
  let tail = "";
  /** Черновик текущего шага: ещё может быть раскрыт страховкой. */
  let pending = "";
  /** Уже окончательно скрытые символы шага. */
  let sealed = 0;
  let boundary: ReasoningBoundary = "none";
  let trimLeading = false;

  const visible = (chunk: string): string => {
    if (trimLeading) {
      const trimmed = chunk.replace(/^\s+/, "");
      if (trimmed) trimLeading = false;
      return trimmed;
    }
    return chunk;
  };

  const seal = (next: ReasoningBoundary) => {
    sealed += pending.length;
    pending = "";
    inside = false;
    boundary = next;
    trimLeading = true;
  };

  return {
    push(delta: string): ThinkFilterChunk {
      const before = sealed + pending.length;
      let text = "";
      let buf = tail + delta;
      tail = "";

      for (;;) {
        if (inside) {
          const close = CLOSE_TAG.exec(buf);
          const mark = MARKER.exec(buf);
          const closeAt = close ? close.index : Infinity;
          const markAt = mark ? mark.index : Infinity;

          if (close && closeAt <= markAt) {
            pending += buf.slice(0, closeAt);
            buf = buf.slice(closeAt + close[0].length);
            seal("close_tag");
            continue;
          }
          if (mark) {
            pending += buf.slice(0, markAt);
            buf = buf.slice(markAt + mark[0].length);
            seal("marker");
            continue;
          }
          const held = longest(
            heldTagPrefix(buf, CLOSE_LONGEST),
            heldMarkerPrefix(buf, word),
          );
          pending += held ? buf.slice(0, buf.length - held.length) : buf;
          tail = held;
          break;
        }

        const open = OPEN_TAG.exec(buf);
        const mark = MARKER.exec(buf);
        const openAt = open ? open.index : Infinity;
        const markAt = mark ? mark.index : Infinity;

        if (open && openAt <= markAt) {
          text += visible(buf.slice(0, openAt));
          buf = buf.slice(openAt + open[0].length);
          inside = true;
          continue;
        }
        if (mark) {
          // Маркер без блока рассуждений: убираем саму строку. Текст до неё
          // остаётся видимым — вне блока он уже ушёл пользователю дельтами,
          // и прятать его задним числом было бы непоследовательно.
          text += visible(buf.slice(0, markAt));
          buf = buf.slice(markAt + mark[0].length);
          if (boundary === "none") boundary = "marker";
          trimLeading = true;
          continue;
        }
        const held = longest(
          heldTagPrefix(buf, OPEN_LONGEST),
          heldMarkerPrefix(buf, word),
        );
        text += visible(held ? buf.slice(0, buf.length - held.length) : buf);
        tail = held;
        break;
      }

      return { text, hidden: sealed + pending.length - before };
    },

    hide(delta: string): ThinkFilterChunk {
      pending += delta;
      return { text: "", hidden: delta.length };
    },

    endStep({ toolCalls }: { toolCalls: boolean }): ThinkFilterStepEnd {
      let text = "";
      if (tail) {
        if (inside) pending += tail;
        else text += visible(tail);
        tail = "";
      }

      let result = boundary;
      let hidden = sealed;
      if (pending) {
        if (toolCalls) {
          // Текст шага, закончившегося вызовом инструментов, — планирование.
          hidden += pending.length;
          result = "tool_calls";
        } else {
          // Границы не нашлось на финальном шаге: показываем всё.
          text += visible(pending);
          result = "revealed";
        }
        pending = "";
      }

      inside = false;
      sealed = 0;
      boundary = "none";
      trimLeading = false;
      return { text, hidden, boundary: result };
    },
  };
}
