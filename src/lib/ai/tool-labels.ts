/**
 * Русские метки внутренних инструментов AI-ассистента.
 *
 * Единственный источник: серверу нужны метки для фильтра имён в тексте
 * ответа и для пометки обрыва, клиенту — для чипов шагов
 * (src/components/ai-chat/tool-labels.ts реэкспортирует отсюда).
 * Держать синхронно с набором инструментов в src/lib/ai/tools.ts.
 */
export const TOOL_LABELS: Record<string, string> = {
  get_benchmarks: "Поиск бенчмарков",
  query_knowledge_base: "Поиск в базе знаний",
  analyze_skill_gaps: "Анализ компетенций",
  get_competencies: "Получение компетенций",
  analyze_processes: "Анализ процессов",
  get_processes: "Получение процессов",
  get_org_structure: "Получение оргструктуры",
  get_department_details: "Детали подразделения",
  get_org_metrics: "Расчёт метрик",
  compare_scenarios: "Сравнение сценариев",
  clone_scenario: "Клонирование сценария",
  create_department: "Создание подразделения",
  move_department: "Перемещение подразделения",
  rename_department: "Переименование",
  delete_department: "Удаление подразделения",
  move_employees: "Перемещение сотрудников",
  create_gap_passport: "Создание паспорта разрыва",
  calculate_pnl: "Расчёт P&L",
  list_scenarios: "Список сценариев",
  run_whatif_scenario: "What-if моделирование",
  add_employee: "Добавление сотрудника",
  remove_employees: "Удаление сотрудников",
  get_goals: "Получение целей",
  analyze_strategy: "Анализ стратегии",
  get_ohi: "Индекс здоровья (OHI)",
  generate_board_report: "Отчёт для правления",
  get_clients: "Получение заказчиков",
  analyze_portfolio: "Анализ портфеля",
  get_pipeline: "Получение пайплайна",
  analyze_budget: "Анализ бюджета",
  get_unit_economics: "Unit-экономика",
  run_health_check: "Проверка здоровья организации",
  get_insights: "Получение инсайтов",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

// Longest tool name is 22 chars (get_department_details); anything longer is
// an ordinary word and must not be held back.
const MAX_HELD_WORD = 40;
const NAME_PATTERN = new RegExp(
  `\\b(${Object.keys(TOOL_LABELS).join("|")})\\b`,
  "g"
);

function replaceNames(text: string): string {
  return text.replace(NAME_PATTERN, (m) => `«${TOOL_LABELS[m]}»`);
}

/**
 * Streaming filter: rewrites internal tool names into their Russian labels.
 *
 * A name can be split across delta boundaries ("get_org_stru" + "cture"), so
 * the filter withholds the trailing unfinished word-run and emits the rest —
 * a complete name never straddles the emit boundary. flush() drains the tail.
 */
export function createToolNameFilter(): {
  push: (delta: string) => string;
  flush: () => string;
} {
  let tail = "";

  return {
    push(delta: string): string {
      const text = tail + delta;
      // The trailing run of word characters may be an unfinished tool name.
      const m = text.match(/[A-Za-z0-9_]+$/);
      const held = m && m[0].length <= MAX_HELD_WORD ? m[0] : "";
      tail = held;
      const emit = held ? text.slice(0, -held.length) : text;
      return replaceNames(emit);
    },
    flush(): string {
      const rest = replaceNames(tail);
      tail = "";
      return rest;
    },
  };
}
