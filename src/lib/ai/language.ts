/**
 * Язык ответа: только русский.
 *
 * Модели, обученные на китайском (MiniMax, DeepSeek), при высокой
 * температуре «переключают» язык посреди фразы: в русской таблице
 * появляется «管理层». Здесь — детектор нецелевых письменностей, служебный
 * напоминатель о языке для последнего хода и промпт починки.
 * Чистые функции — проверяются скриптом без LLM.
 */

/**
 * Письменности, которых в русском ответе быть не может: кана, CJK
 * (основной блок и расширение A), совместимые иероглифы, хангыль, тайский,
 * арабский, иврит, деванагари. Латиница и греческие буквы допустимы
 * (термины, формулы).
 */
const FOREIGN_SCRIPT_SOURCE =
  "[\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\uAC00-\\uD7AF\\u0E00-\\u0E7F\\u0600-\\u06FF\\u0590-\\u05FF\\u0900-\\u097F]+";

/**
 * Свежий экземпляр на каждый вызов: у глобального регэкспа общий lastIndex
 * (test → matchAll копирует позицию), и первое вхождение пропадало.
 */
function foreignScriptRe(): RegExp {
  return new RegExp(FOREIGN_SCRIPT_SOURCE, "gu");
}

/** Уникальные фрагменты на чужих письменностях (для лога и проверки). */
export function findForeignFragments(text: string, limit = 5): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(foreignScriptRe())) {
    seen.add(m[0]);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function hasForeignScript(text: string): boolean {
  return foreignScriptRe().test(text);
}

/**
 * Служебный напоминатель, добавляемый к последнему сообщению пользователя в
 * копии для модели: у открытых моделей последний ход весит больше системного
 * промпта. В чат и в сохранённый диалог не попадает.
 */
export const LANGUAGE_REMINDER =
  "[Служебно: весь текст ответа, включая таблицы и заголовки, только на русском языке; " +
  "латиница допустима лишь для устоявшихся терминов (span of control, overhead, FTE, P&L, KPI) " +
  "и названий; иероглифы и слова других языков недопустимы.]";

/** Промпт одного вызова починки: переписать текст, ничего не меняя по сути. */
export function buildRepairPrompt(text: string): string {
  return (
    "Ниже — текст ответа аналитической системы. В нём встречаются слова или фрагменты " +
    "на других языках (иероглифы и т.п.). Перепиши текст на русском языке, заменив такие " +
    "фрагменты русскими эквивалентами по смыслу. Правила: ничего не добавляй и не убирай, " +
    "не меняй числа, проценты и выводы, сохрани разметку markdown (таблицы, списки, " +
    "заголовки) и устоявшиеся термины на латинице (span of control, overhead, FTE, P&L, KPI). " +
    "Верни только исправленный текст, без пояснений.\n\n---\n\n" +
    text
  );
}

/** Числа в тексте — для проверки, что починка не переписала цифры. */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort();
}

/**
 * Считать починку безопасной: чужих символов нет, текст непустой и набор
 * чисел не разъехался больше чем на 10 % (модель могла «поправить» цифры).
 */
export function isSafeRepair(original: string, repaired: string): boolean {
  const fixed = repaired.trim();
  if (!fixed || hasForeignScript(fixed)) return false;
  const a = extractNumbers(original);
  const b = new Set(extractNumbers(fixed));
  if (a.length === 0) return true;
  const kept = a.filter((n) => b.has(n)).length;
  return kept / a.length >= 0.9;
}
