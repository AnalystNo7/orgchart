/* Юнит-проверка решения «в модель или локально» (без БД).
 * Запуск: npx tsx scripts/ai-retry-check/llm-gate.test.ts */
import { resolveLlmRequest } from "@/lib/ai/llm-gate";
let failed = 0;
const check = (n: string, c: boolean, i = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`); if (!c) failed++; };
let r = resolveLlmRequest({ content: "сколько стоит отдел", useLlm: true });
check("флаг без префикса → модель, текст не тронут", r.useLlm && r.content === "сколько стоит отдел");
r = resolveLlmRequest({ content: "!ai сколько стоит отдел" });
check("префикс без флага → модель, префикс срезан", r.useLlm && r.content === "сколько стоит отдел", JSON.stringify(r.content));
r = resolveLlmRequest({ content: "!ai сколько", useLlm: true });
check("оба → модель, срез один раз", r.useLlm && r.content === "сколько");
r = resolveLlmRequest({ content: "бенчмарки для IT" });
check("ни флага, ни префикса → локально", !r.useLlm && r.content === "бенчмарки для IT");
r = resolveLlmRequest({ content: "!AI Привет" });
check("префикс в другом регистре", r.useLlm && r.content === "Привет");
r = resolveLlmRequest({ content: "  !ai   с отступами" });
check("пробелы вокруг префикса", r.useLlm && r.content === "с отступами", JSON.stringify(r.content));
r = resolveLlmRequest({ content: "!aiпривет" });
check("«!ai» без пробела — не префикс", !r.useLlm && r.content === "!aiпривет");
r = resolveLlmRequest({ content: "скажи !ai в середине" });
check("«!ai» в середине — не префикс", !r.useLlm);
r = resolveLlmRequest({ content: "!ai" });
check("голый «!ai» → модель с пустым текстом", r.useLlm && r.content === "");
console.log(`=== llm-gate: ${failed === 0 ? "все проверки пройдены" : failed + " провалено"} ===`);
process.exit(failed ? 1 : 0);
