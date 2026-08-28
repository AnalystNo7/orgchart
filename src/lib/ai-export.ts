import { prisma } from "./db";
import { calculatePnl, type DepartmentPnlResult } from "./pnl-calculator";
import type { Decimal } from "@prisma/client/runtime/library";

// ----------------------------------------------------------------------------
// AI-export — собирает полный срез сценария в один markdown-файл, который
// удобно загружать в Claude Opus (или другую LLM) для свободного анализа.
//
// Структура отчёта:
// 1. Метаданные сценария + параметры выгрузки
// 2. Сводные ключевые метрики (FTE/cost/revenue/margin/utilization/span/overhead)
// 3. Агрегаты по шетилам (REVENUE / RESOURCE / SERVICE / BACKOFFICE)
// 4. Дерево оргструктуры (плоская таблица с depth + путь)
// 5. P&L по подразделениям в режиме «По FTE»
// 6. P&L по подразделениям в режиме «Трансфертная цена» (external/internal)
// 7. Потоки трансфертной цены (TP sells/purchases per contract per counterparty)
// 8. Сотрудники (анонимизированные: Employee #N, без ФИО; должность, FTE, costRate, tariff)
// 9. Договоры
// 10. Привязки EmployeeContract
// 11. Тарифы
// ----------------------------------------------------------------------------

type YearRange = { start: Date; end: Date };

function currentYearRange(): YearRange {
  const y = new Date().getFullYear();
  return {
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31),
  };
}

function toNum(d: Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Math.round(n)
  );
}

function fmtNum(n: number, frac = 2): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: frac,
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number, frac = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${fmtNum(n * 100, frac)}%`;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().split("T")[0];
}

function escapeMd(s: string | null | undefined): string {
  if (!s) return "";
  // Escape pipe and newlines for table cells, keep everything else as-is.
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

// ----------------------------------------------------------------------------

/**
 * Build the full AI-export markdown for a given scenario. Returns a plain
 * string that can be either served as a file download or persisted.
 *
 * Non-obvious decisions:
 *  - Employees are anonymized as "Employee #N" (stable across tables within
 *    a single export). Positions, FTE, tariffs and department links remain.
 *  - Both "fte" and "transfer" P&L modes are computed by calling
 *    calculatePnl() twice. This costs 2× the calculation but gives the LLM
 *    a full picture of both allocation methods and lets it compare per-department
 *    numbers side-by-side.
 *  - The report deliberately contains raw data (not pre-digested analysis)
 *    per user request: "only data, Opus will figure it out".
 */
export async function buildAiExportMarkdown(scenarioId: string): Promise<string> {
  const { start: periodStart, end: periodEnd } = currentYearRange();

  // 1. Fetch everything we need.
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      isBaseline: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const departments = await prisma.department.findMany({
    where: { scenarioId },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      parentId: true,
      name: true,
      shetilType: true,
      sortOrder: true,
      cfo: true,
    },
  });

  const employees = await prisma.employee.findMany({
    where: { scenarioId },
    orderBy: [{ departmentId: "asc" }, { fullName: "asc" }],
    include: {
      tariff: { select: { name: true, rate: true } },
      contracts: {
        select: {
          id: true,
          contractId: true,
          revenueStatus: true,
          fte: true,
          periodStart: true,
          periodEnd: true,
        },
        orderBy: { periodStart: "asc" },
      },
    },
  });

  const contracts = await prisma.contract.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });

  const tariffs = await prisma.tariff.findMany({
    orderBy: { name: "asc" },
  });

  // 2. Compute both P&L modes for the current year.
  const pnlFte = await calculatePnl(scenarioId, "combined", periodStart, periodEnd, "fte");
  const pnlTransfer = await calculatePnl(
    scenarioId,
    "combined",
    periodStart,
    periodEnd,
    "transfer"
  );

  const pnlFteById = new Map(pnlFte.map((r) => [r.departmentId, r]));
  const pnlTransferById = new Map(pnlTransfer.map((r) => [r.departmentId, r]));

  // Department lookups
  const deptById = new Map(departments.map((d) => [d.id, d]));
  function deptPath(deptId: string): string {
    const d = deptById.get(deptId);
    if (!d) return "?";
    return d.parentId ? `${deptPath(d.parentId)} / ${d.name}` : d.name;
  }
  function deptDepth(deptId: string): number {
    const d = deptById.get(deptId);
    if (!d || !d.parentId) return 0;
    return 1 + deptDepth(d.parentId);
  }

  // Anonymize employees: stable id Employee #N by sorted original id.
  const sortedEmpIds = [...employees]
    .map((e) => e.id)
    .sort((a, b) => a.localeCompare(b));
  const empAnonById = new Map<string, string>();
  sortedEmpIds.forEach((id, i) => empAnonById.set(id, `Employee #${i + 1}`));

  // Department employee counts + total FTE
  const empCountByDept = new Map<string, number>();
  const empFteByDept = new Map<string, number>();
  for (const e of employees) {
    empCountByDept.set(e.departmentId, (empCountByDept.get(e.departmentId) ?? 0) + 1);
    empFteByDept.set(
      e.departmentId,
      (empFteByDept.get(e.departmentId) ?? 0) + toNum(e.fte)
    );
  }

  // ------------------------------------------------------------------------
  // SECTION BUILDERS
  // ------------------------------------------------------------------------

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  // 1. Metadata
  push(`# OrgChart AI Export — ${escapeMd(scenario.name)}`);
  push();
  push(`> Срез сценария для загрузки в Claude Opus (или другую LLM) для свободного анализа.`);
  push(`> Данные анонимизированы: сотрудники обозначены как "Employee #N" без ФИО.`);
  push();
  push(`## 1. Metadata`);
  push();
  push(`| Поле | Значение |`);
  push(`|------|----------|`);
  push(`| Scenario ID | \`${scenario.id}\` |`);
  push(`| Название | ${escapeMd(scenario.name)} |`);
  push(`| Описание | ${escapeMd(scenario.description) || "—"} |`);
  push(`| Статус | ${scenario.status}${scenario.isBaseline ? " (baseline)" : ""} |`);
  push(`| Создан | ${fmtDate(scenario.createdAt)} |`);
  push(`| Обновлён | ${fmtDate(scenario.updatedAt)} |`);
  push(`| Период анализа | ${fmtDate(periodStart)} – ${fmtDate(periodEnd)} |`);
  push(`| Экспорт создан | ${new Date().toISOString()} |`);
  push();

  // 2. Key metrics (overall)
  const totalFte = employees.reduce((s, e) => s + toNum(e.fte), 0);
  const totalEmpCount = employees.length;
  const totalRevenueFte = pnlFte.reduce((s, r) => s + r.revenue, 0);
  const totalRevenueTransfer = pnlTransfer.reduce((s, r) => s + r.revenue, 0);
  const totalExternalRevenue = pnlTransfer.reduce(
    (s, r) => s + (r.transferBreakdown?.externalRevenue ?? 0),
    0
  );
  const totalInternalRevenue = pnlTransfer.reduce(
    (s, r) => s + (r.transferBreakdown?.internalRevenue ?? 0),
    0
  );
  const totalCostFte = pnlFte.reduce((s, r) => s + r.cost, 0);
  const totalCostTransfer = pnlTransfer.reduce((s, r) => s + r.cost, 0);
  const totalOwnCost = pnlTransfer.reduce(
    (s, r) => s + (r.transferBreakdown?.ownCost ?? r.cost),
    0
  );
  const pnlTotalFte = totalRevenueFte - totalCostFte;
  const pnlTotalTransfer = totalRevenueTransfer - totalCostTransfer;

  // PP utilization: PP = "Персонал Проекта" category
  const ppEmployees = employees.filter((e) => e.category === "PP");
  const ppWithContracts = ppEmployees.filter((e) => e.contracts.length > 0);
  const utilization = ppEmployees.length > 0
    ? ppWithContracts.length / ppEmployees.length
    : 0;

  // Average span of control: for each department with children, how many direct children it has
  const directChildrenCount = new Map<string, number>();
  for (const d of departments) {
    if (d.parentId) {
      directChildrenCount.set(
        d.parentId,
        (directChildrenCount.get(d.parentId) ?? 0) + 1
      );
    }
  }
  const spans = Array.from(directChildrenCount.values());
  const avgSpan = spans.length > 0 ? spans.reduce((s, v) => s + v, 0) / spans.length : 0;
  const maxSpan = spans.length > 0 ? Math.max(...spans) : 0;

  // Hierarchy depth
  const depths = departments.map((d) => deptDepth(d.id));
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

  // Overhead ratio: (SERVICE + BACKOFFICE FTE) / total FTE
  let overheadFte = 0;
  for (const e of employees) {
    const d = deptById.get(e.departmentId);
    if (d && (d.shetilType === "SERVICE" || d.shetilType === "BACKOFFICE")) {
      overheadFte += toNum(e.fte);
    }
  }
  const overheadRatio = totalFte > 0 ? overheadFte / totalFte : 0;

  push(`## 2. Key Metrics`);
  push();
  push(`| Метрика | Значение |`);
  push(`|---------|----------|`);
  push(`| Подразделений | ${departments.length} |`);
  push(`| Сотрудников (штатных единиц) | ${totalEmpCount} |`);
  push(`| Суммарный FTE | ${fmtNum(totalFte)} |`);
  push(`| Договоров (всех) | ${contracts.length} |`);
  push(`| Revenue (FTE mode) | ${fmtMoney(totalRevenueFte)} ₽ |`);
  push(`| Revenue (Transfer mode) | ${fmtMoney(totalRevenueTransfer)} ₽ |`);
  push(`| — External (contract.amount) | ${fmtMoney(totalExternalRevenue)} ₽ |`);
  push(`| — Internal (TP exchange) | ${fmtMoney(totalInternalRevenue)} ₽ |`);
  push(`| Cost (FTE mode) | ${fmtMoney(totalCostFte)} ₽ |`);
  push(`| Cost (Transfer mode) | ${fmtMoney(totalCostTransfer)} ₽ |`);
  push(`| — Own cost (без TP покупок) | ${fmtMoney(totalOwnCost)} ₽ |`);
  push(`| P&L (FTE mode) | ${fmtMoney(pnlTotalFte)} ₽ |`);
  push(`| P&L (Transfer mode) | ${fmtMoney(pnlTotalTransfer)} ₽ |`);
  push(
    `| Margin (FTE) | ${
      totalRevenueFte > 0 ? fmtPct(pnlTotalFte / totalRevenueFte) : "—"
    } |`
  );
  push(
    `| Revenue / FTE (FTE mode) | ${
      totalFte > 0 ? fmtMoney(totalRevenueFte / totalFte) : "—"
    } ₽ |`
  );
  push(
    `| Cost / FTE (FTE mode) | ${
      totalFte > 0 ? fmtMoney(totalCostFte / totalFte) : "—"
    } ₽ |`
  );
  push(
    `| Utilization (PP with contracts) | ${fmtPct(utilization)} (${ppWithContracts.length}/${ppEmployees.length}) |`
  );
  push(`| Avg span of control | ${fmtNum(avgSpan)} |`);
  push(`| Max span of control | ${maxSpan} |`);
  push(`| Max hierarchy depth | ${maxDepth} |`);
  push(`| Overhead ratio (SERVICE+BACKOFFICE FTE / total) | ${fmtPct(overheadRatio)} |`);
  push();
  push(
    `> **Инвариант:** Σ P&L на уровне всей организации совпадает в режимах "fte" и "transfer" — ` +
      `трансфертные взаиморасчёты полностью схлопываются на уровне группы. ` +
      `Если в твоих данных они не сходятся — ищи баги или сотрудников без тарифов в RESOURCE/SERVICE/BACKOFFICE.`
  );
  push();

  // 3. Shetil aggregates
  const shetilTypes = ["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"] as const;
  type ShetilAgg = {
    depts: number;
    fte: number;
    empCount: number;
    cost: number;
    revenueFte: number;
    revenueTransfer: number;
    pnlFte: number;
    pnlTransfer: number;
  };
  const byShetil = new Map<string, ShetilAgg>();
  for (const t of shetilTypes) {
    byShetil.set(t, {
      depts: 0,
      fte: 0,
      empCount: 0,
      cost: 0,
      revenueFte: 0,
      revenueTransfer: 0,
      pnlFte: 0,
      pnlTransfer: 0,
    });
  }
  for (const d of departments) {
    const agg = byShetil.get(d.shetilType);
    if (!agg) continue;
    agg.depts += 1;
    agg.empCount += empCountByDept.get(d.id) ?? 0;
    agg.fte += empFteByDept.get(d.id) ?? 0;

    const rFte = pnlFteById.get(d.id);
    if (rFte) {
      agg.revenueFte += rFte.revenue;
      agg.cost += rFte.cost; // cost is identical between modes (excluding internal TP buys)
      agg.pnlFte += rFte.pnl;
    }
    const rTp = pnlTransferById.get(d.id);
    if (rTp) {
      agg.revenueTransfer += rTp.revenue;
      agg.pnlTransfer += rTp.pnl;
    }
  }

  push(`## 3. Shetil Aggregates`);
  push();
  push(
    `| Type | Depts | Emp | FTE | %FTE | Cost (₽) | Revenue fte (₽) | Revenue tp (₽) | P&L fte (₽) | P&L tp (₽) |`
  );
  push(
    `|------|-------|-----|-----|------|----------|-----------------|----------------|-------------|------------|`
  );
  for (const t of shetilTypes) {
    const a = byShetil.get(t)!;
    const fteShare = totalFte > 0 ? a.fte / totalFte : 0;
    push(
      `| ${t} | ${a.depts} | ${a.empCount} | ${fmtNum(a.fte)} | ${fmtPct(fteShare)} | ${fmtMoney(a.cost)} | ${fmtMoney(a.revenueFte)} | ${fmtMoney(a.revenueTransfer)} | ${fmtMoney(a.pnlFte)} | ${fmtMoney(a.pnlTransfer)} |`
    );
  }
  push();

  // 4. Department hierarchy
  push(`## 4. Department Hierarchy`);
  push();
  push(`Плоская таблица с указанием depth (уровень от корня) и полного пути.`);
  push();
  push(
    `| id | parentId | depth | path | name | shetilType | sortOrder | FTE | employees |`
  );
  push(
    `|----|----------|-------|------|------|------------|-----------|-----|-----------|`
  );
  for (const d of departments) {
    push(
      `| \`${d.id}\` | ${d.parentId ? `\`${d.parentId}\`` : "—"} | ${deptDepth(d.id)} | ${escapeMd(deptPath(d.id))} | ${escapeMd(d.name)} | ${d.shetilType} | ${d.sortOrder} | ${fmtNum(empFteByDept.get(d.id) ?? 0)} | ${empCountByDept.get(d.id) ?? 0} |`
    );
  }
  push();

  // 5. P&L — FTE mode
  push(`## 5. P&L per Department — "По FTE" mode`);
  push();
  push(`Выручка договора распределяется между всеми подразделениями пропорционально FTE их сотрудников на контракте. Затраты = costRate × emp.fte × workingHours.`);
  push();
  push(
    `| id | name | shetilType | revenue (₽) | cost (₽) | P&L (₽) | margin | childrenPnl (₽) | totalPnl (₽) | warnings |`
  );
  push(
    `|----|------|------------|-------------|----------|---------|--------|-----------------|--------------|----------|`
  );
  for (const r of pnlFte) {
    const margin = r.revenue > 0 ? fmtPct((r.revenue - r.cost) / r.revenue) : "—";
    push(
      `| \`${r.departmentId}\` | ${escapeMd(r.departmentName)} | ${r.shetilType} | ${fmtMoney(r.revenue)} | ${fmtMoney(r.cost)} | ${fmtMoney(r.pnl)} | ${margin} | ${fmtMoney(r.childrenPnl)} | ${fmtMoney(r.totalPnl)} | ${r.warnings.length} |`
    );
  }
  push();

  // 6. P&L — Transfer mode
  push(`## 6. P&L per Department — "Трансфертная цена" mode`);
  push();
  push(
    `REVENUE-блоки получают contract.amount и несут затраты + внутренние покупки часов у ресурсных центров по тарифу. Ресурсные/сервисные/BO "продают" свои часы REVENUE-блокам пропорционально REVENUE-FTE на каждом контракте.`
  );
  push();
  push(
    `| id | name | shetilType | ext.revenue (₽) | int.revenue (₽) | total rev (₽) | own cost (₽) | int.cost (₽) | total cost (₽) | P&L (₽) | margin |`
  );
  push(
    `|----|------|------------|-----------------|-----------------|---------------|--------------|--------------|----------------|---------|--------|`
  );
  for (const r of pnlTransfer) {
    const br = r.transferBreakdown;
    const ext = br?.externalRevenue ?? 0;
    const int = br?.internalRevenue ?? 0;
    const own = br?.ownCost ?? r.cost;
    const intCost = br?.internalCost ?? 0;
    const margin = r.revenue > 0 ? fmtPct((r.revenue - r.cost) / r.revenue) : "—";
    push(
      `| \`${r.departmentId}\` | ${escapeMd(r.departmentName)} | ${r.shetilType} | ${fmtMoney(ext)} | ${fmtMoney(int)} | ${fmtMoney(r.revenue)} | ${fmtMoney(own)} | ${fmtMoney(intCost)} | ${fmtMoney(r.cost)} | ${fmtMoney(r.pnl)} | ${margin} |`
    );
  }
  push();

  // 7. Transfer price flows
  push(`## 7. Transfer Price Flows`);
  push();
  push(
    `Внутренние взаиморасчёты в режиме "Трансфертная цена". Каждая запись — сколько один блок "купил часы" у другого на конкретном договоре.`
  );
  push();
  push(`### 7.1 Sells (кто что продал)`);
  push();
  push(`| seller dept | seller shetil | contract | buyer dept | amount (₽) |`);
  push(`|-------------|---------------|----------|------------|------------|`);
  let totalSellAmount = 0;
  for (const r of pnlTransfer) {
    const sells = r.transferBreakdown?.sells ?? [];
    for (const flow of sells) {
      push(
        `| ${escapeMd(r.departmentName)} | ${r.shetilType} | ${escapeMd(flow.contractName)} | ${escapeMd(flow.counterpartyDepartmentName)} | ${fmtMoney(flow.amount)} |`
      );
      totalSellAmount += flow.amount;
    }
  }
  push();
  push(`**Итого проданных TP часов:** ${fmtMoney(totalSellAmount)} ₽`);
  push();
  push(`### 7.2 Purchases (кто что купил)`);
  push();
  push(`| buyer dept | buyer shetil | contract | seller dept | amount (₽) |`);
  push(`|------------|--------------|----------|-------------|------------|`);
  let totalPurchaseAmount = 0;
  for (const r of pnlTransfer) {
    const purchases = r.transferBreakdown?.purchases ?? [];
    for (const flow of purchases) {
      push(
        `| ${escapeMd(r.departmentName)} | ${r.shetilType} | ${escapeMd(flow.contractName)} | ${escapeMd(flow.counterpartyDepartmentName)} | ${fmtMoney(flow.amount)} |`
      );
      totalPurchaseAmount += flow.amount;
    }
  }
  push();
  push(`**Итого купленных TP часов:** ${fmtMoney(totalPurchaseAmount)} ₽`);
  push();
  push(
    `> Инвариант: Σ sells ≈ Σ purchases (копейки могут расходиться из-за округления). ` +
      `Если расхождение большое — проблема в алгоритме распределения.`
  );
  push();

  // 8. Employees (anonymized)
  push(`## 8. Employees (anonymized)`);
  push();
  push(
    `Сотрудники анонимизированы как "Employee #N". Порядковый номер стабилен в рамках этого экспорта, но не совпадает с id из БД.`
  );
  push();
  push(
    `| anonId | department | dept path | position | category | FTE | costRate (₽/ч) | tariff | contracts count |`
  );
  push(
    `|--------|------------|-----------|----------|----------|-----|----------------|--------|-----------------|`
  );
  for (const e of employees) {
    const anonId = empAnonById.get(e.id) ?? "?";
    const dept = deptById.get(e.departmentId);
    const deptName = dept?.name ?? "?";
    const path = deptPath(e.departmentId);
    push(
      `| ${anonId} | ${escapeMd(deptName)} | ${escapeMd(path)} | ${escapeMd(e.position)} | ${e.category} | ${fmtNum(toNum(e.fte))} | ${e.costRate != null ? fmtMoney(toNum(e.costRate)) : "—"} | ${e.tariff ? `${escapeMd(e.tariff.name)} (${fmtMoney(toNum(e.tariff.rate))} ₽/ч)` : "—"} | ${e.contracts.length} |`
    );
  }
  push();

  // 9. Contracts
  push(`## 9. Contracts`);
  push();
  push(
    `| id | name | type | status | amount (₽) | expectedAmount (₽) | period start | period end | employees count | description |`
  );
  push(
    `|----|------|------|--------|------------|--------------------|--------------|------------|-----------------|-------------|`
  );
  for (const c of contracts) {
    push(
      `| \`${c.id}\` | ${escapeMd(c.name)} | ${c.type} | ${c.status} | ${c.amount != null ? fmtMoney(toNum(c.amount)) : "—"} | ${c.expectedAmount != null ? fmtMoney(toNum(c.expectedAmount)) : "—"} | ${fmtDate(c.periodStart)} | ${fmtDate(c.periodEnd)} | ${c._count.employees} | ${escapeMd(c.description) || "—"} |`
    );
  }
  push();

  // 10. EmployeeContract links
  push(`## 10. EmployeeContract Links`);
  push();
  push(
    `Каждая запись — сотрудник на договоре за период с определённой долей FTE.`
  );
  push();
  push(
    `| employee | department | contract | revenueStatus | ec.fte | period start | period end |`
  );
  push(
    `|----------|------------|----------|---------------|--------|--------------|------------|`
  );
  // Build a map contractId → contractName for fast lookup
  const contractNameById = new Map(contracts.map((c) => [c.id, c.name]));
  for (const e of employees) {
    const anonId = empAnonById.get(e.id) ?? "?";
    const deptName = deptById.get(e.departmentId)?.name ?? "?";
    for (const ec of e.contracts) {
      const contractName = contractNameById.get(ec.contractId) ?? ec.contractId;
      push(
        `| ${anonId} | ${escapeMd(deptName)} | ${escapeMd(contractName)} | ${ec.revenueStatus} | ${fmtNum(toNum(ec.fte))} | ${fmtDate(ec.periodStart)} | ${fmtDate(ec.periodEnd)} |`
      );
    }
  }
  push();

  // 11. Tariffs
  push(`## 11. Tariffs`);
  push();
  push(`| name | rate (₽/ч) | description |`);
  push(`|------|------------|-------------|`);
  for (const t of tariffs) {
    push(
      `| ${escapeMd(t.name)} | ${fmtMoney(toNum(t.rate))} | ${escapeMd(t.description) || "—"} |`
    );
  }
  push();

  // Footer
  push(`---`);
  push();
  push(
    `_Generated by OrgChart on ${new Date().toISOString()} for scenario ${scenarioId}._`
  );
  push();

  return lines.join("\n");
}

// Helper for unit tests / other consumers: convert the result to a
// Blob-friendly UTF-8 Uint8Array. Not used by the API route, which returns
// the string directly.
export function markdownToUtf8Bytes(md: string): Uint8Array {
  return new TextEncoder().encode(md);
}

// Avoid unused import warning — DepartmentPnlResult is used for type inference
// in the sells/purchases loops above.
export type _AiExportPnlType = DepartmentPnlResult;
