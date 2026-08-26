# PLAN: мультивыделение блоков и массовая смена типа ШЕТИЛ

Дата: 2026-08-26

## Шаги
1. API `src/app/api/departments/bulk-type/route.ts` (PATCH): zod-схема
   {scenarioId, departmentIds[], shetilType}; транзакция: findMany (снапшот
   прежних типов) → updateMany → один logAction
   "bulk_update_department_type" (undoPayload.previous = [{id, shetilType}]).
2. `src/lib/action-logger.ts`: case bulk_update_department_type в undo
   (вернуть каждому прежний тип) и redo (снова применить общий).
3. `OrgChart.tsx`: multiSelectionKeyCode/selectionKeyCode, onSelectionChange →
   selectedIds; Ctrl/Cmd+клик не открывает панель подразделения; сброс
   выделения при смене сценария.
4. `DepartmentNode.tsx`: кольцо у selected-узла (заливки ШЕТИЛ не трогать).
5. Новый `BulkActionsBar.tsx`: «Выбрано: N», 4 кнопки типов из SHETIL_CONFIG,
   сброс; вызов bulk-type → refreshDepartments + fetchUndoRedoState.
6. `harness/PROJECT.md`: 18-й тип действия undo, мультивыделение на дашборде.
7. Проверка Chromium (выделение, рамка, применение, undo/redo), tsc, lint.
8. Коммит, push в dev-mvp4, скриншоты.

## Альтернативы
- N одиночных PATCH вместо bulk-эндпоинта: отвергнута — undo пришлось бы
  нажимать N раз, а лог засорялся бы пачкой записей на одно действие человека.
- Своя система выделения (клики + собственный стейт, мимо ReactFlow):
  отвергнута — дублирует штатный механизм канваса, рамку пришлось бы писать
  руками, а конфликт с паном решать самим.
- Смена типа через контекстное меню узла «для всех выделенных»: отвергнута —
  действие спрятано, для массовой правки нужен постоянно видимый индикатор
  «сколько выбрано и что можно сделать».

## Риски
- 🟡 Конфликт Ctrl+клика с открытием панели подразделения → следим: guard по
  event.ctrlKey/metaKey в обработчике клика узла.
- 🟡 Выделенная группа становится перетаскиваемой — проверить, что drag не
  ломает раскладку (позиции пересчитываются dagre при каждом рендере).
- 🟢 actionType — String, миграции не нужны.

## Бюджет
- Файлов: 6 (route, action-logger, OrgChart, DepartmentNode, BulkActionsBar, PROJECT.md)
- Время: ~2 часа

## Чек-лист выхода
- [x] шаги конкретны
- [x] отвергнутые альтернативы с причинами — 3 шт.
- [x] красных рисков нет
- [x] бюджет назначен
