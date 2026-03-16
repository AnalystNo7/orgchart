import type Anthropic from "@anthropic-ai/sdk";

export const aiTools: Anthropic.Tool[] = [
  {
    name: "get_org_structure",
    description:
      "Получить оргструктуру сценария: список подразделений с метриками (количество сотрудников по категориям ПП/ОПП/АУП, FTE, руководитель, тип ШЕТИЛ). Используй для анализа текущего состояния.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: {
          type: "string",
          description: "ID сценария. Если не указан — используется текущий.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_department_details",
    description:
      "Получить детальную информацию о конкретном подразделении: список сотрудников, дочерние подразделения, руководитель.",
    input_schema: {
      type: "object" as const,
      properties: {
        departmentId: { type: "string", description: "ID подразделения" },
      },
      required: ["departmentId"],
    },
  },
  {
    name: "get_org_metrics",
    description:
      "Рассчитать агрегированные метрики оргструктуры: span of control, overhead ratio (доля АУП), распределение FTE по категориям, глубина иерархии, количество подразделений по типам.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: { type: "string", description: "ID сценария" },
      },
      required: [],
    },
  },
  {
    name: "compare_scenarios",
    description:
      "Сравнить два сценария: показать добавленные, удалённые, изменённые и перемещённые подразделения. Используй для gap-анализа.",
    input_schema: {
      type: "object" as const,
      properties: {
        leftScenarioId: { type: "string", description: "ID первого (as-is) сценария" },
        rightScenarioId: { type: "string", description: "ID второго (to-be) сценария" },
      },
      required: ["leftScenarioId", "rightScenarioId"],
    },
  },
  {
    name: "clone_scenario",
    description:
      "Клонировать сценарий. Используй для what-if моделирования — сначала клонируй, потом вноси изменения.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: { type: "string", description: "ID сценария для клонирования" },
        newName: { type: "string", description: "Название нового сценария" },
      },
      required: ["scenarioId", "newName"],
    },
  },
  {
    name: "create_department",
    description: "Создать новое подразделение в сценарии.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: { type: "string", description: "ID сценария" },
        name: { type: "string", description: "Название подразделения" },
        parentId: { type: "string", description: "ID родительского подразделения (null для корня)" },
        shetilType: {
          type: "string",
          enum: ["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"],
          description: "Тип ШЕТИЛ",
        },
      },
      required: ["scenarioId", "name", "shetilType"],
    },
  },
  {
    name: "move_department",
    description: "Переместить подразделение к другому родителю.",
    input_schema: {
      type: "object" as const,
      properties: {
        departmentId: { type: "string", description: "ID подразделения" },
        newParentId: { type: "string", description: "ID нового родителя (null для корня)" },
      },
      required: ["departmentId"],
    },
  },
  {
    name: "rename_department",
    description: "Переименовать подразделение.",
    input_schema: {
      type: "object" as const,
      properties: {
        departmentId: { type: "string", description: "ID подразделения" },
        newName: { type: "string", description: "Новое название" },
      },
      required: ["departmentId", "newName"],
    },
  },
  {
    name: "delete_department",
    description:
      "Удалить подразделение. Сотрудники будут перемещены к родителю или удалены.",
    input_schema: {
      type: "object" as const,
      properties: {
        departmentId: { type: "string", description: "ID подразделения" },
      },
      required: ["departmentId"],
    },
  },
  {
    name: "move_employees",
    description: "Переместить сотрудников в другое подразделение.",
    input_schema: {
      type: "object" as const,
      properties: {
        employeeIds: {
          type: "array",
          items: { type: "string" },
          description: "Массив ID сотрудников",
        },
        targetDepartmentId: { type: "string", description: "ID целевого подразделения" },
      },
      required: ["employeeIds", "targetDepartmentId"],
    },
  },
  {
    name: "create_gap_passport",
    description:
      "Создать паспорт разрыва (gap). Используй после сравнения as-is и to-be сценариев.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: { type: "string", description: "ID сценария" },
        asIsScenarioId: { type: "string", description: "ID as-is сценария" },
        toBeScenarioId: { type: "string", description: "ID to-be сценария" },
        category: {
          type: "string",
          enum: ["STRUCTURE", "PROCESS", "RESOURCE", "COMPETENCY", "TECHNOLOGY"],
          description: "Категория разрыва",
        },
        title: { type: "string", description: "Краткое описание разрыва" },
        description: { type: "string", description: "Полное описание" },
        priority: {
          type: "string",
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
          description: "Приоритет",
        },
        impact: { type: "string", description: "Влияние на организацию" },
        affectedDepartmentIds: {
          type: "array",
          items: { type: "string" },
          description: "ID затронутых подразделений",
        },
        aiRationale: { type: "string", description: "Обоснование AI" },
      },
      required: ["scenarioId", "asIsScenarioId", "toBeScenarioId", "category", "title", "description", "priority"],
    },
  },
  {
    name: "calculate_pnl",
    description:
      "Рассчитать P&L (прибыли и убытки) для сценария. Возвращает доход, расход и маржинальность по подразделениям.",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: { type: "string", description: "ID сценария" },
        mode: {
          type: "string",
          enum: ["forecast", "plan", "combined"],
          description: "Режим расчёта: forecast (факт), plan (план), combined (оба)",
        },
        periodStart: { type: "string", description: "Начало периода (ISO date)" },
        periodEnd: { type: "string", description: "Конец периода (ISO date)" },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "list_scenarios",
    description: "Получить список всех сценариев для выбора при сравнении или what-if.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "run_whatif_scenario",
    description:
      "Запустить what-if моделирование: клонировать текущий сценарий, применить серию изменений и сравнить результат с исходным. Возвращает метрики до/после, diff структуры и P&L. Используй для ответов на вопросы вида «Что будет, если...?».",
    input_schema: {
      type: "object" as const,
      properties: {
        scenarioId: {
          type: "string",
          description: "ID исходного сценария. Если не указан — текущий.",
        },
        name: {
          type: "string",
          description: "Название what-if сценария (например: «What-if: объединение отделов»)",
        },
        operations: {
          type: "array",
          description: "Список операций для применения к клонированному сценарию, выполняются последовательно.",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "create_department",
                  "delete_department",
                  "move_department",
                  "rename_department",
                  "move_employees",
                  "merge_departments",
                ],
                description: "Тип операции",
              },
              params: {
                type: "object",
                description:
                  "Параметры операции. create_department: {name, parentId?, shetilType}. delete_department: {departmentId}. move_department: {departmentId, newParentId}. rename_department: {departmentId, newName}. move_employees: {employeeIds[], targetDepartmentId}. merge_departments: {sourceDepartmentId, targetDepartmentId} — перемещает всех сотрудников и дочерние подразделения из source в target, затем удаляет source.",
              },
            },
            required: ["action", "params"],
          },
        },
        comparePnl: {
          type: "boolean",
          description: "Сравнить P&L до/после (по умолчанию true)",
        },
      },
      required: ["name", "operations"],
    },
  },
  {
    name: "add_employee",
    description:
      "Добавить нового сотрудника в подразделение. Используй в what-if моделировании для расширения штата.",
    input_schema: {
      type: "object" as const,
      properties: {
        departmentId: { type: "string", description: "ID подразделения" },
        fullName: { type: "string", description: "ФИО сотрудника" },
        position: { type: "string", description: "Должность" },
        category: {
          type: "string",
          enum: ["PP", "OPP", "AUP"],
          description: "Категория: PP (производственный), OPP (обще-производственный), AUP (административный)",
        },
        fte: {
          type: "number",
          description: "FTE (ставка), по умолчанию 1.0",
        },
      },
      required: ["departmentId", "fullName", "position", "category"],
    },
  },
  {
    name: "remove_employees",
    description:
      "Удалить сотрудников из организации. Используй в what-if моделировании для сокращения штата.",
    input_schema: {
      type: "object" as const,
      properties: {
        employeeIds: {
          type: "array",
          items: { type: "string" },
          description: "Массив ID сотрудников для удаления",
        },
      },
      required: ["employeeIds"],
    },
  },
];
