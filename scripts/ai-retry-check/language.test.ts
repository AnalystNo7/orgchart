/* Юнит-проверка детектора чужих письменностей и безопасности починки (без БД).
 * Запуск: npx tsx scripts/ai-retry-check/language.test.ts */
import { findForeignFragments, hasForeignScript, isSafeRepair, buildRepairPrompt, LANGUAGE_REMINDER } from "@/lib/ai/language";
let failed = 0;
const check = (n: string, c: boolean, i = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`); if (!c) failed++; };

check("русский с терминами и знаками — чисто", !hasForeignScript("Span of control 4.2 — на 29 % ниже оптимума (7); overhead 17 %, ₽X млн, § 3, 5 × 2 … «кавычки»"));
check("иероглифы найдены", hasForeignScript("Избыточное количество管理层 (примерно +30–40)"));
check("фрагменты уникальны и в порядке появления", findForeignFragments("a管理层 b管理层 cの").join("|") === "管理层|の");
check("хангыль и тайский", hasForeignScript("한글") && hasForeignScript("ไทย"));
check("греческие буквы в формуле допустимы", !hasForeignScript("Δ = 3 %, σ = 0.4, μ"));
check("латиница допустима", !hasForeignScript("Revenue per FTE, EBITDA margin"));
check("emoji и символы валют допустимы", !hasForeignScript("🟢 ₽ € $ ✓ →"));

const original = "| Span 4.2 | ниже на 29% (7) | +30–40 руководителей管理层 |";
check("починка безопасна: чисто и числа на месте", isSafeRepair(original, "| Span 4.2 | ниже на 29% (7) | +30–40 руководителей управленческого слоя |"));
check("починка небезопасна: иероглиф остался", !isSafeRepair(original, "| Span 4.2 | 29% | 管理层 |"));
check("починка небезопасна: числа переписаны", !isSafeRepair(original, "| Span 5.1 | ниже на 12% (9) | +10 руководителей |"));
check("починка небезопасна: пустой ответ", !isSafeRepair(original, "   "));
check("текст без чисел — только проверка письменности", isSafeRepair("текст 管理", "текст управление"));
check("промпт починки содержит текст и запрет менять числа", buildRepairPrompt("X管理").includes("X管理") && buildRepairPrompt("x").includes("не меняй числа"));
check("напоминатель служебный и про русский", LANGUAGE_REMINDER.startsWith("[Служебно") && LANGUAGE_REMINDER.includes("русском"));
console.log(`=== language: ${failed === 0 ? "все проверки пройдены" : failed + " провалено"} ===`);
process.exit(failed ? 1 : 0);
