/**
 * Local Query Processor — обработка запросов без внешней LLM
 * Keyword matching + шаблонный движок для бенчмарков, автосравнения и KB search
 */

import { getBenchmarks, listAvailableMetrics, type BenchmarkCategory } from "@/lib/ai/benchmarks";
import { prisma } from "@/lib/db";
import { calculatePnl } from "@/lib/pnl-calculator";
import { retrieveChunks, formatRetrievalContext } from "@/lib/rag";

export interface LocalQueryResult {
  handled: boolean;
  response: string;
  sources: Array<{ type: "OSINT" | "KB"; label: string }>;
}

interface DetectedIntent {
  type: "benchmarks" | "deviations" | "kb_search" | "unknown";
  params: Record<string, string | undefined>;
}

/**
 * Попытка обработать запрос локально без LLM.
 * Возвращает handled=true если запрос обработан, иначе handled=false.
 */
export async function processLocalQuery(
  query: string,
  scenarioId: string
): Promise<LocalQueryResult> {
  const intent = detectIntent(query);

  switch (intent.type) {
    case "benchmarks":
      return handleBenchmarks(intent.params);
    case "deviations":
      return handleDeviations(scenarioId);
    case "kb_search":
      return await handleKbSearch(intent.params.searchQuery || query);
    default:
      return { handled: false, response: "", sources: [] };
  }
}

function detectIntent(query: string): DetectedIntent {
  const q = query.toLowerCase();

  // Deviations / problems / what's wrong
  const deviationKeywords = [
    "не в норме", "отклонен", "проблем", "что плохо", "что не так",
    "нарушен", "выход за", "за пределами", "аномал", "не соответств",
    "диагностик", "здоровье", "оценка", "аудит структур",
  ];
  if (deviationKeywords.some((kw) => q.includes(kw))) {
    return { type: "deviations", params: {} };
  }

  // KB search
  const kbKeywords = [
    "база знаний", "документ", "найди в", "поиск по", "в документах",
    "регламент", "методолог", "фреймворк", "минцберг", "mckinsey",
    "mckинзи", "apqc", "raci", "bsc", "okr", "коттер", "adkar",
    "галбрейт", "гэлбрейт",
  ];
  if (kbKeywords.some((kw) => q.includes(kw))) {
    // Extract search query — remove KB keywords
    const searchQuery = query;
    return { type: "kb_search", params: { searchQuery } };
  }

  // Benchmarks
  const benchmarkKeywords = [
    "бенчмарк", "benchmark", "норматив", "норма ", "эталон",
    "стандарт отрасл", "отраслев", "span of control", "span",
    "overhead", "текучесть", "утилизац", "маржинальн", "revenue per",
    "выручка на", "стоимость найма", "стоимость сотрудник",
  ];
  if (benchmarkKeywords.some((kw) => q.includes(kw))) {
    // Detect industry
    let industry: string | undefined;
    if (q.includes("it") || q.includes("ит-") || q.includes("ит ") || q.includes("айти")) {
      if (q.includes("продукт")) industry = "IT-продуктовые";
      else if (q.includes("аутсорс")) industry = "IT-аутсорсинг";
      else if (q.includes("консалт")) industry = "IT-консалтинг";
      else industry = "IT-интеграторы";
    } else if (q.includes("нефт") || q.includes("газ")) {
      industry = "Нефтегаз";
    } else if (q.includes("производств")) {
      industry = "Производство";
    }

    // Detect category
    let category: string | undefined;
    if (q.includes("hr") || q.includes("персонал") || q.includes("текучесть") || q.includes("найм")) {
      category = "hr";
    } else if (q.includes("финанс") || q.includes("маржа") || q.includes("revenue") || q.includes("выручка") || q.includes("ebitda")) {
      category = "financial";
    } else if (q.includes("структур") || q.includes("span") || q.includes("overhead") || q.includes("иерархи")) {
      category = "org_design";
    }

    return { type: "benchmarks", params: { industry, category } };
  }

  return { type: "unknown", params: {} };
}

function handleBenchmarks(params: Record<string, string | undefined>): LocalQueryResult {
  const benchmarks = getBenchmarks({
    category: params.category as BenchmarkCategory | undefined,
    industry: params.industry,
  });

  if (benchmarks.length === 0) {
    const allMetrics = listAvailableMetrics();
    return {
      handled: true,
      response: `Бенчмарки не найдены по заданным фильтрам.\n\nДоступные метрики:\n${allMetrics.map((m) => `- **${m.description}** (${m.metric})`).join("\n")}`,
      sources: [],
    };
  }

  const categoryLabel = params.category
    ? { org_design: "Оргдизайн", financial: "Финансы", hr: "HR" }[params.category] || params.category
    : "Все категории";
  const industryLabel = params.industry || "Все отрасли";

  let table = `### Бенчмарки: ${categoryLabel} / ${industryLabel}\n\n`;
  table += "| Метрика | Мин | Оптимум | Макс | Ед. | Источник |\n";
  table += "|---------|-----|---------|------|-----|----------|\n";

  const sources = new Set<string>();
  for (const b of benchmarks) {
    table += `| ${b.description} | ${b.min} | **${b.optimal}** | ${b.max} | ${b.unit} | ${b.source} 【OSINT: ${b.source}】|\n`;
    sources.add(b.source);
  }

  return {
    handled: true,
    response: table,
    sources: Array.from(sources).map((s) => ({ type: "OSINT" as const, label: s })),
  };
}

async function handleDeviations(scenarioId: string): Promise<LocalQueryResult> {
  // Get org metrics
  const departments = await prisma.department.findMany({
    where: { scenarioId },
    include: { _count: { select: { employees: true, children: true } } },
  });

  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    select: { category: true, fte: true, departmentId: true },
  });

  const totalFte = employees.reduce((s, e) => s + Number(e.fte), 0);
  const aupFte = employees.filter((e) => e.category === "AUP").reduce((s, e) => s + Number(e.fte), 0);
  const ppFte = employees.filter((e) => e.category === "PP").reduce((s, e) => s + Number(e.fte), 0);

  // Span of control
  const depsWithSubs = departments.filter((d) => d._count.children > 0 || d._count.employees > 0);
  const spans = depsWithSubs.map((d) => d._count.employees + d._count.children);
  const avgSpan = spans.length > 0
    ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
    : 0;

  // Hierarchy depth
  const parentMap = new Map(departments.map((d) => [d.id, d.parentId]));
  function getDepth(id: string): number {
    const parentId = parentMap.get(id);
    if (!parentId) return 0;
    return 1 + getDepth(parentId);
  }
  const maxDepth = departments.length > 0 ? Math.max(...departments.map((d) => getDepth(d.id))) : 0;

  const overheadRatio = totalFte > 0 ? Math.round((aupFte / totalFte) * 100 * 10) / 10 : 0;

  // Revenue dept share
  const revenueDeptIds = new Set(departments.filter((d) => d.shetilType === "REVENUE").map((d) => d.id));
  const revenueFte = employees
    .filter((e) => revenueDeptIds.has(e.departmentId))
    .reduce((s, e) => s + Number(e.fte), 0);
  const revenueDeptShare = totalFte > 0 ? Math.round((revenueFte / totalFte) * 100 * 10) / 10 : 0;

  // Compare with benchmarks
  const benchmarks = getBenchmarks({ category: "org_design", industry: "IT-интеграторы" });
  const deviations: Array<{ metric: string; current: number; min: number; max: number; optimal: number; unit: string; source: string; status: string }> = [];

  const metricMap: Record<string, number> = {
    span_of_control: avgSpan,
    overhead_ratio: overheadRatio,
    hierarchy_depth: maxDepth,
    revenue_dept_share: revenueDeptShare,
  };

  for (const b of benchmarks) {
    const current = metricMap[b.metric];
    if (current === undefined) continue;
    let status: string;
    if (current < b.min) status = "НИЖЕ НОРМЫ";
    else if (current > b.max) status = "ВЫШЕ НОРМЫ";
    else status = "В НОРМЕ";

    deviations.push({
      metric: b.description,
      current,
      min: b.min,
      max: b.max,
      optimal: b.optimal,
      unit: b.unit,
      source: b.source,
      status,
    });
  }

  // P&L metrics
  let revenuePerFte: number | null = null;
  try {
    const now = new Date();
    const pnlResults = await calculatePnl(scenarioId, "combined", new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31));
    const totalRevenue = pnlResults.reduce((s, r) => s + r.revenue, 0);
    if (totalRevenue > 0 && totalFte > 0) {
      revenuePerFte = Math.round(totalRevenue / totalFte);
    }
  } catch {
    // P&L not available
  }

  if (revenuePerFte !== null) {
    const finBenchmarks = getBenchmarks({ metric: "revenue_per_fte", industry: "IT-интеграторы" });
    for (const b of finBenchmarks) {
      let status: string;
      if (revenuePerFte < b.min) status = "НИЖЕ НОРМЫ";
      else if (revenuePerFte > b.max) status = "ВЫШЕ НОРМЫ";
      else status = "В НОРМЕ";
      deviations.push({
        metric: b.description,
        current: revenuePerFte,
        min: b.min,
        max: b.max,
        optimal: b.optimal,
        unit: b.unit,
        source: b.source,
        status,
      });
    }
  }

  // Format response
  const problems = deviations.filter((d) => d.status !== "В НОРМЕ");
  const normals = deviations.filter((d) => d.status === "В НОРМЕ");

  let response = `### Диагностика: сравнение с бенчмарками (IT-интеграторы)\n\n`;
  response += `**Сотрудников:** ${employees.length} (${totalFte} FTE) | **Подразделений:** ${departments.length}\n\n`;

  if (problems.length > 0) {
    response += `#### Отклонения (${problems.length})\n\n`;
    response += "| Метрика | У вас | Норма | Статус | Источник |\n";
    response += "|---------|-------|-------|--------|----------|\n";
    for (const d of problems) {
      const icon = d.status === "НИЖЕ НОРМЫ" ? "⬇️" : "⬆️";
      response += `| ${d.metric} | **${d.current}** ${d.unit} | ${d.min}–${d.max} (опт. ${d.optimal}) | ${icon} ${d.status} | 【OSINT: ${d.source}】|\n`;
    }
    response += "\n";
  }

  if (normals.length > 0) {
    response += `#### В норме (${normals.length})\n\n`;
    response += "| Метрика | У вас | Норма | Источник |\n";
    response += "|---------|-------|-------|----------|\n";
    for (const d of normals) {
      response += `| ${d.metric} | **${d.current}** ${d.unit} | ${d.min}–${d.max} | 【OSINT: ${d.source}】|\n`;
    }
  }

  if (problems.length === 0) {
    response += "\n**Все метрики в пределах отраслевых норм.**\n";
  }

  const sources = [...new Set(deviations.map((d) => d.source))].map((s) => ({ type: "OSINT" as const, label: s }));
  return { handled: true, response, sources };
}

async function handleKbSearch(query: string): Promise<LocalQueryResult> {
  try {
    const results = await retrieveChunks(query, 5);

    if (results.length === 0) {
      return {
        handled: true,
        response: "В базе знаний не найдено релевантных документов по вашему запросу.\n\nЗагрузите документы на странице **База знаний** (/knowledge).",
        sources: [],
      };
    }

    let response = `### Результаты поиска в базе знаний\n\n`;
    const sources: Array<{ type: "KB"; label: string }> = [];

    for (const r of results) {
      response += `---\n**${r.documentTitle}** (совпадение: ${(r.similarity * 100).toFixed(1)}%) 【KB: ${r.documentTitle}】\n\n`;
      response += `${r.content}\n\n`;
      sources.push({ type: "KB", label: r.documentTitle });
    }

    return { handled: true, response, sources: [...new Map(sources.map((s) => [s.label, s])).values()] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("VOYAGE_API_KEY")) {
      return {
        handled: true,
        response: "Для поиска по базе знаний необходим VOYAGE_API_KEY. Добавьте его в .env файл.",
        sources: [],
      };
    }
    return { handled: false, response: "", sources: [] };
  }
}
