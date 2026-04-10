import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RefRow {
  fullName: string;
  tariff: string;
  costRate: string;
  contractName: string;
  contractAmount: number;
  month: number | string;
  fte: number;
  contractCode: string;
  contractNumber: string;
}

interface ImportRequest {
  scenarioId: string;
  rows: RefRow[];
}

const TARIFF_MAP: Record<string, string> = {
  "К1": "К-1", "К2": "К-2", "К3": "К-3", "К4": "К-4", "К5": "К-5", "К6": "К-6",
  "K1": "К-1", "K2": "К-2", "K3": "К-3", "K4": "К-4", "K5": "К-5", "K6": "К-6",
  "К-1": "К-1", "К-2": "К-2", "К-3": "К-3", "К-4": "К-4", "К-5": "К-5", "К-6": "К-6",
};

function parseCostRate(val: string): number | null {
  if (!val) return null;
  // Handle "3 325,56 ₽" format
  const clean = val.replace(/[^\d,.\-]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function excelDateToMonth(val: number | string): { start: Date; end: Date } | null {
  let date: Date;

  if (typeof val === "number") {
    // Excel serial date
    date = new Date((val - 25569) * 86400 * 1000);
  } else {
    date = new Date(val);
    if (isNaN(date.getTime())) return null;
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // Last day of month

  return { start, end };
}

export async function POST(req: NextRequest) {
  const body: ImportRequest = await req.json();
  const { scenarioId, rows } = body;

  if (!scenarioId || !rows || rows.length === 0) {
    return NextResponse.json(
      { error: "scenarioId и rows обязательны" },
      { status: 400 }
    );
  }

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
  });
  if (!scenario) {
    return NextResponse.json({ error: "Сценарий не найден" }, { status: 404 });
  }

  // Load all tariffs
  const allTariffs = await prisma.tariff.findMany();
  const tariffByName = new Map<string, string>();
  for (const t of allTariffs) {
    tariffByName.set(t.name, t.id);
  }

  // Load all employees in scenario
  const allEmployees = await prisma.employee.findMany({
    where: { scenarioId },
    select: { id: true, fullName: true },
  });
  const employeeByName = new Map<string, string>();
  for (const emp of allEmployees) {
    employeeByName.set(emp.fullName.trim().toLowerCase(), emp.id);
  }

  // Load existing contracts
  const allContracts = await prisma.contract.findMany({
    select: { id: true, name: true },
  });
  const contractByName = new Map<string, string>();
  for (const c of allContracts) {
    contractByName.set(c.name.trim().toLowerCase(), c.id);
  }

  let employeesUpdated = 0;
  let employeesNotFound = 0;
  let contractsCreated = 0;
  let contractsUpdated = 0;
  let periodsCreated = 0;
  const notFoundNames = new Set<string>();

  // Group rows by employee to update costRate and tariffId once
  const empGroups = new Map<string, RefRow[]>();
  for (const row of rows) {
    if (!row.fullName?.trim()) continue;
    const key = row.fullName.trim();
    if (!empGroups.has(key)) empGroups.set(key, []);
    empGroups.get(key)!.push(row);
  }

  // Group rows by contract name to create contracts and compute period range
  const contractGroups = new Map<string, RefRow[]>();
  for (const row of rows) {
    if (!row.contractName?.trim()) continue;
    const key = row.contractName.trim();
    if (!contractGroups.has(key)) contractGroups.set(key, []);
    contractGroups.get(key)!.push(row);
  }

  // 1. Create or update contracts
  for (const [name, cRows] of contractGroups) {
    const existing = contractByName.get(name.toLowerCase());

    // Compute min/max dates from rows
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let totalAmount = 0;

    for (const r of cRows) {
      if (r.month) {
        const period = excelDateToMonth(r.month);
        if (period) {
          if (!minDate || period.start < minDate) minDate = period.start;
          if (!maxDate || period.end > maxDate) maxDate = period.end;
        }
      }
      if (r.contractAmount && r.contractAmount > totalAmount) {
        totalAmount = r.contractAmount;
      }
    }

    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate.getFullYear(), 11, 31);

    if (existing) {
      // Update amount if larger
      if (totalAmount > 0) {
        await prisma.contract.update({
          where: { id: existing },
          data: { amount: totalAmount },
        });
        contractsUpdated++;
      }
    } else {
      const contract = await prisma.contract.create({
        data: {
          name,
          type: "REVENUE",
          status: "PLANNED",
          amount: totalAmount || null,
          periodStart: minDate,
          periodEnd: maxDate,
        },
      });
      contractByName.set(name.toLowerCase(), contract.id);
      contractsCreated++;
    }
  }

  // 2. Update employees (costRate, tariffId)
  for (const [name, eRows] of empGroups) {
    const empId = employeeByName.get(name.toLowerCase());
    if (!empId) {
      employeesNotFound++;
      notFoundNames.add(name);
      continue;
    }

    // Take first row's tariff and costRate
    const firstRow = eRows[0];
    const updateData: Record<string, unknown> = {};

    if (firstRow.tariff) {
      const tariffName = TARIFF_MAP[firstRow.tariff.trim()];
      if (tariffName) {
        const tariffId = tariffByName.get(tariffName);
        if (tariffId) updateData.tariffId = tariffId;
      }
    }

    if (firstRow.costRate) {
      const rate = parseCostRate(firstRow.costRate);
      if (rate !== null) updateData.costRate = rate;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.employee.update({
        where: { id: empId },
        data: updateData,
      });
      employeesUpdated++;
    }
  }

  // 3. Create EmployeeContract periods
  for (const row of rows) {
    if (!row.fullName?.trim() || !row.contractName?.trim() || !row.month) continue;

    const empId = employeeByName.get(row.fullName.trim().toLowerCase());
    if (!empId) continue;

    const contractId = contractByName.get(row.contractName.trim().toLowerCase());
    if (!contractId) continue;

    const period = excelDateToMonth(row.month);
    if (!period) continue;

    const fte = typeof row.fte === "number" && !isNaN(row.fte) ? row.fte : 0;

    // Check if period already exists
    const existing = await prisma.employeeContract.findFirst({
      where: {
        employeeId: empId,
        contractId,
        periodStart: period.start,
      },
    });

    if (existing) {
      // Update FTE if different
      if (Number(existing.fte) !== fte) {
        await prisma.employeeContract.update({
          where: { id: existing.id },
          data: { fte },
        });
      }
    } else {
      await prisma.employeeContract.create({
        data: {
          employeeId: empId,
          contractId,
          revenueStatus: "PLANNED",
          fte,
          periodStart: period.start,
          periodEnd: period.end,
        },
      });
      periodsCreated++;
    }
  }

  return NextResponse.json(
    {
      employeesUpdated,
      employeesNotFound,
      contractsCreated,
      contractsUpdated,
      periodsCreated,
      notFoundNames: [...notFoundNames].slice(0, 20),
    },
    { status: 201 }
  );
}
