# Спецификация требований к программному обеспечению (SRS)

## OrgChart Modeler — Система моделирования организационной структуры

---

## 1. Введение

### 1.1 Назначение

OrgChart Modeler — веб-приложение для моделирования организационной структуры компании с поддержкой сценарного планирования, управления договорами, тарифами и расчёта финансовых показателей (P&L).

### 1.2 Область применения

Система предназначена для:
- Визуализации и редактирования организационной структуры (интерактивная диаграмма)
- Сценарного моделирования: создание и сравнение альтернативных вариантов оргструктуры
- Управления справочниками: сотрудники, тарифные ставки, договоры
- Финансового анализа: расчёт доходов и расходов (P&L) по подразделениям с тепловой картой
- Отмены/повтора операций (undo/redo)

### 1.3 Технологический стек

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, ReactFlow, Zustand
- **Backend**: Next.js API Routes, Prisma ORM
- **База данных**: PostgreSQL
- **Аутентификация**: NextAuth.js

---

## 2. Глоссарий

| Термин | Определение |
|---|---|
| **Сценарий** | Вариант организационной структуры. Один сценарий является базовым (baseline), остальные — производные |
| **Подразделение** | Организационная единица с типом (REVENUE, RESOURCE, SERVICE, BACKOFFICE), образует иерархическое дерево |
| **Сотрудник** | Физическое лицо с должностью, категорией (PP/OPP/AUP), ставкой FTE и привязкой к подразделению |
| **Тариф (К-1..К-6)** | Категория почасовой ставки, назначаемая сотруднику для расчёта выручки |
| **Договор** | Доходный (REVENUE) или расходный (EXPENSE) контракт со статусом CONCLUDED или PLANNED |
| **Привязка сотрудник–договор** | Связь many-to-many между сотрудником и договором с FTE-долей и периодом |
| **Ставка себестоимости (costRate)** | Почасовая ставка затрат сотрудника для расчёта расходов |
| **P&L (Profit & Loss)** | Расчёт доходов минус расходов по подразделениям |
| **Статус обеспечения выручки** | PROVIDED (обеспечен), PLANNED (запланирован), NOT_PROVIDED (не обеспечен) |
| **Авторасчёт** | Автоматическое вычисление суммы договора из тарифов, FTE и рабочих часов |
| **Производственный календарь** | Данные о рабочих часах по месяцам (РФ, 2025-2027) |
| **Журнал действий (ActionLog)** | Запись операций пользователя для поддержки undo/redo |
| **ShetilType** | Тип подразделения: REVENUE (зарабатывающее), RESOURCE (ресурсное), SERVICE (сервисное), BACKOFFICE (бэк-офис) |
| **Категория сотрудника** | PP — производственный персонал, OPP — обслуживающий, AUP — административно-управленческий |

---

## 3. Модель данных

### 3.1 Перечисления (Enum)

| Enum | Значения |
|---|---|
| ScenarioStatus | DRAFT, ACTIVE, ARCHIVED |
| ShetilType | REVENUE, RESOURCE, SERVICE, BACKOFFICE |
| EmployeeCategory | PP, OPP, AUP |
| ContractType | REVENUE, EXPENSE |
| ContractStatus | CONCLUDED, PLANNED |
| RevenueProvisionStatus | PROVIDED, PLANNED, NOT_PROVIDED |

### 3.2 Модели

#### User
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| email | String, unique | Email для входа |
| passwordHash | String | Хэш пароля (bcrypt) |
| name | String | Имя пользователя |
| createdAt | DateTime | Дата создания |

#### Scenario
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| name | String | Название сценария |
| description | String? | Описание |
| isBaseline | Boolean | Базовый сценарий (один на систему) |
| status | ScenarioStatus | Статус: DRAFT / ACTIVE / ARCHIVED |
| columnNames | Json? | Пользовательские названия колонок таблицы |
| createdFromId | String? | FK -> Scenario (источник клонирования) |
| departments | Department[] | Подразделения сценария |
| employees | Employee[] | Сотрудники сценария |
| actionLogs | ActionLog[] | Журнал действий |

#### Department
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| scenarioId | String, FK -> Scenario | Сценарий (каскадное удаление) |
| parentId | String?, FK -> Department | Родительское подразделение |
| name | String | Название |
| cfo | String? | Центр финансовой ответственности |
| shetilType | ShetilType | Тип подразделения |
| headId | String?, FK -> Employee | Руководитель |
| sortOrder | Int | Порядок сортировки (по умолчанию 0) |
| originId | String? | ID исходного подразделения при клонировании |

Индексы: `scenarioId`, `parentId`

#### Employee
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| scenarioId | String, FK -> Scenario | Сценарий (каскадное удаление) |
| departmentId | String, FK -> Department | Подразделение (каскадное удаление) |
| fullName | String | ФИО |
| position | String | Должность |
| category | EmployeeCategory | Категория: PP / OPP / AUP |
| fte | Decimal | Ставка FTE (по умолчанию 1.0) |
| costRate | Decimal? | Ставка себестоимости (руб./час) |
| tariffId | String?, FK -> Tariff | Тариф |
| originId | String? | ID исходного сотрудника при клонировании |
| contracts | EmployeeContract[] | Привязки к договорам |

Индексы: `scenarioId`, `departmentId`

#### Tariff
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| name | String, unique | Название (K-1 .. K-6) |
| rate | Decimal | Почасовая ставка (руб./час) |
| description | String? | Описание уровня |
| employees | Employee[] | Сотрудники с этим тарифом |

#### Contract
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| name | String | Название договора |
| type | ContractType | REVENUE или EXPENSE |
| status | ContractStatus | CONCLUDED или PLANNED |
| amount | Decimal? | Фактическая сумма (для CONCLUDED) |
| expectedAmount | Decimal? | Ожидаемая сумма (для PLANNED) |
| amountAutoCalc | Boolean | Авторасчёт суммы (по умолчанию false) |
| periodStart | DateTime | Начало периода действия |
| periodEnd | DateTime | Конец периода действия |
| description | String? | Описание |
| employees | EmployeeContract[] | Привязки сотрудников |

#### EmployeeContract
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| employeeId | String, FK -> Employee | Сотрудник (каскадное удаление) |
| contractId | String, FK -> Contract | Договор (каскадное удаление) |
| revenueStatus | RevenueProvisionStatus | Статус обеспечения выручки |
| fte | Decimal | Доля FTE на этот договор |
| periodStart | DateTime | Начало периода участия |
| periodEnd | DateTime | Конец периода участия |

Уникальное ограничение: `(employeeId, contractId)`. Индексы: `employeeId`, `contractId`

#### PnlCache
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| scenarioId | String | ID сценария |
| departmentId | String | ID подразделения |
| mode | String | "forecast" / "plan" / "combined" |
| periodStart | DateTime | Начало расчётного периода |
| periodEnd | DateTime | Конец расчётного периода |
| revenue | Decimal | Выручка (по умолчанию 0) |
| cost | Decimal | Затраты (по умолчанию 0) |
| pnl | Decimal | P&L (по умолчанию 0) |
| details | Json | Детали: {employees, contracts, childrenPnl, totalPnl} |
| warnings | Json? | Предупреждения |
| calculatedAt | DateTime | Время расчёта |

Уникальное ограничение: `(scenarioId, departmentId, mode, periodStart, periodEnd)`

#### ActionLog
| Поле | Тип | Описание |
|---|---|---|
| id | UUID, PK | Идентификатор |
| scenarioId | String?, FK -> Scenario | Сценарий (каскадное удаление) |
| actionType | String | Тип действия (см. раздел 4.13) |
| payload | Json | Данные для повтора (redo) |
| undoPayload | Json | Данные для отмены (undo) |
| undone | Boolean | Флаг отмены (по умолчанию false) |
| createdAt | DateTime | Время действия |

Индексы: `scenarioId`, `(scenarioId, createdAt)`

### 3.3 ER-диаграмма (связи)

```
User (standalone)

Scenario 1───* Department 1───* Employee
    │              │                │
    │              └─ parent ──┘    ├── * EmployeeContract *──1 Contract
    │                               │
    └──────* ActionLog              └── *──1 Tariff

PnlCache (standalone, ссылается на scenarioId и departmentId без FK)
```

---

## 4. Функциональные требования

### 4.1 Управление сценариями

**Описание**: CRUD-операции над сценариями оргструктуры.

- Создание нового сценария (имя, описание)
- Клонирование существующего сценария: глубокое копирование всех подразделений, сотрудников и связей в транзакции; originId сохраняет связь с исходными записями
- Редактирование имени, описания, статуса
- Удаление сценария (кроме базового)
- Список сценариев с метриками (кол-во подразделений и сотрудников)
- Пользовательские названия колонок (`columnNames`) сохраняются в JSON

### 4.2 Дашборд

**Описание**: Главная страница с двумя режимами отображения.

- **Переключатель вида**: «Оргструктура» и «P&L Тепловая карта»
- Режим «Оргструктура»: интерактивная диаграмма (ReactFlow) с узлами подразделений
- Режим «P&L Тепловая карта»: визуализация P&L с цветовым кодированием (см. 4.11)
- Боковая панель подразделения: детали и метрики выбранного узла

### 4.3 Управление подразделениями

**Описание**: Иерархическое управление оргструктурой.

- Создание подразделения: имя, тип (ShetilType), родитель, ЦФО, руководитель, порядок сортировки
- Редактирование свойств подразделения
- Удаление: три режима — простое (ошибка при наличии дочерних), каскадное (удаление потомков), перенос дочерних (`reparent`)
- Добавление промежуточного родителя (`add_parent`): вставка нового подразделения между узлом и его родителем
- Перемещение (`reparent_department`): смена родительского подразделения
- Получение метрик: количество сотрудников по категориям (PP, OPP, AUP), суммарный FTE
- Все операции логируются в ActionLog

### 4.4 Управление сотрудниками

**Описание**: CRUD и фильтрация сотрудников.

- Создание: ФИО, должность, категория, FTE, costRate, тариф
- Редактирование всех полей
- Удаление: очищает ссылки headId в подразделениях
- Список с пагинацией (page, limit) и фильтрами:
  - По сценарию (обязательно)
  - По подразделению, категории, поисковому запросу
  - По иерархическим уровням (hierarchy_0..hierarchy_3)
  - По ЦФО, корневому подразделению
- Ответ включает: данные, метаданные пагинации, categoryTotals ({pp, opp, aup})
- Получение метаданных фильтров: `/api/employees/filters` возвращает доступные ЦФО и уровни иерархии
- Все операции логируются в ActionLog

### 4.5 Управление тарифами

**Страница**: `/references/tariffs`

- 6 тарифных категорий: K-1 (1500 руб/ч) .. K-6 (6000 руб/ч)
- Таблица с колонками: Название, Ставка (руб/час), Описание
- Inline-редактирование ставки и описания (название не редактируется)
- Пользовательские заголовки колонок (localStorage)
- Экспорт/импорт Excel (xlsx)
- Импорт сопоставляет тарифы по имени и обновляет ставку/описание
- Валидация: ставка >= 0 (Zod-схема `updateTariffSchema`)
- Все изменения логируются в ActionLog

### 4.6 Управление договорами

**Страница**: `/references/contracts`

- CRUD-операции над договорами
- Таблица: Название, Тип (REVENUE/EXPENSE), Статус (CONCLUDED/PLANNED), Сумма, Период, Кол-во сотрудников, Описание
- Форма создания/редактирования (`ContractForm`):
  - name (обязательно)
  - type: REVENUE или EXPENSE
  - status: CONCLUDED или PLANNED
  - amount (для CONCLUDED) / expectedAmount (для PLANNED)
  - amountAutoCalc: при включении сумма рассчитывается автоматически (тариф x FTE x раб. часы)
  - periodStart, periodEnd
  - description (опционально)
- Поиск по названию (debounce 300 мс)
- Экспорт/импорт Excel
- Удаление с подтверждением
- Пользовательские заголовки колонок (localStorage)
- Валидация: `createContractSchema` / `updateContractSchema`
- Все операции логируются в ActionLog

### 4.7 Привязка сотрудник–договор

**Компонент**: `EmployeeContractsModal` (доступен из таблицы сотрудников)

- Таблица привязок: Договор, Статус обеспечения выручки, FTE, Период
- Добавление: выбор из доступных REVENUE-договоров (исключая уже привязанные)
  - Статус выручки назначается автоматически: CONCLUDED -> PROVIDED, PLANNED -> PLANNED
  - FTE: 0.0–1.0, шаг 0.1
  - Период по умолчанию = период договора
- Inline-редактирование всех полей
- Удаление с подтверждением
- Поиск договоров по названию
- Валидация: период привязки не может выходить за период договора
- При создании/изменении/удалении привязки — пересчёт суммы договора (если `amountAutoCalc = true`)
- Все операции логируются в ActionLog

### 4.8 P&L-движок

**Файл**: `src/lib/pnl-calculator.ts`

Расчёт доходов и расходов по подразделениям сценария за период.

**Три режима:**
- `forecast` — только договоры со статусом CONCLUDED
- `plan` — только PLANNED
- `combined` — оба

**Расчёт затрат** (для всех подразделений):
```
Затраты сотрудника = costRate × FTE × рабочие_часы_периода
```
- Сотрудники без costRate генерируют предупреждение и исключаются из расчёта

**Расчёт выручки** (только для подразделений с ShetilType = REVENUE):
- Выручка поступает через цепочку: Employee → EmployeeContract → Contract (type = REVENUE)
- Сумма: `amount` (CONCLUDED) или `expectedAmount` (PLANNED)
- Доля пересечения периодов: `overlapFraction = дни_пересечения / общие_дни_договора`
- Доля FTE подразделения: `fteFraction = FTE_подразделения / общий_FTE_договора`
- Распределённая выручка: `сумма × overlapFraction × fteFraction`

**Агрегация** (bottom-up):
- `childrenPnl` — сумма P&L дочерних подразделений
- `totalPnl` = собственный P&L + childrenPnl

**Кэширование**: результаты сохраняются в PnlCache через `calculateAndCachePnl()`.

### 4.9 Авторасчёт суммы договора

**Файл**: `src/lib/contract-auto-calc.ts`

При `amountAutoCalc = true`:
```
сумма = SUM(тариф.rate × employeeContract.fte × рабочие_часы_периода_договора)
```
- Обновляет `amount` (CONCLUDED) или `expectedAmount` (PLANNED)
- Вызывается при создании/изменении/удалении привязки сотрудник–договор

### 4.10 Производственный календарь

**Файл**: `src/lib/work-calendar.ts`

- Данные о рабочих часах по месяцам для 2025, 2026, 2027 (по производственному календарю РФ)
- `getWorkingHours(startDate, endDate)` — рабочие часы за произвольный период с пропорциональным учётом неполных месяцев (UTC)
- `getMonthlyWorkingHours(year, month)` — часы за конкретный месяц
- Для месяцев вне календаря — значение по умолчанию: 168 часов

### 4.11 P&L-тепловая карта

**Компонент**: `PnlHeatmap` (ReactFlow)

- Дерево подразделений с цветовым кодированием узлов по значению P&L
- Цветовая шкала с настраиваемыми порогами (deepRed, red, yellow, green, deepGreen) — сохраняется в localStorage
- Панель фильтров: выбор периода (начало/конец), режим отображения (plan/forecast/combined), кнопки раскрытия/свёртки
- Содержимое узла: название подразделения, выручка, затраты, P&L
- Взаимодействие: клик — открытие PnlDrillDown, двойной клик — переход к сотрудникам с фильтром по подразделению
- Раскрытие/свёртка: по узлу, раскрыть/свернуть всё, раскрыть до уровня N
- Состояние свёрнутости общее с видом оргструктуры (персистентно по сценарию)
- Автопересчёт при смене режима/периода
- Компонент `PnlLegend` — легенда цветовой шкалы

### 4.12 P&L Drill-Down

**Компонент**: `PnlDrillDown` (боковая панель, 400px)

- Карточки: Выручка, Затраты, P&L (собственный)
- Дочерний P&L и Итоговый P&L
- Секция предупреждений (сотрудники без costRate)
- Таблица затрат по сотрудникам: ФИО, должность, costRate, FTE, рабочие часы, итого затраты
- Таблица выручки по договорам: название, статус, сумма, доля пересечения, доля FTE, распределённая выручка
- Данные загружаются из `/api/pnl/[departmentId]`

### 4.13 Undo/Redo

**Файл**: `src/lib/action-logger.ts`

Система отмены/повтора на основе журнала ActionLog, персистентного в БД.

**Поддерживаемые типы действий:**

| Тип | Описание |
|---|---|
| create_department | Создание подразделения |
| update_department | Обновление подразделения |
| delete_department | Удаление подразделения (простое) |
| delete_department_cascade | Каскадное удаление подразделения |
| delete_department_reparent | Удаление с переносом дочерних |
| add_parent | Добавление промежуточного родителя |
| reparent_department | Перемещение подразделения |
| create_employee | Создание сотрудника |
| update_employee | Обновление сотрудника |
| delete_employee | Удаление сотрудника |
| update_tariff | Обновление тарифа |
| create_contract | Создание договора |
| update_contract | Обновление договора |
| delete_contract | Удаление договора |
| create_employee_contract | Создание привязки |
| update_employee_contract | Обновление привязки |
| delete_employee_contract | Удаление привязки |

**Механика:**
- **Undo**: отменяет последнее неотменённое действие, помечает его `undone = true`
- **Redo**: повторяет первое отменённое действие, снимает флаг `undone`
- Новое действие очищает redo-стек (удаляет все записи с `undone = true`)
- Горячие клавиши: `Ctrl+Z` (undo), `Ctrl+Shift+Z` (redo) — хук `useUndoRedoKeys`
- Состояние в Zustand: `canUndo`, `canRedo`, `undoRedoLoading`

### 4.14 Сравнение сценариев

**Страница**: `/compare`

- Сравнение двух сценариев: отображение различий в оргструктуре и метриках

### 4.15 Импорт данных

- Массовый импорт сотрудников и оргструктуры из файла
- Два режима:
  - `modelOrgStructure = true`: построение оргструктуры из данных
  - `modelOrgStructure = false`: добавление сотрудников в существующие подразделения
- `clearExisting`: очистка данных перед импортом
- Формат строки: ЦФО, блок, подразделение, субподразделение, должность, ФИО, FTE, категория

### 4.16 Раздел «Справочники»

**Layout**: `/references/layout.tsx`

- Навигация вкладками: Сотрудники, Тарифы, Договоры
- Маршруты: `/references/employees`, `/references/tariffs`, `/references/contracts`

---

## 5. Спецификация API

### 5.1 Сценарии

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/scenarios` | Список сценариев (с метриками) |
| POST | `/api/scenarios` | Создать сценарий |
| GET | `/api/scenarios/[id]` | Получить сценарий |
| PUT | `/api/scenarios/[id]` | Обновить сценарий |
| DELETE | `/api/scenarios/[id]` | Удалить (кроме baseline) |
| POST | `/api/scenarios/[id]/clone` | Клонировать сценарий |

### 5.2 Подразделения

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/departments?scenarioId=` | Список подразделений с метриками |
| POST | `/api/departments` | Создать подразделение |
| GET | `/api/departments/[id]` | Получить подразделение с деталями |
| PUT | `/api/departments/[id]` | Обновить подразделение |
| DELETE | `/api/departments/[id]?cascade=&reparent=` | Удалить подразделение |
| GET | `/api/departments/[id]/metrics` | Метрики: {pp, opp, aup, total, totalFte} |

### 5.3 Сотрудники

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/employees?scenarioId=&page=&limit=&...` | Список (пагинация, фильтры) |
| POST | `/api/employees` | Создать сотрудника |
| GET | `/api/employees/[id]` | Получить сотрудника |
| PUT | `/api/employees/[id]` | Обновить сотрудника |
| DELETE | `/api/employees/[id]` | Удалить сотрудника |
| GET | `/api/employees/filters?scenarioId=` | Метаданные фильтров: {cfo, levels} |

**Параметры фильтрации GET /api/employees:**
- `scenarioId` (обязательно), `departmentId`, `category`, `search`
- `hierarchy_0` .. `hierarchy_3` — фильтры по уровням иерархии
- `cfo`, `rootDepartmentId`
- `page`, `limit` — пагинация

**Ответ GET /api/employees:**
```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "maxDepth": 4,
  "levelNames": [...],
  "columnNames": {...},
  "categoryTotals": { "pp": 20, "opp": 15, "aup": 15 }
}
```

### 5.4 Тарифы

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/tariffs` | Список тарифов (сортировка по имени) |
| PUT | `/api/tariffs/[id]` | Обновить ставку/описание |

### 5.5 Договоры

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/contracts?type=&search=` | Список договоров (с авторасчётом) |
| POST | `/api/contracts` | Создать договор |
| GET | `/api/contracts/[id]` | Получить договор с привязками |
| PUT | `/api/contracts/[id]` | Обновить договор |
| DELETE | `/api/contracts/[id]` | Удалить договор |
| GET | `/api/contracts/[id]/calculate-amount` | Детали авторасчёта |

**Ответ GET /api/contracts/[id]/calculate-amount:**
```json
{
  "calculatedAmount": 1500000,
  "workingHours": 1976,
  "details": [
    {
      "employeeId": "...",
      "fullName": "Иванов И.И.",
      "tariffRate": 2000,
      "fte": 0.5,
      "workingHours": 1976,
      "subtotal": 1976000
    }
  ]
}
```

### 5.6 Привязки сотрудник–договор

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/employee-contracts?employeeId=` | Привязки сотрудника |
| POST | `/api/employee-contracts` | Создать привязку |
| PUT | `/api/employee-contracts/[id]` | Обновить привязку |
| DELETE | `/api/employee-contracts/[id]` | Удалить привязку |

### 5.7 P&L

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/pnl?scenarioId=&mode=&periodStart=&periodEnd=` | P&L (из кэша или расчёт) |
| POST | `/api/pnl` | Принудительный расчёт P&L |
| GET | `/api/pnl/[departmentId]?scenarioId=&mode=&...` | Drill-down по подразделению |

**Ответ GET /api/pnl:**
```json
{
  "data": [
    {
      "departmentId": "...",
      "departmentName": "Цех №1",
      "shetilType": "REVENUE",
      "isEarning": true,
      "revenue": 2500000,
      "cost": 1800000,
      "pnl": 700000,
      "childrenPnl": 350000,
      "totalPnl": 1050000,
      "warningCount": 1
    }
  ],
  "calculatedAt": "2025-01-15T12:00:00Z"
}
```

### 5.8 Undo/Redo

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/actions?scenarioId=` | Состояние: {canUndo, canRedo} |
| POST | `/api/actions/undo?scenarioId=` | Отмена последнего действия |
| POST | `/api/actions/redo?scenarioId=` | Повтор отменённого действия |

### 5.9 Импорт

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/import` | Массовый импорт данных |

### 5.10 Аутентификация

| Метод | Путь | Описание |
|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth endpoints |

---

## 6. UI / Навигация

### 6.1 Боковое меню

| Пункт | Маршрут | Описание |
|---|---|---|
| Сценарии | `/scenarios` | Список и управление сценариями |
| Дашборд | `/` | Оргструктура или P&L-карта |
| Справочники | `/references` | Вкладки: Сотрудники, Тарифы, Договоры |
| Сравнение | `/compare` | Сравнение сценариев |

### 6.2 Дашборд

- Переключатель вида: «Оргструктура» (иконка LayoutDashboard) / «P&L Тепловая карта» (иконка Flame)
- Режим «orgchart»: OrgChart + DepartmentPanel
- Режим «pnl-heatmap»: PnlHeatmap + PnlDrillDown

### 6.3 Раздел «Справочники»

- Вкладки: Сотрудники (`/references/employees`), Тарифы (`/references/tariffs`), Договоры (`/references/contracts`)

---

## 7. Управление состоянием

**Zustand store** (`src/lib/store.ts`)

| Поле | Тип | Хранение | Описание |
|---|---|---|---|
| currentScenarioId | string \| null | memory | Текущий сценарий |
| selectedDepartmentId | string \| null | memory | Выбранное подразделение |
| viewMode | "orgchart" \| "pnl-heatmap" | localStorage | Режим отображения дашборда |
| pnlDisplayMode | "plan" \| "forecast" \| "combined" | localStorage | Режим P&L |
| pnlDrillDownDeptId | string \| null | memory | Подразделение для drill-down |
| metricsMode | MetricsMode | memory | Режим метрик |
| selectedLevels | number[] | memory | Выбранные уровни иерархии |
| departmentOverrides | Record<string, MetricsMode \| null> | memory | Переопределения метрик по подразделениям |
| collapsedIds | Set\<string> | memory | Свёрнутые узлы |
| collapsedIdsPerScenario | Record<string, string[]> | memory | Свёрнутые узлы по сценариям |
| employeeDeptFilter | {id, name} \| null | memory | Фильтр сотрудников по подразделению |
| employeeSearch | string | memory | Поиск сотрудников |
| employeeCategoryFilter | string | memory | Фильтр по категории |
| employeeHierarchyFilters | Record<string, string> | memory | Иерархические фильтры |
| verticalIds | Set\<string> | memory | Узлы с вертикальной раскладкой |
| refreshCounter | number | memory | Триггер обновления |
| canUndo | boolean | memory | Доступность отмены |
| canRedo | boolean | memory | Доступность повтора |
| undoRedoLoading | boolean | memory | Загрузка undo/redo |

---

## 8. Начальные данные (Seed)

### 8.1 Пользователь

- Email: `admin@orgchart.local`, пароль: `admin123`

### 8.2 Тарифы

| Название | Ставка (руб/ч) | Описание |
|---|---|---|
| K-1 | 1 500 | Начальный уровень |
| K-2 | 2 000 | Базовый уровень |
| K-3 | 2 800 | Средний уровень |
| K-4 | 3 500 | Продвинутый уровень |
| K-5 | 4 500 | Экспертный уровень |
| K-6 | 6 000 | Высший уровень |

### 8.3 Базовый сценарий «Текущее состояние»

Организационная структура из 18 подразделений и ~50 сотрудников:

```
Генеральная дирекция (BACKOFFICE)
├── Производственный блок (REVENUE)
│   ├── Цех №1 (REVENUE)
│   │   ├── Участок №1-А (REVENUE)
│   │   └── Участок №1-Б (REVENUE)
│   ├── Цех №2 (REVENUE)
│   │   └── Участок №2-А (REVENUE)
│   └── Склад готовой продукции (REVENUE)
├── Технический блок (RESOURCE)
│   ├── Отдел КИП (RESOURCE)
│   ├── Отдел главного механика (RESOURCE)
│   └── Энергослужба (RESOURCE)
├── Финансовый блок (BACKOFFICE)
│   ├── Бухгалтерия (BACKOFFICE)
│   └── Планово-экономический отдел (BACKOFFICE)
├── Управление персоналом (BACKOFFICE)
│   ├── Отдел кадров (BACKOFFICE)
│   └── Отдел охраны труда (BACKOFFICE)
└── Сервисная служба (SERVICE)
    ├── ИТ-отдел (SERVICE)
    └── АХО (SERVICE)
```

### 8.4 Ставки себестоимости

| Категория | costRate (руб/ч) |
|---|---|
| PP | 2 000 |
| OPP | 1 800 |
| AUP | 2 500 |

### 8.5 Договоры

**Заключённые (CONCLUDED):**

| Название | Сумма | Период | Подразделения |
|---|---|---|---|
| Контракт Альфа-2025 | 8 000 000 | 01.01.2025 – 31.12.2025 | Цех №1, Участок №1-А |
| Контракт Бета-2025 | 5 000 000 | 01.03.2025 – 30.09.2025 | Цех №2, Участок №2-А |
| Контракт Гамма-2025 | 3 000 000 | 01.06.2025 – 31.05.2026 | Цех №1, Участок №1-Б |

**Планируемые (PLANNED):**

| Название | Ожидаемая сумма | Период | Подразделения |
|---|---|---|---|
| Контракт Дельта-2026 | 12 000 000 | 01.01.2026 – 31.12.2026 | Цех №1, Участок №1-А, №1-Б |
| Контракт Эпсилон-2026 | 7 000 000 | 01.04.2026 – 31.12.2026 | Цех №2, Участок №2-А |
| Контракт Зета-2026 | 4 000 000 | 01.01.2026 – 30.06.2026 | Склад готовой продукции |

FTE привязок: 0.3–0.6 в зависимости от договора.

---

## 9. Нефункциональные требования

1. **Кэширование P&L**: результаты расчётов кэшируются в таблице PnlCache для ускорения повторных запросов
2. **Производственный календарь**: данные покрывают 2025–2027; вне этого диапазона используется значение по умолчанию 168 часов/месяц
3. **Персистентность undo/redo**: журнал действий хранится в БД и переживает перезапуски сервера
4. **Пользовательские настройки UI**: заголовки колонок, режим отображения и режим P&L сохраняются в localStorage
5. **Каскадное удаление**: удаление сценария каскадно удаляет подразделения, сотрудников и журнал действий; удаление сотрудника каскадно удаляет его привязки к договорам
6. **Валидация**: все входные данные валидируются через Zod-схемы на стороне сервера

---

## 10. Структура проекта

```
src/
├── app/
│   ├── api/
│   │   ├── actions/
│   │   │   ├── route.ts
│   │   │   ├── undo/route.ts
│   │   │   └── redo/route.ts
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── contracts/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── calculate-amount/route.ts
│   │   ├── departments/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── metrics/route.ts
│   │   ├── employee-contracts/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── employees/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── filters/route.ts
│   │   ├── import/route.ts
│   │   ├── pnl/
│   │   │   ├── route.ts
│   │   │   └── [departmentId]/route.ts
│   │   ├── scenarios/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── clone/route.ts
│   │   └── tariffs/
│   │       ├── route.ts
│   │       └── [id]/route.ts
│   ├── compare/page.tsx
│   ├── references/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── contracts/page.tsx
│   │   ├── employees/page.tsx
│   │   └── tariffs/page.tsx
│   ├── scenarios/page.tsx
│   └── page.tsx
├── components/
│   ├── contracts/ContractForm.tsx
│   ├── employees/EmployeeContractsModal.tsx
│   └── pnl/
│       ├── HeatmapNode.tsx
│       ├── PnlDrillDown.tsx
│       ├── PnlFilterPanel.tsx
│       ├── PnlHeatmap.tsx
│       └── PnlLegend.tsx
├── hooks/useUndoRedoKeys.ts
├── lib/
│   ├── action-logger.ts
│   ├── contract-auto-calc.ts
│   ├── db.ts
│   ├── pnl-calculator.ts
│   ├── store.ts
│   ├── work-calendar.ts
│   └── validations/
│       ├── contract.ts
│       ├── department.ts
│       ├── employee.ts
│       ├── employee-contract.ts
│       ├── scenario.ts
│       └── tariff.ts
└── types/index.ts
prisma/
├── schema.prisma
└── seed.ts
```
