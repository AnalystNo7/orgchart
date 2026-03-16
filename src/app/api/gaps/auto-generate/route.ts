import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { computeDiff } from "@/lib/diff";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import type { GapCategory, GapPriority } from "@prisma/client";

const GAP_CATEGORIES: GapCategory[] = ["STRUCTURE", "PROCESS", "RESOURCE", "COMPETENCY", "TECHNOLOGY"];
const GAP_PRIORITIES: GapPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

interface GeneratedGap {
  category: GapCategory;
  title: string;
  description: string;
  priority: GapPriority;
  impact: string;
  aiRationale: string;
  affectedDepartmentIds: string[];
  estimatedEffort: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scenarioId, asIsScenarioId, toBeScenarioId } = body;

  if (!scenarioId || !asIsScenarioId || !toBeScenarioId) {
    return Response.json(
      { error: "scenarioId, asIsScenarioId, and toBeScenarioId are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch both scenarios' data
    const [asIsScenario, toBeScenario] = await Promise.all([
      prisma.scenario.findUnique({ where: { id: asIsScenarioId }, select: { name: true } }),
      prisma.scenario.findUnique({ where: { id: toBeScenarioId }, select: { name: true } }),
    ]);

    if (!asIsScenario || !toBeScenario) {
      return Response.json({ error: "Сценарий не найден" }, { status: 404 });
    }

    // 2. Fetch departments with employees for both scenarios
    const [asIsDepts, toBeDepts, asIsEmployees, toBeEmployees] = await Promise.all([
      prisma.department.findMany({
        where: { scenarioId: asIsScenarioId },
        include: {
          head: { select: { fullName: true } },
          _count: { select: { employees: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.department.findMany({
        where: { scenarioId: toBeScenarioId },
        include: {
          head: { select: { fullName: true } },
          _count: { select: { employees: true, children: true } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.employee.findMany({
        where: { scenarioId: asIsScenarioId },
        select: { departmentId: true, category: true, fte: true },
      }),
      prisma.employee.findMany({
        where: { scenarioId: toBeScenarioId },
        select: { departmentId: true, category: true, fte: true },
      }),
    ]);

    // 3. Build metrics maps
    function buildMetrics(employees: typeof asIsEmployees) {
      const map = new Map<string, { pp: number; opp: number; aup: number; totalFte: number }>();
      for (const emp of employees) {
        const m = map.get(emp.departmentId) || { pp: 0, opp: 0, aup: 0, totalFte: 0 };
        const fte = Number(emp.fte);
        m.totalFte += fte;
        if (emp.category === "PP") m.pp += fte;
        else if (emp.category === "OPP") m.opp += fte;
        else if (emp.category === "AUP") m.aup += fte;
        map.set(emp.departmentId, m);
      }
      return map;
    }

    const asIsMetrics = buildMetrics(asIsEmployees);
    const toBeMetrics = buildMetrics(toBeEmployees);

    const toInput = (depts: typeof asIsDepts, metrics: typeof asIsMetrics) =>
      depts.map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parentId,
        shetilType: d.shetilType,
        originId: d.originId,
        head: d.head,
        _count: d._count,
        metrics: metrics.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 },
      }));

    // 4. Compute diff
    const { right: diffResult, summary } = computeDiff(
      toInput(asIsDepts, asIsMetrics),
      toInput(toBeDepts, toBeMetrics)
    );

    // 5. Build detailed comparison data for AI
    const changes = diffResult
      .filter((d) => d.diffStatus !== "unchanged")
      .map((d) => ({
        name: d.name,
        status: d.diffStatus,
        shetilType: d.shetilType,
        employees: d._count.employees,
        metrics: d.metrics,
        changes: d.changes,
      }));

    // Aggregate metrics
    const asIsTotalFte = asIsEmployees.reduce((s, e) => s + Number(e.fte), 0);
    const toBeTotalFte = toBeEmployees.reduce((s, e) => s + Number(e.fte), 0);
    const asIsAupFte = asIsEmployees.filter(e => e.category === "AUP").reduce((s, e) => s + Number(e.fte), 0);
    const toBeAupFte = toBeEmployees.filter(e => e.category === "AUP").reduce((s, e) => s + Number(e.fte), 0);

    const contextData = {
      asIs: {
        name: asIsScenario.name,
        departments: asIsDepts.length,
        employees: asIsEmployees.length,
        totalFte: Math.round(asIsTotalFte * 10) / 10,
        overheadRatio: asIsTotalFte > 0 ? `${Math.round((asIsAupFte / asIsTotalFte) * 100)}%` : "N/A",
      },
      toBe: {
        name: toBeScenario.name,
        departments: toBeDepts.length,
        employees: toBeEmployees.length,
        totalFte: Math.round(toBeTotalFte * 10) / 10,
        overheadRatio: toBeTotalFte > 0 ? `${Math.round((toBeAupFte / toBeTotalFte) * 100)}%` : "N/A",
      },
      summary,
      changes,
      asIsStructure: asIsDepts.map(d => ({
        name: d.name,
        shetilType: d.shetilType,
        parentId: d.parentId,
        employees: d._count.employees,
        metrics: asIsMetrics.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 },
      })),
      toBeStructure: toBeDepts.map(d => ({
        name: d.name,
        shetilType: d.shetilType,
        parentId: d.parentId,
        employees: d._count.employees,
        metrics: toBeMetrics.get(d.id) || { pp: 0, opp: 0, aup: 0, totalFte: 0 },
      })),
    };

    // 6. If no changes at all, return empty
    if (summary.added === 0 && summary.removed === 0 && summary.modified === 0 && summary.moved === 0) {
      return Response.json({ gaps: [], message: "Сценарии идентичны, разрывы не обнаружены" });
    }

    // 7. Build department ID lookup for toBe (to reference in affectedDepartmentIds)
    const toBeDeptByName = new Map<string, string>();
    for (const d of toBeDepts) {
      toBeDeptByName.set(d.name, d.id);
    }
    for (const d of asIsDepts) {
      if (!toBeDeptByName.has(d.name)) {
        toBeDeptByName.set(d.name, d.id);
      }
    }

    // 8. Call AI to generate gap passports
    const prompt = `Ты — эксперт по организационному дизайну и управлению изменениями в ИТ-интеграторе (500–2000 сотрудников).

Проанализируй различия между двумя сценариями оргструктуры и создай паспорта разрывов (gap passports).

## Данные сравнения

${JSON.stringify(contextData, null, 2)}

## Бенчмарки для ИТ-интеграторов
- Span of control (норма управляемости): 5–8 подчинённых
- Overhead ratio (доля АУП): 15–25%
- Оптимальная глубина иерархии: 3–4 уровня
- Доля зарабатывающих подразделений: 40–60% FTE

## Категории разрывов
- STRUCTURE — структурные изменения (добавление/удаление/перемещение подразделений, изменение иерархии)
- PROCESS — процессные разрывы (изменения в бизнес-процессах, потоках работы)
- RESOURCE — ресурсные разрывы (перераспределение людей, FTE, нехватка/избыток)
- COMPETENCY — компетентностные разрывы (потеря экспертизы, необходимость обучения)
- TECHNOLOGY — технологические разрывы (необходимость адаптации ИТ-систем)

## Приоритеты
- CRITICAL — блокирует переход, требует немедленного решения
- HIGH — существенно влияет на переход
- MEDIUM — важно, но не критично
- LOW — минимальное влияние

## Требования
1. Создай по одному паспорту разрыва для КАЖДОГО значимого отличия между сценариями
2. Используй ВСЕ 5 категорий, если применимо (не только STRUCTURE)
3. Для каждого структурного изменения подумай о сопутствующих процессных, ресурсных, компетентностных и технологических разрывах
4. Укажи конкретные цифры и метрики в описании
5. Описание и обоснование должны быть на русском языке

Ответь СТРОГО в формате JSON массива (без markdown, без обёртки):
[
  {
    "category": "STRUCTURE",
    "title": "Краткое название разрыва",
    "description": "Подробное описание: что есть (as-is) vs что должно быть (to-be)",
    "priority": "HIGH",
    "impact": "Конкретное влияние на бизнес",
    "aiRationale": "Обоснование: почему это разрыв и какой приоритет",
    "affectedDepartments": ["Название подразделения 1", "Название подразделения 2"],
    "estimatedEffort": "Оценка трудозатрат на устранение (например: 2-4 недели)"
  }
]`;

    const result = await generateText({
      model: getModel(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // 9. Parse AI response
    let generatedGaps: GeneratedGap[] = [];
    try {
      // Extract JSON from the response (handle possible markdown wrapping)
      let jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        throw new Error("Expected array");
      }

      generatedGaps = parsed
        .filter((g: Record<string, unknown>) => g.title && g.description && g.category && g.priority)
        .map((g: Record<string, unknown>) => ({
          category: GAP_CATEGORIES.includes(g.category as GapCategory) ? g.category as GapCategory : "STRUCTURE",
          title: String(g.title),
          description: String(g.description),
          priority: GAP_PRIORITIES.includes(g.priority as GapPriority) ? g.priority as GapPriority : "MEDIUM",
          impact: g.impact ? String(g.impact) : "",
          aiRationale: g.aiRationale ? String(g.aiRationale) : "",
          affectedDepartmentIds: Array.isArray(g.affectedDepartments)
            ? (g.affectedDepartments as string[])
                .map((name: string) => toBeDeptByName.get(name))
                .filter((id): id is string => !!id)
            : [],
          estimatedEffort: g.estimatedEffort ? String(g.estimatedEffort) : "",
        }));
    } catch (parseError) {
      console.error("[GAP_AUTO_GENERATE] Failed to parse AI response:", parseError, result.text);
      return Response.json(
        { error: "Не удалось разобрать ответ AI. Попробуйте ещё раз.", raw: result.text },
        { status: 500 }
      );
    }

    if (generatedGaps.length === 0) {
      return Response.json({ gaps: [], message: "AI не выявил значимых разрывов" });
    }

    // 10. Save gap passports to database
    const createdGaps = await Promise.all(
      generatedGaps.map((g) =>
        prisma.gapPassport.create({
          data: {
            scenarioId,
            asIsScenarioId,
            toBeScenarioId,
            category: g.category,
            title: g.title,
            description: g.description,
            priority: g.priority,
            impact: g.impact || null,
            affectedDepartmentIds: g.affectedDepartmentIds,
            estimatedEffort: g.estimatedEffort || null,
            aiGenerated: true,
            aiRationale: g.aiRationale || null,
          },
        })
      )
    );

    return Response.json({
      gaps: createdGaps,
      summary,
      message: `Создано ${createdGaps.length} паспортов разрывов`,
    });
  } catch (error) {
    console.error("[GAP_AUTO_GENERATE] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Ошибка генерации: ${message}` }, { status: 500 });
  }
}
