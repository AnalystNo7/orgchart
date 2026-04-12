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
 *               internal transfer price = Tariff.rate × FTE × workingHours × overlap.
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
}

function toNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Calculate date overlap fraction between two ranges.
 * Returns 0-1 representing what fraction of the contract period overlaps with the calc period.
 */
function getOverlapFraction(
  contractStart: Date,
  contractEnd: Date,
  periodStart: Date,
  periodEnd: Date
): number {
  const overlapStart = contractStart > periodStart ? contractStart : periodStart;
  const overlapEnd = contractEnd < periodEnd ? contractEnd : periodEnd;

  if (overlapStart > overlapEnd) return 0;

  const contractDays = Math.max(
    1,
    Math.floor((contractEnd.getTime() - contractStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const overlapDays =
    Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return overlapDays / contractDays;
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
  const departments = await prisma.department.findMany({
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

  // 3. Build a map of total FTE per contract (across all departments)
  const contractTotalFte = new Map<string, number>();
  for (const dept of departments) {
    for (const emp of dept.employees) {
      for (const ec of emp.contracts) {
        const current = contractTotalFte.get(ec.contractId) || 0;
        contractTotalFte.set(ec.contractId, current + toNumber(ec.fte));
      }
    }
  }

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
    // earning: only REVENUE-type departments earn (baseline behaviour).
    // fte / transfer: every department that has employees on REVENUE contracts earns.
    const runRevenueAllocation =
      allocationMode === "earning" ? isEarning : true;

    if (runRevenueAllocation) {
      if (allocationMode === "transfer") {
        // --- Transfer pricing ---
        // Aggregate per-contract for contractDetails display.
        const tpAgg = new Map<
          string,
          {
            contract: (typeof dept.employees)[0]["contracts"][0]["contract"];
            departmentFte: number;
            allocatedRevenue: number;
            overlapFraction: number;
          }
        >();

        for (const emp of dept.employees) {
          for (const ec of emp.contracts) {
            const contract = ec.contract;

            if (!isContractIncludedInMode(contract.status, mode)) continue;
            if (contract.type !== "REVENUE") continue;

            const ecFte = toNumber(ec.fte);
            if (ecFte === 0) continue;

            if (!emp.tariff) {
              warnings.push({
                employeeId: emp.id,
                fullName: emp.fullName,
                message:
                  "Не задан тариф — исключён из расчёта трансфертной выручки.",
              });
              continue;
            }

            const overlapFraction = getOverlapFraction(
              contract.periodStart,
              contract.periodEnd,
              periodStart,
              periodEnd
            );
            const effectiveOverlap =
              contract.status === "PLANNED" && !contract.periodStart
                ? 1
                : overlapFraction;

            if (effectiveOverlap === 0) continue;

            const tariffRate = toNumber(emp.tariff.rate);
            const tp = tariffRate * ecFte * workingHours * effectiveOverlap;
            totalRevenue += tp;

            const existing = tpAgg.get(contract.id);
            if (existing) {
              existing.departmentFte += ecFte;
              existing.allocatedRevenue += tp;
            } else {
              tpAgg.set(contract.id, {
                contract,
                departmentFte: ecFte,
                allocatedRevenue: tp,
                overlapFraction: effectiveOverlap,
              });
            }
          }
        }

        for (const [contractId, agg] of tpAgg) {
          contractDetails.push({
            contractId,
            contractName: agg.contract.name,
            status: agg.contract.status,
            totalAmount: 0, // contract.amount is ignored in transfer mode
            periodOverlapFraction: Math.round(agg.overlapFraction * 10000) / 10000,
            departmentFteFraction: Math.round(agg.departmentFte * 10000) / 10000,
            allocatedRevenue: Math.round(agg.allocatedRevenue * 100) / 100,
          });
        }
      } else {
        // --- Earning-only / FTE-proportional allocation ---
        // Collect contracts through employees
        const contractMap = new Map<
          string,
          {
            contract: (typeof dept.employees)[0]["contracts"][0]["contract"];
            departmentFte: number;
          }
        >();

        for (const emp of dept.employees) {
          for (const ec of emp.contracts) {
            const contract = ec.contract;

            if (!isContractIncludedInMode(contract.status, mode)) continue;

            // Only REVENUE contracts
            if (contract.type !== "REVENUE") continue;

            const existing = contractMap.get(contract.id);
            if (existing) {
              existing.departmentFte += toNumber(ec.fte);
            } else {
              contractMap.set(contract.id, {
                contract,
                departmentFte: toNumber(ec.fte),
              });
            }
          }
        }

        for (const [contractId, { contract, departmentFte }] of contractMap) {
          const totalFte = contractTotalFte.get(contractId) || 1;
          const fteFraction = departmentFte / totalFte;

          // Amount based on contract status
          const amount =
            contract.status === "CONCLUDED"
              ? toNumber(contract.amount)
              : toNumber(contract.expectedAmount);

          if (amount === 0) continue;

          // Period overlap
          const overlapFraction = getOverlapFraction(
            contract.periodStart,
            contract.periodEnd,
            periodStart,
            periodEnd
          );

          // For planned contracts without dates (REV-007), use full amount
          const effectiveOverlap =
            contract.status === "PLANNED" && !contract.periodStart ? 1 : overlapFraction;

          if (effectiveOverlap === 0) continue;

          const allocatedRevenue = amount * effectiveOverlap * fteFraction;
          totalRevenue += allocatedRevenue;

          contractDetails.push({
            contractId,
            contractName: contract.name,
            status: contract.status,
            totalAmount: amount,
            periodOverlapFraction: Math.round(effectiveOverlap * 10000) / 10000,
            departmentFteFraction: Math.round(fteFraction * 10000) / 10000,
            allocatedRevenue: Math.round(allocatedRevenue * 100) / 100,
          });
        }
      }
    }

    const pnl = totalRevenue - totalCost;

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
