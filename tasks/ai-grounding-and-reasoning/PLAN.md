# PLAN: заземление ответов AI-чата и скрытие рассуждений

Дата: 2026-09-10

## Шаги

1. **`src/lib/ai/tool-executor.ts` — `getEmployeeEconomics(scenarioId, { departmentId?, sortBy = "cost", limit = 30, offset = 0 })`**
   - Выборка `employee` по сценарию (и подразделению), `include: department{name}, contracts{fte, periodStart, periodEnd, revenueStatus, contract{type, status}}`.
   - Год отчёта: текущий календарный (`periodStart = 1 янв`, `periodEnd = 31 дек`); `hoursYear = getWorkingHours(periodStart, periodEnd)` из `work-calendar.ts`.
   - На сотрудника: `annualCostRub = costRate × fte × hoursYear` (null, если ставки нет, флаг `noCostRate: true`); `coveragePct = min(100, Σ(привязка.fte × доля пересечения периода с годом) / fte × 100)` только по договорам типа REVENUE; `contractsCount`; `revenueStatuses` (счётчик PROVIDED/PLANNED/NOT_PROVIDED).
   - Сортировка: `cost` (по убыванию `annualCostRub`), `coverage` (по возрастанию `coveragePct`, затем по стоимости), `costUncovered` (стоимость × (1 − coverage)) — это и есть «убыточность» по данным.
   - Ответ: `{ period, hoursYear, total, offset, shown, nextOffset?, _units: {...}, summary: { withoutCostRate, withoutContracts, totalAnnualCostRub }, employees: [{ id, name, position, category, department, fte, costRateRubHour, annualCostRub, coveragePct, contractsCount, flags }] }`. Имена — `fullName` без изменений.
   - Ветка в диспетчере `executeTool`.
2. **`src/lib/ai/tools.ts`** — определение `get_employee_economics` (описание: «Стоимость в год и покрытие договорами по сотрудникам; имена как в базе; сортировка cost/coverage/costUncovered; постранично»), `inputSchema` с `departmentId?, sortBy?, limit?, offset?`; добавить в `READ_ONLY_TOOLS`. **`src/lib/ai/tool-labels.ts`** — метка «Экономика по сотрудникам».
3. **`src/lib/ai/tool-executor.ts` — `getUnitEconomics`**: стоимость с `hoursYear` (`costRate × fte × hoursYear`), поля `annualCostPerFteRub`, `annualRevenuePerFteRub`, `contractCoveragePct` (вместо `utilization`/`ppUtilization`), блок `_units`. Описание инструмента в `tools.ts:570-572` обновить («покрытие договорами», «₽/год»).
4. **`src/lib/ai/system-prompt.ts` — `buildTechnicalPrompt`**:
   - Стиль, п. 2: «…НЕ выводи сомнения, но отсутствие данных называй явно одной фразой».
   - Новый раздел «Данные и их отсутствие (ОБЯЗАТЕЛЬНО)»: (а) любое число в ответе — из результата инструмента этого диалога; (б) нет нужного разреза — скажи «в данных нет X» и предложи доступный (например, стоимость по подразделениям); (в) имена людей и подразделений — ровно как в данных, включая обезличенные «сотрудник12»; ФИО не придумывать и не «восстанавливать»; (г) агрегаты подразделения не приписывать отдельным людям; (д) рассуждай кратко и на русском языке.
   - Порядок работы: п. 4 «Стоимость и покрытие договорами по сотрудникам — get_employee_economics (постранично, не более одного вызова за шаг); по подразделениям — get_unit_economics».
5. **`src/components/ai-chat/ChatMessage.tsx`** — `splitThinking(text): { reasoning: string[]; answer: string }`: выделяет все пары `<think>…</think>`; незакрытый `<think>` остаётся в `answer` (как сейчас → `replaceThinkTags`). Рендер: если `reasoning.length > 0` — `<details className="chat-reasoning">` с `<summary>💭 Ход рассуждений</summary>` и markdown внутри, закрыт по умолчанию, затем `answer`. Стили в `globals.css` рядом с `.chat-prose`. Старые диалоги в БД открываются так же (преобразование на уровне отображения).
6. **Тесты**: `scripts/ai-retry-check/employee-economics.test.ts` (tsx, БД): создать временный сценарий с 3 сотрудниками (ставки 1000/2000/null ₽/ч, FTE 1/0.5/1) и договорами (привязки 1.0 на весь год; 0.5 на полгода; нет) → проверить `annualCostRub`, `coveragePct`, сортировки, `_units`, имена verbatim, пагинацию `limit=2`; удалить сценарий. `scripts/ai-retry-check/think-split.test.ts` (tsx, без БД): 5 кейсов разбиения.
7. **`harness/PROJECT.md`** — 34 инструмента, новый инструмент, единицы `get_unit_economics`, раздел промпта, сворачивание рассуждений. **`docs/LIMITATIONS.md`** — строка: «покрытие договорами ≠ фактическая загрузка; сворачивание рассуждений работает только при закрывающем `</think>`».
8. `npx tsc --noEmit`, `eslint` по изменённым файлам, `next build`, оба новых теста и регресс `retry-test.ts` + `queue-unit.ts`.
9. `tasks/ai-grounding-and-reasoning/{BRIEF,PLAN,REPORT}.md`; черновики для `DECISIONS.md` (покрытие вместо утилизации; правила заземления в технической половине) и `LESSONS.md` (поле без единиц породило «млн ₽/год»; запрет без альтернативы не работает).

Порядок: 1 → 2 → 3 (проверяемы тестом 6 на БД) → 4 → 5 (тест 6b) → 7 → 8 → 9.

## Альтернативы

- **Только ужесточить промпт, инструмент не делать**: отвергнута, потому что вопрос заказчика («убыточные сотрудники») останется без ответа по данным, а модель под давлением «дай цифры» снова их придумает; данные для честного ответа в базе есть.
- **Серверный сторож на выдуманные ФИО**: отвергнута заказчиком («без дополнительных защит»); остаётся в бэклоге как дешёвая страховка.
- **Скрывать рассуждения до первого markdown-заголовка при отсутствии `</think>`**: отвергнута сейчас, потому что граница угадывается, а прошлый откат случился именно из-за потери ответа; решение отложено до живого прогона с DeepSeek.
- **Считать «утилизацию» по сотруднику как долю часов в timesheet**: отвергнута, потому что таких данных в системе нет (появятся с блоком D10 плана реализации).

## Риски

- 🟡 DeepSeek через Gonka не присылает `</think>` → следим: проверка на стенде первым делом; без закрывающего тега сворачивание не активируется по построению, ответ не теряется.
- 🟡 Модель продолжит выдумывать несмотря на правила → следим: по чипам вызовов в чате видно, вызван ли `get_employee_economics`; если нет — вернуться к вариантам D/E из обсуждения.
- 🟡 Большая организация: 2000 сотрудников × ~200 Б = 400 КБ → пагинация `limit ≤ 50` по умолчанию 30 и `capToolResult`; в описании инструмента — «не более одного вызова за шаг».
- 🟢 Переименование полей `get_unit_economics` меняет только JSON для модели; UI `/finance` считает через `finance/analytics`.
- 🟢 Методическая половина промпта может быть переопределена в БД у заказчика; правила заземления добавляются в техническую, которая применяется всегда.

## Бюджет
- Файлов: 6 кода (tool-executor, tools, tool-labels, system-prompt, ChatMessage, globals.css) + 2 теста + 3 документа / Время: 1 день разработки, 1 день проверки заказчиком.

## Верификация
1. `npx tsx scripts/ai-retry-check/employee-economics.test.ts` и `think-split.test.ts` — все проверки зелёные.
2. `npx tsc --noEmit` (база 14 чужих ошибок), `eslint`, `next build`, регресс `retry-test.ts` (45) и `queue-unit.ts` (14).
3. Стенд заказчика: «!ai самые убыточные сотрудники» → чип «Экономика по сотрудникам», имена как в базе, суммы совпадают с результатом инструмента; «!ai стоимость Анисимова А.С.» → ответ «в данных такого сотрудника нет»; рассуждения свёрнуты (или зафиксировать в REPORT, что `</think>` не приходит).

## Чек-лист выхода
- [x] шаги конкретны (сделан/не сделан)
- [x] есть отвергнутая альтернатива с содержательной причиной
- [x] красных рисков нет
- [x] бюджет назначен
