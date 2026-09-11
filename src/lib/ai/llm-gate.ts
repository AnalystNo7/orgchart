/**
 * Решение «идёт ли сообщение во внешнюю модель».
 *
 * Внешняя модель тратит токены, поэтому по умолчанию работает локальный поиск
 * (бенчмарки, отклонения, база знаний), а модель — по осознанному сигналу:
 * тумблер «AI» в чате (флаг `useLlm` в запросе) или, для привычных, префикс
 * `!ai` в тексте. Чистая функция — проверяется скриптом без сервера.
 */
export const AI_PREFIX = "!ai";

/** «!ai» в начале строки, за ним пробел или конец текста; регистр не важен. */
const PREFIX_RE = /^\s*!ai(?:\s+|$)/i;

export interface LlmRequestDecision {
  /** Отправлять во внешнюю модель. */
  useLlm: boolean;
  /** Текст без служебного префикса. */
  content: string;
}

export function resolveLlmRequest(params: {
  content: string;
  useLlm?: boolean;
}): LlmRequestDecision {
  const m = PREFIX_RE.exec(params.content);
  if (m) return { useLlm: true, content: params.content.slice(m[0].length) };
  return { useLlm: params.useLlm === true, content: params.content };
}
