# OrgChart — Стратегия реализации концепции Digital Twin

## Статус: все 8 спринтов завершены ✅

---

## Реализованные спринты

### СПРИНТ 1: RAG + бенчмарки ✅

| # | Задача | Статус |
|---|--------|--------|
| 1.1 | OSINT-бенчмарки (39 шт) — org_design, financial, hr по отраслям/размерам | ✅ |
| 1.2 | Страница /benchmarks — фильтры, сравнение с текущими метриками | ✅ |
| 1.3 | RAG: Voyage embeddings, chunking, семантический поиск | ✅ |
| 1.4 | AI tool query_knowledge_base | ✅ |
| 1.5 | База знаний /knowledge — загрузка PDF/DOCX/DOC, просмотр, поиск | ✅ |
| 1.6 | Маркировка источников (OSINT/KB/LLM бейджи) | ✅ |
| 1.7 | Локальный поиск без LLM + !ai защита | ✅ |

### СПРИНТ 2: Процессы и RACI ✅

| # | Задача | Статус |
|---|--------|--------|
| 2.1 | Prisma: Process, ProcessKpi, ProcessParticipant + API | ✅ |
| 2.2 | Каталог процессов /processes — дерево (макро → процесс → подпроцесс) | ✅ |
| 2.3 | RACI-матрица — click-to-cycle назначение R/A/C/I | ✅ |
| 2.4 | Страница процесса /processes/[id] — вкладки, KPI, дочерние | ✅ |
| 2.5 | Flowchart-редактор (ReactFlow, Draw.io импорт) | ✅ |
| 2.6 | VAD-визуализация (цепочка добавления стоимости) | ✅ |
| 2.7 | AI tools: analyze_processes, get_processes | ✅ |

### СПРИНТ 3: Компетенции и таланты ✅ (MVP)

| # | Задача | Статус |
|---|--------|--------|
| 3.1 | Prisma: Competency, RoleCompetency, EmployeeCompetency + API | ✅ |
| 3.2 | Матрица компетенций /competencies — сотрудники × компетенции, уровни 0-5 | ✅ |
| 3.3 | Skill gap анализ /competencies/gaps — текущий vs требуемый уровень | ✅ |
| 3.4 | Карточка сотрудника — модал с компетенциями, gap, контрактами | ✅ |
| 3.5 | AI tools: analyze_skill_gaps, get_competencies | ✅ |
| 3.6 | UI управления RoleCompetency (должность → требуемые уровни) | ⏳ post-MVP |
| 3.7 | AI tools: plan_hiring, recommend_reskilling | ⏳ post-MVP |

### СПРИНТ 4: Стратегия и цели ✅

| # | Задача | Статус |
|---|--------|--------|
| 4.1 | Prisma: Goal, GoalKpi, GoalDepartmentLink + GoalType/GoalStatus enums | ✅ |
| 4.2 | BSC (4 перспективы: Финансы, Клиенты, Процессы, Обучение) | ✅ |
| 4.3 | OKR — цели с ключевыми результатами | ✅ |
| 4.4 | Дерево целей /strategy — иерархия, статусы, прогресс-бары, KPI | ✅ |
| 4.5 | Привязка целей к подразделениям (мультиселект) | ✅ |
| 4.6 | Владелец цели — combobox с поиском по ФИО/должности | ✅ |
| 4.7 | AI tools: get_goals, analyze_strategy | ✅ |

### СПРИНТ 5: CEO Dashboard + OHI ✅

| # | Задача | Статус |
|---|--------|--------|
| 5.1 | OHI Calculator — композитный индекс 0-100 из 7 компонентов | ✅ |
| 5.2 | CEO Dashboard — третья вкладка на / с SVG-gauge и карточками | ✅ |
| 5.3 | 7 компонентов OHI: структура, финансы, процессы, компетенции, стратегия, операции, заказчики | ✅ |
| 5.4 | API: /api/dashboard/ohi | ✅ |
| 5.5 | AI tools: get_ohi, generate_board_report | ✅ |

### СПРИНТ 6: Заказчики и рынок ✅

| # | Задача | Статус |
|---|--------|--------|
| 6.1 | Prisma: Client, PipelineDeal + clientId в Contract | ✅ |
| 6.2 | Реестр заказчиков /clients — CRUD, статусы, отрасль, контакты | ✅ |
| 6.3 | Pipeline (воронка продаж) — 6 стадий, суммы, вероятности | ✅ |
| 6.4 | Привязка контрактов к заказчикам | ✅ |
| 6.5 | OHI: клиентская устойчивость из реальных данных (концентрация top-3, pipeline health) | ✅ |
| 6.6 | AI tools: get_clients, analyze_portfolio, get_pipeline | ✅ |

### СПРИНТ 7: Финансовое ядро v2 ✅

| # | Задача | Статус |
|---|--------|--------|
| 7.1 | Prisma: Budget, BudgetLine (CapEx/OpEx) | ✅ |
| 7.2 | Бюджетирование — CRUD со строками план/факт по подразделениям | ✅ |
| 7.3 | Расширенная P&L аналитика /finance — KPI, маржа, утилизация | ✅ |
| 7.4 | Unit-экономика — revenue/FTE, cost/FTE по подразделениям | ✅ |
| 7.5 | Таблица P&L по подразделениям с маржинальностью | ✅ |
| 7.6 | AI tools: analyze_budget, get_unit_economics | ✅ |

### СПРИНТ 8: Проактивный AI ✅

| # | Задача | Статус |
|---|--------|--------|
| 8.1 | Prisma: AIInsight, AIRecommendation | ✅ |
| 8.2 | OrgAnalyzer — health check по всем 7 слоям организации | ✅ |
| 8.3 | Детекция аномалий: overhead, span, процессы без владельца, цели под угрозой, концентрация выручки, перерасход бюджетов | ✅ |
| 8.4 | Панель инсайтов на CEO Dashboard — severity, рекомендации, "Запустить анализ" | ✅ |
| 8.5 | AI tools: run_health_check, get_insights | ✅ |

---

## Сводка

| Спринт | Тема | Статус |
|--------|------|--------|
| 1 | RAG + бенчмарки | ✅ DONE |
| 2 | Процессы и RACI | ✅ DONE |
| 3 | Компетенции | ✅ DONE (MVP) |
| 4 | Стратегия и цели | ✅ DONE |
| 5 | CEO Dashboard + OHI | ✅ DONE |
| 6 | Заказчики и рынок | ✅ DONE |
| 7 | Финансовое ядро v2 | ✅ DONE |
| 8 | Проактивный AI | ✅ DONE |

---

## Навигация (Sidebar)

1. Сценарии (`/scenarios`)
2. Дашборд (`/`) — Оргструктура / P&L Heatmap / CEO Dashboard
3. Стратегия (`/strategy`) — BSC + OKR
4. Финансы (`/finance`) — P&L аналитика + бюджеты
5. Процессы (`/processes`) — каталог, RACI, Flowchart/VAD
6. Компетенции (`/competencies`) — матрица + gap-анализ
7. Заказчики (`/clients`) — реестр + pipeline
8. Сравнение сценариев (`/compare`)
9. Gap-анализ сценариев (`/gap-analysis`)
10. Бенчмарки (`/benchmarks`)
11. База знаний (`/knowledge`)
12. Справочники (`/references`) — сотрудники, тарифы, контракты
13. AI-ассистент (боковая панель)

---

## AI-инструменты (28 шт)

| Инструмент | Описание |
|------------|----------|
| get_org_structure | Оргструктура сценария |
| get_department_details | Детали подразделения |
| get_org_metrics | Span, overhead, hierarchy depth |
| compare_scenarios | Сравнение as-is / to-be |
| clone_scenario | Клонирование сценария |
| run_whatif_scenario | What-if моделирование |
| create_department | Создать подразделение |
| move_department | Переместить подразделение |
| rename_department | Переименовать |
| delete_department | Удалить подразделение |
| move_employees | Переместить сотрудников |
| add_employee | Добавить сотрудника |
| remove_employees | Удалить сотрудников |
| create_gap_passport | Создать паспорт разрыва |
| calculate_pnl | Рассчитать P&L |
| list_scenarios | Список сценариев |
| get_benchmarks | Отраслевые бенчмарки |
| query_knowledge_base | Поиск по базе знаний (RAG) |
| analyze_processes | Анализ процессов |
| get_processes | Список процессов |
| analyze_skill_gaps | Анализ skill gap |
| get_competencies | Список компетенций |
| get_goals | Стратегические цели BSC/OKR |
| analyze_strategy | Анализ стратегического выравнивания |
| get_ohi | Organization Health Index |
| generate_board_report | Отчёт для совета директоров |
| get_clients | Список заказчиков |
| analyze_portfolio | Анализ клиентского портфеля |
| get_pipeline | Воронка продаж |
| analyze_budget | Анализ бюджетов план/факт |
| get_unit_economics | Unit-экономика по подразделениям |
| run_health_check | Проактивный health check |
| get_insights | Текущие AI-инсайты |

---

## Prisma модели (24 шт)

| Модель | Спринт | Назначение |
|--------|--------|------------|
| User | Base | Авторизация |
| Scenario | Base | Сценарное моделирование |
| Department | Base | Оргструктура |
| Employee | Base | Сотрудники |
| Tariff | Base | Тарифные ставки |
| Contract | Base + S6 | Контракты (+ clientId) |
| EmployeeContract | Base | Привязка сотрудников к контрактам |
| ActionLog | Base | Журнал действий (undo) |
| GapPassport | Base | Паспорта разрывов |
| AiConversation | Base | Истории AI-чатов |
| KnowledgeDocument | S1 | Документы базы знаний |
| KnowledgeChunk | S1 | Чанки для RAG |
| PnlCache | Base | Кэш P&L расчётов |
| Process | S2 | Бизнес-процессы |
| ProcessKpi | S2 | KPI процессов |
| ProcessParticipant | S2 | RACI-участники |
| ProcessDiagram | S2 | Диаграммы процессов |
| ProcessStep | S2 | Шаги диаграмм |
| ProcessStepLink | S2 | Связи между шагами |
| Competency | S3 | Компетенции |
| RoleCompetency | S3 | Требования к должностям |
| EmployeeCompetency | S3 | Оценки сотрудников |
| Goal | S4 | Стратегические цели BSC/OKR |
| GoalKpi | S4 | KPI целей |
| GoalDepartmentLink | S4 | Привязка целей к подразделениям |
| Client | S6 | Заказчики |
| PipelineDeal | S6 | Сделки в pipeline |
| Budget | S7 | Бюджеты CapEx/OpEx |
| BudgetLine | S7 | Строки бюджетов |
| AIInsight | S8 | Проактивные инсайты AI |
| AIRecommendation | S8 | Рекомендации AI |

---

## Отложено на post-MVP

| Задача | Причина |
|--------|---------|
| UI управления RoleCompetency (должность → требуемые уровни) | Приоритет ниже, API готов |
| AI tools: plan_hiring, recommend_reskilling | Зависит от RoleCompetency UI |
| Трансфертное ценообразование между подразделениями | Сложная бизнес-логика |
| NPS/CSI метрики клиентов | Нет модели ClientSatisfaction |
| Еженедельный AI-дайджест для CEO | Требует фоновый cron/scheduler |
| Cross-layer impact (изменение → пересчёт всех слоёв) | Архитектурная задача |
