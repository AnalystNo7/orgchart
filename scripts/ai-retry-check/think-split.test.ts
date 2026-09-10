/* Юнит-проверка разбиения ответа на рассуждения и текст (без БД).
 * Запуск: npx tsx scripts/ai-retry-check/think-split.test.ts */
import { splitThinking } from "@/components/ai-chat/think-split";
let failed = 0;
const check = (n: string, c: boolean, i = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`); if (!c) failed++; };

let r = splitThinking("<think>Let me look at the data first.</think>\n\n## Итог\nТаблица.");
check("закрытый блок → 1 рассуждение", r.reasoning.length === 1 && r.reasoning[0] === "Let me look at the data first.");
check("ответ без тегов и без ведущих переводов", r.answer === "## Итог\nТаблица.", JSON.stringify(r.answer));

r = splitThinking("<think>Thinking… and the whole report follows without a closing tag");
check("незакрытый блок → рассуждений нет, текст цел", r.reasoning.length === 0 && r.answer.startsWith("<think>") && r.answer.includes("closing tag"));

r = splitThinking("Ответ идёт, а в хвосте стрима частичный тег <thi");
check("частичный тег в хвосте не трогаем", r.reasoning.length === 0 && r.answer.endsWith("<thi"));

r = splitThinking("<think>шаг 1</think>Часть A<thinking>шаг 2</thinking>Часть B");
check("два блока разных написаний", r.reasoning.length === 2 && r.reasoning[1] === "шаг 2");
check("ответ склеен через пустую строку", r.answer === "Часть A\n\nЧасть B", JSON.stringify(r.answer));

r = splitThinking("<think>   </think>Только ответ");
check("пустой блок игнорируется", r.reasoning.length === 0 && r.answer === "Только ответ");

r = splitThinking("<think>a</think>\n\n\n\nОтвет");
check("лишние переводы строк схлопнуты", r.answer === "Ответ", JSON.stringify(r.answer));

r = splitThinking("Без тегов вообще");
check("текст без тегов не меняется", r.reasoning.length === 0 && r.answer === "Без тегов вообще");
console.log(`=== think-split: ${failed === 0 ? "все проверки пройдены" : failed + " провалено"} ===`);
process.exit(failed ? 1 : 0);
