export function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    get_benchmarks: "Поиск бенчмарков",
    query_knowledge_base: "Поиск в базе знаний",
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
  };
  return labels[name] || name;
}
