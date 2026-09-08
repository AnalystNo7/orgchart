/**
 * Русские метки типов действий журнала undo/redo (ActionLog.actionType).
 *
 * Стек отмены общий на сценарий: кнопка на дашборде может откатить правку
 * из справочника, которой на схеме не видно. Метка в строке «Отменено: …»
 * говорит пользователю, что именно произошло. Держать синхронно с
 * case-ветками в src/lib/action-logger.ts.
 */
export const ACTION_LABELS: Record<string, string> = {
  create_department: "создание подразделения",
  update_department: "изменение подразделения",
  bulk_update_department_type: "массовая смена типа подразделений",
  delete_department: "удаление подразделения",
  delete_department_cascade: "удаление подразделения с дочерними",
  delete_department_reparent: "удаление подразделения с переносом дочерних",
  add_parent: "добавление родительского подразделения",
  reparent_department: "перемещение подразделения",
  create_employee: "добавление сотрудника",
  update_employee: "изменение сотрудника",
  delete_employee: "удаление сотрудника",
  update_tariff: "изменение тарифа",
  create_contract: "создание договора",
  update_contract: "изменение договора",
  delete_contract: "удаление договора",
  create_employee_contract: "привязка сотрудника к договору",
  update_employee_contract: "изменение привязки к договору",
  delete_employee_contract: "удаление привязки к договору",
};

export function actionLabel(actionType: string | undefined): string {
  return (actionType && ACTION_LABELS[actionType]) || actionType || "действие";
}
