import { tool, zodSchema } from "ai";
import { z } from "zod";
import { executeTool } from "./tool-executor";

export type ToolProgressCallback = (toolName: string, step: string) => void;

function wrapExecute(
  name: string,
  currentScenarioId: string,
  onProgress?: ToolProgressCallback
) {
  return async (params: Record<string, unknown>) => {
    onProgress?.(name, "started");
    const result = await executeTool(name, params, currentScenarioId, onProgress);
    onProgress?.(name, "completed");
    return result;
  };
}

export function buildTools(currentScenarioId: string, onProgress?: ToolProgressCallback) {
  return {
    get_benchmarks: tool({
      description:
        "Получить отраслевые бенчмарки (OSINT). Категории: org_design (span of control, overhead ratio, глубина иерархии), financial (revenue/FTE, маржинальность, утилизация), hr (текучесть, стоимость найма, обучение). Фильтрация по отрасли и размеру компании.",
      inputSchema: zodSchema(
        z.object({
          category: z
            .enum(["org_design", "financial", "hr"])
            .optional()
            .describe("Категория бенчмарков (если не указана — все)"),
          metric: z.string().optional().describe("Конкретная метрика (span_of_control, overhead_ratio, revenue_per_fte, turnover_rate и др.)"),
          industry: z.string().optional().describe("Отрасль (IT-интеграторы, IT-продуктовые, Нефтегаз и др.)"),
          companySize: z.string().optional().describe("Размер компании (100-500, 500-2000 и др.)"),
        })
      ),
      execute: wrapExecute("get_benchmarks", currentScenarioId, onProgress),
    }),

    query_knowledge_base: tool({
      description:
        "Поиск по базе знаний (RAG). Ищет релевантные фрагменты документов по семантической близости к запросу. Используй для: поиска управленческих фреймворков, бенчмарков из загруженных документов, регламентов и НМД клиента. Возвращает top-K релевантных фрагментов с указанием источника.",
      inputSchema: zodSchema(
        z.object({
          query: z.string().describe("Поисковый запрос на естественном языке"),
          topK: z.number().optional().describe("Количество результатов (по умолчанию 5)"),
          category: z
            .enum(["FRAMEWORK", "BENCHMARK", "CLIENT_DOC"])
            .optional()
            .describe("Фильтр по категории документов"),
        })
      ),
      execute: wrapExecute("query_knowledge_base", currentScenarioId, onProgress),
    }),

    analyze_skill_gaps: tool({
      description:
        "Анализ компетентностных разрывов: сравнить текущие уровни компетенций сотрудников с требованиями к позициям. Показать gap по подразделениям и компетенциям.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          departmentId: z.string().optional().describe("ID подразделения (если не указан — все)"),
        })
      ),
      execute: wrapExecute("analyze_skill_gaps", currentScenarioId, onProgress),
    }),

    get_competencies: tool({
      description:
        "Получить список компетенций с категориями и количеством привязок к ролям/сотрудникам.",
      inputSchema: zodSchema(z.object({})),
      execute: wrapExecute("get_competencies", currentScenarioId, onProgress),
    }),

    analyze_processes: tool({
      description:
        "Анализ бизнес-процессов сценария: найти процессы без владельца, без участников RACI, дублирование, пробелы в покрытии подразделений. Возвращает структурированный отчёт.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_processes", currentScenarioId, onProgress),
    }),

    get_processes: tool({
      description:
        "Получить список бизнес-процессов сценария с KPI и RACI-участниками.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_processes", currentScenarioId, onProgress),
    }),

    get_org_structure: tool({
      description:
        "Получить оргструктуру сценария: список подразделений с метриками (количество сотрудников по категориям ПП/ОПП/АУП, FTE, руководитель, тип ШЕТИЛ). Используй для анализа текущего состояния.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария. Если не указан — используется текущий."),
        })
      ),
      execute: wrapExecute("get_org_structure", currentScenarioId, onProgress),
    }),

    get_department_details: tool({
      description:
        "Получить детальную информацию о конкретном подразделении: список сотрудников, дочерние подразделения, руководитель.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: wrapExecute("get_department_details", currentScenarioId, onProgress),
    }),

    get_org_metrics: tool({
      description:
        "Рассчитать агрегированные метрики оргструктуры: span of control, overhead ratio (доля АУП), распределение FTE по категориям, глубина иерархии, количество подразделений по типам.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_org_metrics", currentScenarioId, onProgress),
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
      execute: wrapExecute("compare_scenarios", currentScenarioId, onProgress),
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
      execute: wrapExecute("clone_scenario", currentScenarioId, onProgress),
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
      execute: wrapExecute("create_department", currentScenarioId, onProgress),
    }),

    move_department: tool({
      description: "Переместить подразделение к другому родителю.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newParentId: z.string().optional().describe("ID нового родителя (null для корня)"),
        })
      ),
      execute: wrapExecute("move_department", currentScenarioId, onProgress),
    }),

    rename_department: tool({
      description: "Переименовать подразделение.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newName: z.string().describe("Новое название"),
        })
      ),
      execute: wrapExecute("rename_department", currentScenarioId, onProgress),
    }),

    delete_department: tool({
      description:
        "Удалить подразделение. Сотрудники будут перемещены к родителю или удалены.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: wrapExecute("delete_department", currentScenarioId, onProgress),
    }),

    move_employees: tool({
      description: "Переместить сотрудников в другое подразделение.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников"),
          targetDepartmentId: z.string().describe("ID целевого подразделения"),
        })
      ),
      execute: wrapExecute("move_employees", currentScenarioId, onProgress),
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
      execute: wrapExecute("create_gap_passport", currentScenarioId, onProgress),
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
      execute: wrapExecute("calculate_pnl", currentScenarioId, onProgress),
    }),

    list_scenarios: tool({
      description:
        "Получить список всех сценариев для выбора при сравнении или what-if.",
      inputSchema: zodSchema(z.object({})),
      execute: wrapExecute("list_scenarios", currentScenarioId, onProgress),
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
      execute: wrapExecute("run_whatif_scenario", currentScenarioId, onProgress),
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
      execute: wrapExecute("add_employee", currentScenarioId, onProgress),
    }),

    remove_employees: tool({
      description:
        "Удалить сотрудников из организации. Используй в what-if моделировании для сокращения штата.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников для удаления"),
        })
      ),
      execute: wrapExecute("remove_employees", currentScenarioId, onProgress),
    }),

    get_goals: tool({
      description:
        "Получить стратегические цели сценария (BSC + OKR). Фильтрация по типу перспективы и статусу. Возвращает дерево целей с KPI, владельцами и подразделениями.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          type: z.enum(["BSC_FINANCIAL", "BSC_CLIENT", "BSC_PROCESS", "BSC_LEARNING", "OKR"]).optional().describe("Фильтр по типу/перспективе BSC"),
          status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "AT_RISK", "FAILED"]).optional().describe("Фильтр по статусу"),
        })
      ),
      execute: wrapExecute("get_goals", currentScenarioId, onProgress),
    }),

    analyze_strategy: tool({
      description:
        "Анализ стратегического выравнивания: покрытие целей по перспективам BSC, цели без KPI, цели под угрозой, вовлечённость подразделений, средний прогресс по перспективам.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_strategy", currentScenarioId, onProgress),
    }),

    get_ohi: tool({
      description:
        "Получить Organization Health Index (OHI) — композитный индекс здоровья организации 0-100 с разбивкой по 7 компонентам: структурная эффективность, финансовое здоровье, процессная зрелость, компетентностная готовность, стратегическое выравнивание, операционная нагрузка, клиентская устойчивость.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_ohi", currentScenarioId, onProgress),
    }),

    generate_board_report: tool({
      description:
        "Сгенерировать текстовый отчёт о здоровье организации для совета директоров. Включает OHI score, разбивку по компонентам, ключевые метрики и рекомендации.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("generate_board_report", currentScenarioId, onProgress),
    }),

    get_clients: tool({
      description:
        "Получить список клиентов с контрактами, выручкой и количеством сделок в pipeline. Фильтрация по статусу.",
      inputSchema: zodSchema(
        z.object({
          status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE"]).optional().describe("Фильтр по статусу клиента"),
        })
      ),
      execute: wrapExecute("get_clients", currentScenarioId, onProgress),
    }),

    analyze_portfolio: tool({
      description:
        "Анализ клиентского портфеля: концентрация выручки (зависимость от top-клиентов), диверсификация, pipeline health, риски.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_portfolio", currentScenarioId, onProgress),
    }),

    get_pipeline: tool({
      description:
        "Получить сделки из воронки продаж (pipeline) сценария. Фильтрация по стадии и клиенту.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          stage: z.enum(["LEAD", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).optional().describe("Фильтр по стадии"),
          clientId: z.string().optional().describe("Фильтр по клиенту"),
        })
      ),
      execute: wrapExecute("get_pipeline", currentScenarioId, onProgress),
    }),
  };
}
