/**
 * Разделить текст ответа модели на рассуждения и сам ответ.
 *
 * Часть шлюзов (Gonka) отдаёт ход рассуждений прямо в тексте, обрамляя его
 * тегами <think>…</think>. Сворачивать можно только то, у чего известна
 * граница: вырезаются лишь ЗАКРЫТЫЕ пары. Незакрытый <think> остаётся в
 * ответе как есть — его дальше превращает в маркер replaceThinkTags, и текст
 * не теряется ни при каком поведении шлюза (урок задачи think-and-typography:
 * прежний серверный фильтр ждал </think> и прятал весь отчёт).
 * Чистая функция без React — используется и в ChatMessage, и в тестах.
 */
export interface ThinkSplit {
  /** Содержимое закрытых блоков рассуждений, по порядку, без тегов. */
  reasoning: string[];
  /** Остальной текст; может содержать незакрытый <think>. */
  answer: string;
}

const CLOSED_PAIR = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;

export function splitThinking(text: string): ThinkSplit {
  const reasoning: string[] = [];
  const answer = text
    .replace(CLOSED_PAIR, (_m, inner: string) => {
      const t = inner.trim();
      if (t) reasoning.push(t);
      return "\n\n";
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
  return { reasoning, answer };
}
