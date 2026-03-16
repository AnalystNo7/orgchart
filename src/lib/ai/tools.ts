import { tool, zodSchema } from "ai";
import { z } from "zod";
import { executeTool } from "./tool-executor";

export function buildTools(currentScenarioId: string) {
  return {
    get_org_structure: tool({
      description:
        "Получить оргструктуру сценария: список подразделений с метриками (количество сотрудников по категориям ПП/ОПП/АУП, FTE, руководитель, тип ШЕТИЛ). Используй для анализа текущего состояния.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария. Если не указан — используется текущий."),
        })
      ),
      execute: async (params) =>
        executeTool("get_org_structure", params, currentScenarioId),
    }),

    get_department_details: tool({
      description:
        "Получить детальную информацию о конкретном подразделении: список сотрудников, дочерние подразделения, руководитель.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: async (params) =>
        executeTool("get_department_details", params, currentScenarioId),
    }),

    get_org_metrics: tool({
      description:
        "Рассчитать агрегированные метрики оргструктуры: span of control, overhead ratio (доля АУП), распределение FTE по категориям, глубина иерархии, количество подразделений по типам.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: async (params) =>
        executeTool("get_org_metrics", params, currentScenarioId),
    }),

    compare_scenarios: tool({
      description:
        "Сравнить два сценария: показать добавленные, удалённые, изменённые и перемещённые подразделения. Используй для gap-анализа.",
      inputSchema: zodSchema(
        z.object({
          leftScenarioId: z.string().describe("ID первого (as-is) сценария"),
          rightScenarioId: z.string().describe("ID второго (to-be) сценария"),
        })
      ),
      execute: async (params) =>
        executeTool("compare_scenarios", params, currentScenarioId),
    }),

    clone_scenario: tool({
      description:
        "Клонировать сценарий. Используй для what-if моделирования — сначала клонируй, потом вноси изменения.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария для клонирования"),
          newName: z.string().describe("Название нового сценария"),
        })
      ),
      execute: async (params) =>
        executeTool("clone_scenario", params, currentScenarioId),
    }),

    create_department: tool({
      description: "Создать новое подразделение в сценарии.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          name: z.string().describe("Название подразделения"),
          parentId: z.string().optional().describe("ID родительского подразделения (null для корня)"),
          shetilType: z
            .enum(["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"])
            .describe("Тип ШЕТИЛ"),
        })
      ),
      execute: async (params) =>
        executeTool("create_department", params, currentScenarioId),
    }),

    move_department: tool({
      description: "Переместить подразделение к другому родителю.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newParentId: z.string().optional().describe("ID нового родителя (null для корня)"),
        })
      ),
      execute: async (params) =>
        executeTool("move_department", params, currentScenarioId),
    }),

    rename_department: tool({
      description: "Переименовать подразделение.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newName: z.string().describe("Новое название"),
        })
      ),
      execute: async (params) =>
        executeTool("rename_department", params, currentScenarioId),
    }),

    delete_department: tool({
      description:
        "Удалить подразделение. Сотрудники будут перемещены к родителю или удалены.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: async (params) =>
        executeTool("delete_department", params, currentScenarioId),
    }),

    move_employees: tool({
      description: "Переместить сотрудников в другое подразделение.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников"),
          targetDepartmentId: z.string().describe("ID целевого подразделения"),
        })
      ),
      execute: async (params) =>
        executeTool("move_employees", params, currentScenarioId),
    }),

    create_gap_passport: tool({
      description:
        "Создать паспорт разрыва (gap). Используй после сравнения as-is и to-be сценариев.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          asIsScenarioId: z.string().describe("ID as-is сценария"),
          toBeScenarioId: z.string().describe("ID to-be сценария"),
          category: z
            .enum(["STRUCTURE", "PROCESS", "RESOURCE", "COMPETENCY", "TECHNOLOGY"])
            .describe("Категория разрыва"),
          title: z.string().describe("Краткое описание разрыва"),
          description: z.string().describe("Полное описание"),
          priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).describe("Приоритет"),
          impact: z.string().optional().describe("Влияние на организацию"),
          affectedDepartmentIds: z
            .array(z.string())
            .optional()
            .describe("ID затронутых подразделений"),
          aiRationale: z.string().optional().describe("Обоснование AI"),
        })
      ),
      execute: async (params) =>
        executeTool("create_gap_passport", params, currentScenarioId),
    }),

    calculate_pnl: tool({
      description:
        "Рассчитать P&L (прибыли и убытки) для сценария. Возвращает доход, расход и маржинальность по подразделениям.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          mode: z
            .enum(["forecast", "plan", "combined"])
            .optional()
            .describe("Режим расчёта: forecast (факт), plan (план), combined (оба)"),
          periodStart: z.string().optional().describe("Начало периода (ISO date)"),
          periodEnd: z.string().optional().describe("Конец периода (ISO date)"),
        })
      ),
      execute: async (params) =>
        executeTool("calculate_pnl", params, currentScenarioId),
    }),

    list_scenarios: tool({
      description:
        "Получить список всех сценариев для выбора при сравнении или what-if.",
      inputSchema: zodSchema(z.object({})),
      execute: async (params) =>
        executeTool("list_scenarios", params, currentScenarioId),
    }),

    run_whatif_scenario: tool({
      description:
        "Запустить what-if моделирование: клонировать текущий сценарий, применить серию изменений и сравнить результат с исходным. Возвращает метрики до/после, diff структуры и P&L.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID исходного сценария"),
          name: z.string().describe("Название what-if сценария"),
          operations: z
            .array(
              z.object({
                action: z
                  .enum([
                    "create_department",
                    "delete_department",
                    "move_department",
                    "rename_department",
                    "move_employees",
                    "merge_departments",
                  ])
                  .describe("Тип операции"),
                params: z.record(z.string(), z.unknown()).describe("Параметры операции"),
              })
            )
            .describe("Список операций для применения"),
          comparePnl: z.boolean().optional().describe("Сравнить P&L до/после (по умолчанию true)"),
        })
      ),
      execute: async (params) =>
        executeTool("run_whatif_scenario", params, currentScenarioId),
    }),

    add_employee: tool({
      description:
        "Добавить нового сотрудника в подразделение. Используй в what-if моделировании для расширения штата.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          fullName: z.string().describe("ФИО сотрудника"),
          position: z.string().describe("Должность"),
          category: z.enum(["PP", "OPP", "AUP"]).describe("Категория"),
          fte: z.number().optional().describe("FTE (ставка), по умолчанию 1.0"),
        })
      ),
      execute: async (params) =>
        executeTool("add_employee", params, currentScenarioId),
    }),

    remove_employees: tool({
      description:
        "Удалить сотрудников из организации. Используй в what-if моделировании для сокращения штата.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников для удаления"),
        })
      ),
      execute: async (params) =>
        executeTool("remove_employees", params, currentScenarioId),
    }),
  };
}
