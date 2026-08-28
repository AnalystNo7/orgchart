import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import { getWorkingHours } from "./work-calendar";
import type { Decimal } from "@prisma/client/runtime/library";

export type PnlMode = "forecast" | "plan" | "combined";

/**
 * Revenue allocation method.
 * - "earning":  Only REVENUE-type departments earn revenue. Resource/service
 *               departments accrue costs only. This is the baseline used on the
 *               dashboard.
 * - "fte":      Contract revenue is split between all departments proportionally
 *               to the FTE their employees contribute via EmployeeContract links.
 * - "transfer": Resource/service departments "sell" FTE to earning ones at an
 *               internal transfer price = Tariff.rate × FTE-часы обеспечения в окне.
 *               The Contract.amount field is ignored in this mode.
 */
export type PnlAllocationMode = "earning" | "fte" | "transfer";

export interface EmployeeCostDetail {
  employeeId: string;
  fullName: string;
  position: string;
  costRate: number;
  fte: number;
  workingHours: number;
  totalCost: number;
}

export interface ContractRevenueDetail {
  contractId: string;
  contractName: string;
  status: string;
  totalAmount: number;
  periodOverlapFraction: number;
  departmentFteFraction: number;
  allocatedRevenue: number;
}

/**
 * A single internal TP sale or purchase between two departments on a specific
 * contract. Used only in allocationMode = "transfer".
 */
export interface TransferFlow {
  contractId: string;
  contractName: string;
  counterpartyDepartmentId: string;
  counterpartyDepartmentName: string;
  amount: number;
}

/**
 * Breakdown of transfer-pricing internals for a department. Populated only
 * when allocationMode = "transfer". Allows the drill-down UI to show
 * external vs internal revenue/cost and per-contract TP flows.
 */
export interface TransferBreakdown {
  externalRevenue: number; // revenue from contract.amount (REVENUE blocks only)
  internalRevenue: number; // revenue from selling hours at TP (non-REVENUE blocks)
  ownCost: number; // costRate × emp.fte × hours (same for all modes)
  internalCost: number; // cost from buying hours at TP (REVENUE blocks only)
  sells: TransferFlow[]; // for non-REVENUE blocks: who bought our hours
  purchases: TransferFlow[]; // for REVENUE blocks: from whom we bought hours
}

export interface DepartmentPnlResult {
  departmentId: string;
  departmentName: string;
  shetilType: string;
  isEarning: boolean;
  revenue: number;
  cost: number;
  pnl: number;
  employeeDetails: EmployeeCostDetail[];
  contractDetails: ContractRevenueDetail[];
  warnings: Array<{ employeeId: string; fullName: string; message: string }>;
  childrenPnl: number; // aggregated from children
  totalPnl: number; // own pnl + children pnl
  transferBreakdown?: TransferBreakdown; // populated only for allocationMode = "transfer"
}

function toNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Shape of a department returned by the Prisma query below. Extracted into
 * a type alias so helper functions (the transfer allocator) can accept it.
 */
type DepartmentWithEmployees = Prisma.DepartmentGetPayload<{
  include: {
    employees: {
      include: {
        tariff: true;
        contracts: { include: { contract: true } };
      };
    };
  };
}>;

/**
 * Рабочие часы пересечения периода привязки (обеспечения) с окном расчёта.
 * 0 при пустом пересечении. Мера вклада привязки — «FTE-часы»: fte × эти часы;
 * так 12 помесячных строк по 0.5 FTE весят столько же, сколько одна годовая.
 */
function linkWindowHours(
  start: Date,
  end: Date,
  winStart: Date,
  winEnd: Date
): number {
  const s = start > winStart ? start : winStart;
  const e = end < winEnd ? end : winEnd;
  if (s > e) return 0;
  return getWorkingHours(s, e);
}

/**
 * Check whether a contract should be included given the current PnlMode filter.
 * "forecast" = concluded only; "plan" = planned only; "combined" = both.
 */
function isContractIncludedInMode(status: string, mode: PnlMode): boolean {
  if (mode === "forecast" && status !== "CONCLUDED") return false;
  if (mode === "plan" && status !== "PLANNED") return false;
  return true;
}

// --- Transfer-mode allocator --------------------------------------------------
// The transfer-pricing branch needs contract-first iteration (not department-first),
// because revenue of one department depends on non-revenue participants of the
// same contract. We precompute all internal flows in one pass, then the main
// department loop just reads from these maps.

type TransferCtxMaps = {
  externalRevenueByDept: Map<string, number>;
  internalRevenueByDept: Map<string, number>;
  internalCostByDept: Map<string, number>;
  // Keyed by deptId, then by `${contractId}__${counterpartyDeptId}` for aggregation.
  sellsByDept: Map<string, Map<string, TransferFlow>>;
  purchasesByDept: Map<string, Map<string, TransferFlow>>;
  // Per-department warnings about employees without tariff (merged into the
  // department's regular warnings in the main loop).
  warningsByDept: Map<
    string,
    Array<{ employeeId: string; fullName: string; message: string }>
  >;
  // Per-department list of external (contract.amount based) revenue details.
  // Replaces the on-the-fly contractDetails calculation for transfer mode.
  externalContractDetailsByDept: Map<string, ContractRevenueDetail[]>;
};

function emptyTransferCtx(): TransferCtxMaps {
  return {
    externalRevenueByDept: new Map(),
    internalRevenueByDept: new Map(),
    internalCostByDept: new Map(),
    sellsByDept: new Map(),
    purchasesByDept: new Map(),
    warningsByDept: new Map(),
    externalContractDetailsByDept: new Map(),
  };
}

function addTransferFlow(
  byDept: Map<string, Map<string, TransferFlow>>,
  deptId: string,
  contractId: string,
  contractName: string,
  counterpartyDeptId: string,
  counterpartyDeptName: string,
  amount: number
) {
  if (amount === 0) return;
  let perDept = byDept.get(deptId);
  if (!perDept) {
    perDept = new Map();
    byDept.set(deptId, perDept);
  }
  const key = `${contractId}__${counterpartyDeptId}`;
  const existing = perDept.get(key);
  if (existing) {
    existing.amount += amount;
  } else {
    perDept.set(key, {
      contractId,
      contractName,
      counterpartyDepartmentId: counterpartyDeptId,
      counterpartyDepartmentName: counterpartyDeptName,
      amount,
    });
  }
}

function addToMap(m: Map<string, number>, key: string, delta: number) {
  if (delta === 0) return;
  m.set(key, (m.get(key) ?? 0) + delta);
}

/**
 * Compute all transfer-mode allocations for a scenario in one contract-first pass.
 *
 * Invariant: Σ (externalRevenue + internalRevenue − internalCost) across all departments
 * equals Σ (amount × overlap) across all eligible contracts. Combined with the
 * department-agnostic cost calculation, this guarantees that the total P&L
 * across the whole organization equals the total P&L under allocationMode = "fte".
 */
function computeTransferAllocations(
  departments: DepartmentWithEmployees[],
  mode: PnlMode,
  periodStart: Date,
  periodEnd: Date
): TransferCtxMaps {
  const ctx = emptyTransferCtx();

  // Quick lookup: deptId -> {name, shetilType}
  const deptInfo = new Map<string, { name: string; shetilType: string }>();
  for (const d of departments) {
    deptInfo.set(d.id, { name: d.name, shetilType: d.shetilType });
  }

  // Invert the data: group all EmployeeContract rows by contractId. Each entry
  // carries the minimum we need for allocation maths.
  type Participant = {
    deptId: string;
    deptName: string;
    shetilType: string;
    employeeId: string;
    fullName: string;
    /** FTE-часы привязок сотрудника, попавшие в отчётное окно. */
    winFH: number;
    tariffRate: number | null;
  };
  type ContractGroup = {
    contract: DepartmentWithEmployees["employees"][number]["contracts"][number]["contract"];
    participants: Participant[];
  };
  const contractGroups = new Map<string, ContractGroup>();

  // FTE-часы за весь срок обеспечения — знаменатель признания суммы.
  const lifeFHByContract = new Map<string, number>();

  for (const dept of departments) {
    const info = deptInfo.get(dept.id)!;
    for (const emp of dept.employees) {
      for (const ec of emp.contracts) {
        const contract = ec.contract;
        if (!isContractIncludedInMode(contract.status, mode)) continue;
        if (contract.type !== "REVENUE") continue;

        const fte = toNumber(ec.fte);
        if (fte === 0) continue;

        lifeFHByContract.set(
          contract.id,
          (lifeFHByContract.get(contract.id) || 0) +
            fte * getWorkingHours(ec.periodStart, ec.periodEnd)
        );

        const winFH =
          fte * linkWindowHours(ec.periodStart, ec.periodEnd, periodStart, periodEnd);
        if (winFH === 0) continue;

        let group = contractGroups.get(contract.id);
        if (!group) {
          group = { contract, participants: [] };
          contractGroups.set(contract.id, group);
        }
        // Помесячные строки одного сотрудника сливаются в одного участника —
        // иначе внутренняя продажа умножалась бы на число строк.
        const existing = group.participants.find(
          (pp) => pp.deptId === dept.id && pp.employeeId === emp.id
        );
        if (existing) {
          existing.winFH += winFH;
        } else {
          group.participants.push({
            deptId: dept.id,
            deptName: info.name,
            shetilType: info.shetilType,
            employeeId: emp.id,
            fullName: emp.fullName,
            winFH,
            tariffRate: emp.tariff ? toNumber(emp.tariff.rate) : null,
          });
        }
      }
    }
  }

  // Now process each contract independently.
  for (const [contractId, { contract, participants }] of contractGroups) {
    const amountRaw =
      contract.status === "CONCLUDED"
        ? toNumber(contract.amount)
        : toNumber(contract.expectedAmount);
    if (amountRaw === 0) continue;

    // Признанная в окне сумма: доля FTE-часов обеспечения, попавших в окно,
    // от FTE-часов всего срока. Даты договора время больше не задают.
    const lifeFH = lifeFHByContract.get(contractId) || 0;
    if (lifeFH === 0) continue;
    const winFH = participants.reduce((sum, p) => sum + p.winFH, 0);
    if (winFH === 0) continue;
    const recognizedFraction = winFH / lifeFH;

    const contractAmount = amountRaw * recognizedFraction;

    // Partition participants into REVENUE vs non-REVENUE buckets. Aggregate
    // per-department window FTE-hours for the REVENUE side.
    const revenueByDept = new Map<string, { fte: number; name: string }>();
    let contractRevenueFTE = 0;
    let contractTotalFTE = 0;
    for (const p of participants) {
      contractTotalFTE += p.winFH;
      if (p.shetilType === "REVENUE") {
        contractRevenueFTE += p.winFH;
        const existing = revenueByDept.get(p.deptId);
        if (existing) existing.fte += p.winFH;
        else revenueByDept.set(p.deptId, { fte: p.winFH, name: p.deptName });
      }
    }

    // ---- CASE 2: no REVENUE participants → fallback to "fte" split ----
    if (contractRevenueFTE === 0) {
      // Aggregate per-department total FTE on this contract (all types).
      const perDept = new Map<string, { fte: number; name: string }>();
      for (const p of participants) {
        const existing = perDept.get(p.deptId);
        if (existing) existing.fte += p.winFH;
        else perDept.set(p.deptId, { fte: p.winFH, name: p.deptName });
      }
      for (const [deptId, { fte }] of perDept) {
        const share = fte / contractTotalFTE;
        const externalRevenue = contractAmount * share;
        addToMap(ctx.externalRevenueByDept, deptId, externalRevenue);

        // Record this contract in the department's external details list.
        const list = ctx.externalContractDetailsByDept.get(deptId) ?? [];
        list.push({
          contractId: contract.id,
          contractName: contract.name,
          status: contract.status,
          totalAmount: amountRaw,
          periodOverlapFraction: Math.round(recognizedFraction * 10000) / 10000,
          departmentFteFraction: Math.round(share * 10000) / 10000,
          allocatedRevenue: Math.round(externalRevenue * 100) / 100,
        });
        ctx.externalContractDetailsByDept.set(deptId, list);
      }
      // No TP exchange in fallback mode.
      continue;
    }

    // ---- CASE 1: at least one REVENUE block → standard TP allocation ----

    // 1. Distribute contract.amount between REVENUE blocks proportionally to
    //    their REVENUE-FTE (non-revenue blocks get zero external revenue here).
    for (const [revDeptId, { fte: revFte }] of revenueByDept) {
      const share = revFte / contractRevenueFTE;
      const externalRevenue = contractAmount * share;
      addToMap(ctx.externalRevenueByDept, revDeptId, externalRevenue);

      const list = ctx.externalContractDetailsByDept.get(revDeptId) ?? [];
      list.push({
        contractId: contract.id,
        contractName: contract.name,
        status: contract.status,
        totalAmount: amountRaw,
        periodOverlapFraction: Math.round(recognizedFraction * 10000) / 10000,
        departmentFteFraction: Math.round(share * 10000) / 10000,
        allocatedRevenue: Math.round(externalRevenue * 100) / 100,
      });
      ctx.externalContractDetailsByDept.set(revDeptId, list);
    }

    // 2. TP exchange for every non-REVENUE employee on this contract.
    for (const p of participants) {
      if (p.shetilType === "REVENUE") continue; // own employees don't "sell to themselves"

      if (p.tariffRate == null) {
        // Skip without contributing TP revenue but emit warning. The employee's
        // cost still stays in their department, so the center takes the hit.
        const warns = ctx.warningsByDept.get(p.deptId) ?? [];
        warns.push({
          employeeId: p.employeeId,
          fullName: p.fullName,
          message: `Не задан тариф — сотрудник исключён из трансфертной выручки (договор «${contract.name}»).`,
        });
        ctx.warningsByDept.set(p.deptId, warns);
        continue;
      }

      // Часы уже обрезаны периодами привязок — умножение на часы всего
      // отчётного периода на каждую помесячную строку (завышение до ×12) ушло.
      const tp = p.tariffRate * p.winFH;
      if (tp === 0) continue;

      // Seller (non-revenue department) receives internal revenue.
      addToMap(ctx.internalRevenueByDept, p.deptId, tp);

      // Distribute the cost of this TP across REVENUE buyers proportionally
      // to their REVENUE-FTE share of the contract.
      for (const [revDeptId, { fte: revFte, name: revName }] of revenueByDept) {
        const share = revFte / contractRevenueFTE;
        const portion = tp * share;
        addToMap(ctx.internalCostByDept, revDeptId, portion);

        addTransferFlow(
          ctx.sellsByDept,
          p.deptId,
          contract.id,
          contract.name,
          revDeptId,
          revName,
          portion
        );
        addTransferFlow(
          ctx.purchasesByDept,
          revDeptId,
          contract.id,
          contract.name,
          p.deptId,
          p.deptName,
          portion
        );
      }
    }
  }

  return ctx;
}

// Utility: flatten per-dept flow aggregation map into a plain array.
function flattenFlows(
  byDept: Map<string, Map<string, TransferFlow>>,
  deptId: string
): TransferFlow[] {
  const inner = byDept.get(deptId);
  if (!inner) return [];
  return Array.from(inner.values()).map((f) => ({
    ...f,
    amount: Math.round(f.amount * 100) / 100,
  }));
}

/**
 * Calculate P&L for all departments in a scenario.
 */
export async function calculatePnl(
  scenarioId: string,
  mode: PnlMode,
  periodStart: Date,
  periodEnd: Date,
  allocationMode: PnlAllocationMode = "earning"
): Promise<DepartmentPnlResult[]> {
  // 1. Fetch all departments
  const departments: DepartmentWithEmployees[] = await prisma.department.findMany({
    where: { scenarioId },
    include: {
      employees: {
        include: {
          tariff: true,
          contracts: {
            include: { contract: true },
          },
        },
      },
    },
  });

  // 2. Working hours for the period
  const workingHours = getWorkingHours(periodStart, periodEnd);

  // 3. FTE-часы по договорам (по ВСЕМ привязкам всех подразделений):
  //    lifeFH — за весь срок обеспечения (знаменатель распределения суммы),
  //    winFH  — попавшие в отчётное окно (числитель признания выручки).
  const contractLifeFH = new Map<string, number>();
  const contractWinFH = new Map<string, number>();
  for (const dept of departments) {
    for (const emp of dept.employees) {
      for (const ec of emp.contracts) {
        const fte = toNumber(ec.fte);
        if (fte === 0) continue;
        contractLifeFH.set(
          ec.contractId,
          (contractLifeFH.get(ec.contractId) || 0) +
            fte * getWorkingHours(ec.periodStart, ec.periodEnd)
        );
        contractWinFH.set(
          ec.contractId,
          (contractWinFH.get(ec.contractId) || 0) +
            fte * linkWindowHours(ec.periodStart, ec.periodEnd, periodStart, periodEnd)
        );
      }
    }
  }

  // 3b. Transfer mode uses a contract-first pre-pass so that per-department
  //     revenue/cost can depend on other departments on the same contract.
  const transferCtx =
    allocationMode === "transfer"
      ? computeTransferAllocations(departments, mode, periodStart, periodEnd)
      : null;

  // 4. Calculate P&L per department
  const results: DepartmentPnlResult[] = [];

  for (const dept of departments) {
    const isEarning = dept.shetilType === "REVENUE";
    const warnings: DepartmentPnlResult["warnings"] = [];
    const employeeDetails: EmployeeCostDetail[] = [];
    const contractDetails: ContractRevenueDetail[] = [];
    let totalCost = 0;
    let totalRevenue = 0;

    // --- COST CALCULATION ---
    for (const emp of dept.employees) {
      const costRate = toNumber(emp.costRate);

      if (!emp.costRate) {
        warnings.push({
          employeeId: emp.id,
          fullName: emp.fullName,
          message: "Не задана ставка себестоимости (costRate). Исключён из расчёта затрат.",
        });
        continue;
      }

      const empFte = toNumber(emp.fte);
      const empCost = costRate * empFte * workingHours;
      totalCost += empCost;

      employeeDetails.push({
        employeeId: emp.id,
        fullName: emp.fullName,
        position: emp.position,
        costRate,
        fte: empFte,
        workingHours,
        totalCost: Math.round(empCost * 100) / 100,
      });
    }

    // --- REVENUE CALCULATION ---
    if (allocationMode === "transfer") {
      // Contract-first pre-pass already computed everything. Just read results.
      const ext = transferCtx!.externalRevenueByDept.get(dept.id) ?? 0;
      const intRev = transferCtx!.internalRevenueByDept.get(dept.id) ?? 0;
      const intCost = transferCtx!.internalCostByDept.get(dept.id) ?? 0;

      totalRevenue = ext + intRev;
      totalCost += intCost; // own cost (already in totalCost) + internal TP purchases

      const extDetails = transferCtx!.externalContractDetailsByDept.get(dept.id) ?? [];
      contractDetails.push(...extDetails);

      // Merge per-department TP warnings (e.g. "employee without tariff").
      const tpWarnings = transferCtx!.warningsByDept.get(dept.id) ?? [];
      warnings.push(...tpWarnings);
    } else {
      // earning: only REVENUE-type departments earn (baseline behaviour).
      // fte: every department that has employees on REVENUE contracts earns.
      const runRevenueAllocation =
        allocationMode === "earning" ? isEarning : true;

      if (runRevenueAllocation) {
        // Вклад подразделения в договор — FTE-часы его привязок,
        // попавших в отчётное окно (периоды ОБЕСПЕЧЕНИЯ, не даты договора).
        const contractMap = new Map<
          string,
          {
            contract: DepartmentWithEmployees["employees"][number]["contracts"][number]["contract"];
            deptWinFH: number;
          }
        >();

        for (const emp of dept.employees) {
          for (const ec of emp.contracts) {
            const contract = ec.contract;

            if (!isContractIncludedInMode(contract.status, mode)) continue;

            // Only REVENUE contracts
            if (contract.type !== "REVENUE") continue;

            const fte = toNumber(ec.fte);
            if (fte === 0) continue;
            const winFH =
              fte * linkWindowHours(ec.periodStart, ec.periodEnd, periodStart, periodEnd);
            if (winFH === 0) continue;

            const existing = contractMap.get(contract.id);
            if (existing) {
              existing.deptWinFH += winFH;
            } else {
              contractMap.set(contract.id, { contract, deptWinFH: winFH });
            }
          }
        }

        for (const [contractId, { contract, deptWinFH }] of contractMap) {
          const lifeFH = contractLifeFH.get(contractId) || 0;
          if (lifeFH === 0) continue;
          const winFH = contractWinFH.get(contractId) || 0;

          // Amount based on contract status
          const amount =
            contract.status === "CONCLUDED"
              ? toNumber(contract.amount)
              : toNumber(contract.expectedAmount);

          if (amount === 0) continue;

          // Выручка подразделения: сумма договора × доля его FTE-часов в окне
          // от FTE-часов всего срока обеспечения. Сумма по подразделениям и
          // всем окнам за срок обеспечения равна ровно amount.
          const allocatedRevenue = (amount * deptWinFH) / lifeFH;
          totalRevenue += allocatedRevenue;

          contractDetails.push({
            contractId,
            contractName: contract.name,
            status: contract.status,
            totalAmount: amount,
            // Доля выручки договора, признанная в отчётном окне (по обеспечению)
            periodOverlapFraction: Math.round((winFH / lifeFH) * 10000) / 10000,
            departmentFteFraction:
              winFH > 0 ? Math.round((deptWinFH / winFH) * 10000) / 10000 : 0,
            allocatedRevenue: Math.round(allocatedRevenue * 100) / 100,
          });
        }
      }
    }

    const pnl = totalRevenue - totalCost;

    // Build transferBreakdown only for transfer mode.
    let transferBreakdown: TransferBreakdown | undefined;
    if (allocationMode === "transfer" && transferCtx) {
      const ownCost = employeeDetails.reduce((s, e) => s + e.totalCost, 0);
      const externalRevenue = transferCtx.externalRevenueByDept.get(dept.id) ?? 0;
      const internalRevenue = transferCtx.internalRevenueByDept.get(dept.id) ?? 0;
      const internalCost = transferCtx.internalCostByDept.get(dept.id) ?? 0;
      transferBreakdown = {
        externalRevenue: Math.round(externalRevenue * 100) / 100,
        internalRevenue: Math.round(internalRevenue * 100) / 100,
        ownCost: Math.round(ownCost * 100) / 100,
        internalCost: Math.round(internalCost * 100) / 100,
        sells: flattenFlows(transferCtx.sellsByDept, dept.id),
        purchases: flattenFlows(transferCtx.purchasesByDept, dept.id),
      };
    }

    results.push({
      departmentId: dept.id,
      departmentName: dept.name,
      shetilType: dept.shetilType,
      isEarning,
      revenue: Math.round(totalRevenue * 100) / 100,
      cost: Math.round(totalCost * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      employeeDetails,
      contractDetails,
      warnings,
      childrenPnl: 0,
      totalPnl: Math.round(pnl * 100) / 100,
      transferBreakdown,
    });
  }

  // 5. Build parent-children map and aggregate
  const resultMap = new Map(results.map((r) => [r.departmentId, r]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  // Recursive aggregation bottom-up
  function aggregateChildren(deptId: string): number {
    const dept = deptMap.get(deptId);
    const result = resultMap.get(deptId);
    if (!dept || !result) return 0;

    let childSum = 0;
    const children = departments.filter((d) => d.parentId === deptId);
    for (const child of children) {
      childSum += aggregateChildren(child.id);
    }

    result.childrenPnl = Math.round(childSum * 100) / 100;
    result.totalPnl = Math.round((result.pnl + childSum) * 100) / 100;
    return result.totalPnl;
  }

  // Find root departments and aggregate
  const roots = departments.filter((d) => !d.parentId);
  for (const root of roots) {
    aggregateChildren(root.id);
  }

  return results;
}

/**
 * Calculate and cache P&L results.
 */
export async function calculateAndCachePnl(
  scenarioId: string,
  mode: PnlMode,
  periodStart: Date,
  periodEnd: Date,
  allocationMode: PnlAllocationMode = "earning"
): Promise<DepartmentPnlResult[]> {
  const results = await calculatePnl(scenarioId, mode, periodStart, periodEnd, allocationMode);

  // Upsert cache entries
  for (const r of results) {
    await prisma.pnlCache.upsert({
      where: {
        scenarioId_departmentId_mode_allocationMode_periodStart_periodEnd: {
          scenarioId,
          departmentId: r.departmentId,
          mode,
          allocationMode,
          periodStart,
          periodEnd,
        },
      },
      update: {
        revenue: r.revenue,
        cost: r.cost,
        pnl: r.pnl,
        details: JSON.parse(JSON.stringify({
          employees: r.employeeDetails,
          contracts: r.contractDetails,
          childrenPnl: r.childrenPnl,
          totalPnl: r.totalPnl,
        })) as Prisma.InputJsonValue,
        warnings: r.warnings.length > 0
          ? (JSON.parse(JSON.stringify(r.warnings)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        calculatedAt: new Date(),
      },
      create: {
        scenarioId,
        departmentId: r.departmentId,
        mode,
        allocationMode,
        periodStart,
        periodEnd,
        revenue: r.revenue,
        cost: r.cost,
        pnl: r.pnl,
        details: JSON.parse(JSON.stringify({
          employees: r.employeeDetails,
          contracts: r.contractDetails,
          childrenPnl: r.childrenPnl,
          totalPnl: r.totalPnl,
        })) as Prisma.InputJsonValue,
        warnings: r.warnings.length > 0
          ? (JSON.parse(JSON.stringify(r.warnings)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  return results;
}
