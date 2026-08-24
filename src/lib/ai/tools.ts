import { tool, zodSchema } from "ai";
import { z } from "zod";
import { executeTool } from "./tool-executor";
import {
  capToolResult,
  DEFAULT_TOOL_RESULT_MAX_BYTES,
} from "./tool-result-limit";
import { AI_RUN_CONTEXT_BUDGET_BYTES } from "./limits";

export type ToolProgressCallback = (toolName: string, step: string) => void;

/** Per-turn tool usage, aggregated for the [AI_DONE] summary line. */
export interface ToolRunStats {
  calls: number;
  totalMs: number;
  /** Repeat calls served from the per-run cache instead of the database. */
  cached: number;
  /** Bytes handed back to the model — the figure the context budget guards. */
  bytesOut: number;
}

export function createToolRunStats(): ToolRunStats {
  return { calls: 0, totalMs: 0, cached: 0, bytesOut: 0 };
}

/**
 * Tools that only read. Only these are cached within a run and only these are
 * cut off when the context budget runs out — blocking a mutation would break
 * what-if modelling mid-way, and caching one would serve stale data.
 * run_health_check writes AIInsight rows, so it belongs to the other camp.
 */
const READ_ONLY_TOOLS = new Set([
  "get_benchmarks",
  "query_knowledge_base",
  "analyze_skill_gaps",
  "get_competencies",
  "analyze_processes",
  "get_processes",
  "get_org_structure",
  "get_department_details",
  "get_org_metrics",
  "compare_scenarios",
  "calculate_pnl",
  "list_scenarios",
  "get_goals",
  "analyze_strategy",
  "get_ohi",
  "get_clients",
  "analyze_portfolio",
  "get_pipeline",
  "analyze_budget",
  "get_unit_economics",
  "get_insights",
]);

/**
 * Call arguments for the log, trimmed. Tool inputs are ids and filters — no
 * keys or personal data — but a full org-structure page of them is noise.
 */
function formatArgs(params: Record<string, unknown>): string {
  const raw = JSON.stringify(params ?? {});
  if (raw === "{}") return "";
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

function budgetExhaustedResult(budgetBytes: number): string {
  return JSON.stringify({
    error: "context_budget_exhausted",
    message:
      `Бюджет данных на этот ответ исчерпан (${budgetBytes} байт). ` +
      "Новые поштучные выборки недоступны. Используй агрегирующие инструменты " +
      "(get_org_metrics, run_health_check, get_insights, calculate_pnl) " +
      "или сделай вывод по уже полученным данным, честно указав, что они неполные.",
  });
}

function wrapExecute(
  name: string,
  currentScenarioId: string,
  onProgress?: ToolProgressCallback,
  maxBytes: number = DEFAULT_TOOL_RESULT_MAX_BYTES,
  stats?: ToolRunStats,
  cache?: Map<string, string>,
  contextBudgetBytes: number = AI_RUN_CONTEXT_BUDGET_BYTES
) {
  const cacheable = READ_ONLY_TOOLS.has(name);

  return async (params: Record<string, unknown>) => {
    const key = cacheable ? `${name}:${JSON.stringify(params)}` : null;

    // Budget first: results stay in the message history and are re-sent to the
    // model on every later step, so the sum is what times a turn out — not the
    // size of any single call. Refuse before touching the database.
    if (cacheable && stats && stats.bytesOut >= contextBudgetBytes) {
      const cachedHit = key ? cache?.get(key) : undefined;
      if (cachedHit === undefined) {
        console.log(
          `[AI_BUDGET] ${name} ${formatArgs(params)} отказ — исчерпан бюджет` +
            ` ${contextBudgetBytes}B (набрано ${stats.bytesOut}B)`
        );
        return budgetExhaustedResult(contextBudgetBytes);
      }
    }

    // The model cannot know nextOffset before the first result comes back, so
    // parallel calls to a paged tool land on identical arguments. Serve those
    // from memory instead of re-querying.
    if (key) {
      const hit = cache?.get(key);
      if (hit !== undefined) {
        if (stats) {
          stats.calls += 1;
          stats.cached += 1;
        }
        onProgress?.(name, "started");
        onProgress?.(name, "completed");
        console.log(
          `[AI_TOOL] ${name} ${formatArgs(params)} 0ms → ${Buffer.byteLength(hit, "utf8")}B (cached)`
        );
        return hit;
      }
    }

    onProgress?.(name, "started");
    const startedAt = Date.now();
    const result = await executeTool(name, params, currentScenarioId, onProgress);
    const ms = Date.now() - startedAt;
    onProgress?.(name, "completed");
    // Keep the result inside the provider's per-block limit; oversized results
    // are paged with an explicit hint instead of blowing up the request.
    const capped = capToolResult(result, maxBytes);
    const rawBytes = Buffer.byteLength(result ?? "", "utf8");
    const outBytes = Buffer.byteLength(capped ?? "", "utf8");
    if (stats) {
      stats.calls += 1;
      stats.totalMs += ms;
      stats.bytesOut += outBytes;
    }
    if (key) cache?.set(key, capped);
    // Timing + size: tells apart "slow tool" from "slow model" when a chat
    // turn times out, and shows whether capToolResult had to page the result.
    console.log(
      `[AI_TOOL] ${name} ${formatArgs(params)} ${ms}ms → ${outBytes}B` +
        (outBytes < rawBytes ? ` (paged from ${rawBytes}B)` : "")
    );
    return capped;
  };
}

export function buildTools(
  currentScenarioId: string,
  onProgress?: ToolProgressCallback,
  toolResultMaxBytes: number = DEFAULT_TOOL_RESULT_MAX_BYTES,
  stats?: ToolRunStats,
  contextBudgetBytes: number = AI_RUN_CONTEXT_BUDGET_BYTES
) {
  // Lives exactly one run: buildTools is called once per chat turn.
  const cache = new Map<string, string>();

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
      execute: wrapExecute("get_benchmarks", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("query_knowledge_base", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("analyze_skill_gaps", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_competencies: tool({
      description:
        "Получить список компетенций с категориями и количеством привязок к ролям/сотрудникам.",
      inputSchema: zodSchema(z.object({})),
      execute: wrapExecute("get_competencies", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    analyze_processes: tool({
      description:
        "Анализ бизнес-процессов сценария: найти процессы без владельца, без участников RACI, дублирование, пробелы в покрытии подразделений. Возвращает структурированный отчёт.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_processes", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_processes: tool({
      description:
        "Получить список бизнес-процессов сценария с KPI и RACI-участниками.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_processes", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_org_structure: tool({
      description:
        "ТЯЖЁЛЫЙ инструмент: поштучный список подразделений, постранично. " +
        "Для общих метрик по организации бери get_org_metrics, для поиска проблем — run_health_check; " +
        "get_org_structure нужен только когда требуется конкретный перечень подразделений. " +
        "НЕ вызывай его несколько раз параллельно: nextOffset становится известен только из предыдущего ответа. " +
        "Формат ответа колоночный: columns — имена полей через запятую, rows — массив строк-массивов в том же порядке. " +
        "Поля: id, name, parentId, type (ШЕТИЛ), emp (число сотрудников), children (число дочерних), " +
        "hasHead (1 — руководитель назначен, 0 — нет), pp/opp/aup (FTE по категориям), fte (всего FTE).",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария. Если не указан — используется текущий."),
          offset: z.number().optional().describe("Смещение для постраничной выдачи (по умолчанию 0). Используй nextOffset из предыдущего ответа."),
          limit: z.number().optional().describe("Сколько подразделений вернуть (по умолчанию 200)."),
        })
      ),
      execute: wrapExecute("get_org_structure", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_department_details: tool({
      description:
        "Получить детальную информацию о конкретном подразделении: список сотрудников, дочерние подразделения, руководитель.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: wrapExecute("get_department_details", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_org_metrics: tool({
      description:
        "Рассчитать агрегированные метрики оргструктуры: span of control, overhead ratio (доля АУП), распределение FTE по категориям, глубина иерархии, количество подразделений по типам.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_org_metrics", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("compare_scenarios", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("clone_scenario", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("create_department", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    move_department: tool({
      description: "Переместить подразделение к другому родителю.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newParentId: z.string().optional().describe("ID нового родителя (null для корня)"),
        })
      ),
      execute: wrapExecute("move_department", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    rename_department: tool({
      description: "Переименовать подразделение.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
          newName: z.string().describe("Новое название"),
        })
      ),
      execute: wrapExecute("rename_department", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    delete_department: tool({
      description:
        "Удалить подразделение. Сотрудники будут перемещены к родителю или удалены.",
      inputSchema: zodSchema(
        z.object({
          departmentId: z.string().describe("ID подразделения"),
        })
      ),
      execute: wrapExecute("delete_department", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    move_employees: tool({
      description: "Переместить сотрудников в другое подразделение.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников"),
          targetDepartmentId: z.string().describe("ID целевого подразделения"),
        })
      ),
      execute: wrapExecute("move_employees", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("create_gap_passport", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    calculate_pnl: tool({
      description:
        "Рассчитать P&L (прибыли и убытки) для сценария. Возвращает доход, расход и маржинальность по подразделениям. Поддерживает три метода аллокации выручки: fte (делить между всеми подразделениями пропорционально FTE — целевой режим), transfer (трансфертная цена Tariff.rate × FTE × часы), earning (только REVENUE-подразделения, baseline).",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
          mode: z
            .enum(["forecast", "plan", "combined"])
            .optional()
            .describe("Режим расчёта: forecast (факт), plan (план), combined (оба)"),
          allocationMode: z
            .enum(["fte", "transfer", "earning"])
            .optional()
            .describe(
              "Метод аллокации выручки: fte (целевой, пропорционально FTE), transfer (трансфертная цена по тарифу), earning (только зарабатывающие подразделения). По умолчанию fte."
            ),
          periodStart: z.string().optional().describe("Начало периода (ISO date)"),
          periodEnd: z.string().optional().describe("Конец периода (ISO date)"),
        })
      ),
      execute: wrapExecute("calculate_pnl", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    list_scenarios: tool({
      description:
        "Получить список всех сценариев для выбора при сравнении или what-if.",
      inputSchema: zodSchema(z.object({})),
      execute: wrapExecute("list_scenarios", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("run_whatif_scenario", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("add_employee", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    remove_employees: tool({
      description:
        "Удалить сотрудников из организации. Используй в what-if моделировании для сокращения штата.",
      inputSchema: zodSchema(
        z.object({
          employeeIds: z.array(z.string()).describe("Массив ID сотрудников для удаления"),
        })
      ),
      execute: wrapExecute("remove_employees", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("get_goals", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    analyze_strategy: tool({
      description:
        "Анализ стратегического выравнивания: покрытие целей по перспективам BSC, цели без KPI, цели под угрозой, вовлечённость подразделений, средний прогресс по перспективам.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_strategy", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_ohi: tool({
      description:
        "Получить Organization Health Index (OHI) — композитный индекс здоровья организации 0-100 с разбивкой по 7 компонентам: структурная эффективность, финансовое здоровье, процессная зрелость, компетентностная готовность, стратегическое выравнивание, операционная нагрузка, клиентская устойчивость.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_ohi", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    generate_board_report: tool({
      description:
        "Сгенерировать текстовый отчёт о здоровье организации для совета директоров. Включает OHI score, разбивку по компонентам, ключевые метрики и рекомендации.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("generate_board_report", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_clients: tool({
      description:
        "Получить список клиентов с контрактами, выручкой и количеством сделок в pipeline. Фильтрация по статусу.",
      inputSchema: zodSchema(
        z.object({
          status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE"]).optional().describe("Фильтр по статусу клиента"),
        })
      ),
      execute: wrapExecute("get_clients", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    analyze_portfolio: tool({
      description:
        "Анализ клиентского портфеля: концентрация выручки (зависимость от top-клиентов), диверсификация, pipeline health, риски.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_portfolio", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
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
      execute: wrapExecute("get_pipeline", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    analyze_budget: tool({
      description:
        "Анализ бюджетов сценария: план vs факт по подразделениям, отклонения, CapEx/OpEx разбивка.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("analyze_budget", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_unit_economics: tool({
      description:
        "Unit-экономика: revenue/FTE, cost/FTE, маржинальность, утилизация ПП по подразделениям.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_unit_economics", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    run_health_check: tool({
      description:
        "Запустить проактивный анализ здоровья организации. Выявляет аномалии, отклонения от бенчмарков, риски по всем слоям (структура, финансы, процессы, компетенции, стратегия, операции, заказчики). Генерирует инсайты и рекомендации.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("run_health_check", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),

    get_insights: tool({
      description:
        "Получить текущие AI-инсайты (проблемы, предупреждения, рекомендации) для сценария.",
      inputSchema: zodSchema(
        z.object({
          scenarioId: z.string().optional().describe("ID сценария"),
        })
      ),
      execute: wrapExecute("get_insights", currentScenarioId, onProgress, toolResultMaxBytes, stats, cache, contextBudgetBytes),
    }),
  };
}
