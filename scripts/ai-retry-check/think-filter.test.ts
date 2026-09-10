/* Юнит-проверка потокового фильтра рассуждений (без БД и без LLM).
 * Запуск: npx tsx scripts/ai-retry-check/think-filter.test.ts */
import { createThinkFilter, type ReasoningBoundary } from "@/lib/ai/think-filter";
import { AI_ANSWER_MARKER } from "@/lib/ai/limits";

let failed = 0;
const check = (n: string, c: boolean, i = "") => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`);
  if (!c) failed++;
};

/** Прогнать поток дельт и собрать итог шага. */
function run(deltas: string[], toolCalls = false) {
  const f = createThinkFilter();
  let text = "";
  let hidden = 0;
  for (const d of deltas) {
    const out = f.push(d);
    text += out.text;
    hidden += out.hidden;
  }
  const end = f.endStep({ toolCalls });
  text += end.text;
  return { text, hidden: end.hidden, boundary: end.boundary as ReasoningBoundary, filter: f };
}
/** Разбить строку на дельты по n символов — имитация стрима. */
const chop = (s: string, n: number) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, "g")) ?? [];

console.log(`### маркер: «${AI_ANSWER_MARKER}»`);

let r = run(["<think>Let me check the data first.\n", "### Ответ\n", "Итог: всё хорошо."]);
check("маркер: показан только ответ", r.text === "Итог: всё хорошо.", JSON.stringify(r.text));
check("маркер: граница marker, черновик скрыт", r.boundary === "marker" && r.hidden > 0, `${r.boundary}/${r.hidden}`);

r = run(chop("<think>Draft reasoning here.\n### Ответ\nИтог по данным.", 3));
check("маркер по 3 символа: ответ цел", r.text === "Итог по данным.", JSON.stringify(r.text));
check("маркер по 3 символа: граница marker", r.boundary === "marker");

r = run(["<thi", "nk>Reasoning\n#", "## От", "вет\n", "Готово."]);
check("тег и маркер разрезаны дельтами", r.text === "Готово." && r.boundary === "marker", JSON.stringify(r.text));

r = run(["<think>Мысли</think>\n\nОтвет по существу."]);
check("закрывающий тег: ответ без ведущих переводов", r.text === "Ответ по существу.", JSON.stringify(r.text));
check("закрывающий тег: граница close_tag", r.boundary === "close_tag");

r = run(["<think>План: вызвать инструмент."], true);
check("шаг с инструментами: текст отброшен", r.text === "" && r.boundary === "tool_calls", `${r.boundary}/${JSON.stringify(r.text)}`);
check("шаг с инструментами: скрыто посчитано", r.hidden === "План: вызвать инструмент.".length, String(r.hidden));

r = run(["<think>Черновик без границы."], false);
check("финал без границы: страховка показала всё", r.text === "Черновик без границы." && r.boundary === "revealed", `${r.boundary}/${JSON.stringify(r.text)}`);

r = run(["Обычный ответ без тегов."]);
check("текст без тегов проходит целиком", r.text === "Обычный ответ без тегов." && r.boundary === "none" && r.hidden === 0);

r = run(["Строка с <b>жирным</b> и решёткой # внутри."]);
check("<b> и одиночная # не съедаются", r.text === "Строка с <b>жирным</b> и решёткой # внутри.", JSON.stringify(r.text));

r = run(["<think>x\n", "## Ответ\n", "Через два хеша."]);
check("маркер «## Ответ» распознан", r.text === "Через два хеша." && r.boundary === "marker");

r = run(["<think>x\n", "### ответ\n", "Регистр не важен."]);
check("маркер в нижнем регистре распознан", r.text === "Регистр не важен." && r.boundary === "marker");

r = run(["<think>x\n", "### Ответы на вопросы\n", "Текст."]);
check("«### Ответы…» НЕ считается маркером", r.boundary === "revealed" && r.text.includes("Ответы на вопросы"), r.boundary);

r = run(["<think>x\n### Ответ\n\n\n", "Лишние переводы срезаны."]);
check("ведущие пустые строки после маркера срезаны", r.text === "Лишние переводы срезаны.", JSON.stringify(r.text));

r = run(["### Ответ\n", "Ответ без блока рассуждений."]);
check("маркер без <think>: маркер убран", r.text === "Ответ без блока рассуждений." && r.boundary === "marker", JSON.stringify(r.text));

// Вне блока <think> текст уже ушёл пользователю дельтами: прятать его задним
// числом нельзя, убирается только строка-маркер (см. docs/LIMITATIONS.md).
r = run(["Преамбула модели.\n", "### Ответ\n", "Настоящий ответ."]);
check("вне блока: преамбула видна, маркер убран", r.text === "Преамбула модели.\nНастоящий ответ." && !r.text.includes("Ответ\n#"), JSON.stringify(r.text));

// Два шага подряд одним фильтром: состояние сбрасывается
{
  const f = createThinkFilter();
  f.push("<think>план шага 1");
  const e1 = f.endStep({ toolCalls: true });
  const s2 = f.push("<think>рассуждение\n### Ответ\nИтог шага 2.");
  const e2 = f.endStep({ toolCalls: false });
  check("шаг 1 отброшен, шаг 2 показан", e1.text === "" && (s2.text + e2.text) === "Итог шага 2.", JSON.stringify(s2.text + e2.text));
  check("границы шагов независимы", e1.boundary === "tool_calls" && e2.boundary === "marker", `${e1.boundary}/${e2.boundary}`);
}

// Поток рассуждений отдельным каналом провайдера
{
  const f = createThinkFilter();
  const h = f.hide("provider reasoning");
  const t = f.push("Видимый ответ.");
  const e = f.endStep({ toolCalls: false });
  check("reasoning-delta считается скрытым", h.hidden === "provider reasoning".length && h.text === "");
  check("видимый текст рядом с reasoning-каналом", (t.text + e.text).includes("Видимый ответ."));
}

// Текст до <think> не теряется
r = run(["Начало. <think>черновик\n### Ответ\nКонец."]);
check("текст до <think> сохранён", r.text.startsWith("Начало.") && r.text.endsWith("Конец."), JSON.stringify(r.text));

console.log(`=== think-filter: ${failed === 0 ? "все проверки пройдены" : failed + " провалено"} ===`);
process.exit(failed ? 1 : 0);
