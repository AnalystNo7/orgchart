import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RefRow {
  employeeCode: string;        // "Сотрудник" — match key vs Employee.fullName
  tariff: string;              // "К" — К1-К6 or "0"
  costRate: number;            // "Оценка Себес Р/Ч"
  contractName: string;        // "Проект (Код)" → Contract.name
  contractDescription: string; // "Проект (Наименование)" → Contract.description
  contractAmount: number;      // "Оценка Сумма"
  month: number | string;      // Excel serial date
  fte: number;                 // "Оценка FTE"
}

interface ImportRequest {
  scenarioId: string;
  rows: RefRow[];
}

// Normalize for matching: trim, collapse spaces, lowercase
function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// Maps normalized tariff input (Cyrillic/Latin, with/without dash) to DB name.
// DB stores Latin "K-1" through "K-6" (see prisma/seed.ts).
const TARIFF_MAP: Record<string, string> = {
  // Cyrillic "К" (U+041A) — as it appears in the Excel file
  "к1": "K-1", "к2": "K-2", "к3": "K-3", "к4": "K-4", "к5": "K-5", "к6": "K-6",
  "к-1": "K-1", "к-2": "K-2", "к-3": "K-3", "к-4": "K-4", "к-5": "K-5", "к-6": "K-6",
  // Latin "k" (U+004B)
  "k1": "K-1", "k2": "K-2", "k3": "K-3", "k4": "K-4", "k5": "K-5", "k6": "K-6",
  "k-1": "K-1", "k-2": "K-2", "k-3": "K-3", "k-4": "K-4", "k-5": "K-5", "k-6": "K-6",
};

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

  // Load all employees in scenario — match by fullName (normalized)
  const allEmployees = await prisma.employee.findMany({
    where: { scenarioId },
    select: { id: true, fullName: true },
  });
  const employeeByName = new Map<string, string>();
  for (const emp of allEmployees) {
    employeeByName.set(norm(emp.fullName), emp.id);
  }

  // Load existing contracts — match by name (normalized)
  const allContracts = await prisma.contract.findMany({
    select: { id: true, name: true },
  });
  const contractByName = new Map<string, string>();
  for (const c of allContracts) {
    contractByName.set(norm(c.name), c.id);
  }

  let employeesUpdated = 0;
  let employeesNotFound = 0;
  let contractsCreated = 0;
  let contractsUpdated = 0;
  let periodsCreated = 0;
  let periodsUpdated = 0;
  const notFoundNames = new Set<string>();

  // Group rows by employee code (for updating costRate/tariff)
  const empGroups = new Map<string, RefRow[]>();
  for (const row of rows) {
    if (!row.employeeCode) continue;
    const key = norm(row.employeeCode);
    if (!empGroups.has(key)) empGroups.set(key, []);
    empGroups.get(key)!.push(row);
  }

  // Group rows by contract name/code (for creating/updating contracts)
  const contractGroups = new Map<string, RefRow[]>();
  for (const row of rows) {
    if (!row.contractName) continue; // Skip empty contract codes
    const key = norm(row.contractName);
    if (!contractGroups.has(key)) contractGroups.set(key, []);
    contractGroups.get(key)!.push(row);
  }

  // 1. Create or update contracts
  for (const [normName, cRows] of contractGroups) {
    const existing = contractByName.get(normName);

    // Compute min/max dates and max amount
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let maxAmount = 0;
    let description = "";

    for (const r of cRows) {
      if (r.month) {
        const period = excelDateToMonth(r.month);
        if (period) {
          if (!minDate || period.start < minDate) minDate = period.start;
          if (!maxDate || period.end > maxDate) maxDate = period.end;
        }
      }
      if (r.contractAmount > maxAmount) {
        maxAmount = r.contractAmount;
      }
      if (!description && r.contractDescription) {
        description = r.contractDescription;
      }
    }

    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate.getFullYear(), 11, 31);

    const originalName = cRows[0].contractName; // preserve original case

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (maxAmount > 0) updateData.expectedAmount = maxAmount;
      if (description) updateData.description = description;
      if (Object.keys(updateData).length > 0) {
        await prisma.contract.update({
          where: { id: existing },
          data: updateData,
        });
        contractsUpdated++;
      }
    } else {
      const contract = await prisma.contract.create({
        data: {
          name: originalName,
          description: description || null,
          type: "REVENUE",
          status: "PLANNED",
          expectedAmount: maxAmount || null,
          periodStart: minDate,
          periodEnd: maxDate,
        },
      });
      contractByName.set(normName, contract.id);
      contractsCreated++;
    }
  }

  // 2. Update employees (costRate, tariffId)
  for (const [normCode, eRows] of empGroups) {
    const empId = employeeByName.get(normCode);
    if (!empId) {
      employeesNotFound++;
      notFoundNames.add(eRows[0].employeeCode);
      continue;
    }

    const updateData: Record<string, unknown> = {};

    // Find first non-zero tariff across all rows for this employee
    for (const row of eRows) {
      const t = row.tariff?.trim().toLowerCase();
      if (t && t !== "0" && TARIFF_MAP[t]) {
        const tariffName = TARIFF_MAP[t];
        const tariffId = tariffByName.get(tariffName);
        if (tariffId) {
          updateData.tariffId = tariffId;
          break;
        }
      }
    }

    // Take first non-zero costRate
    for (const row of eRows) {
      if (row.costRate > 0) {
        updateData.costRate = row.costRate;
        break;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.employee.update({
        where: { id: empId },
        data: updateData,
      });
      employeesUpdated++;
    }
  }

  // 3. Create/update EmployeeContract periods
  for (const row of rows) {
    if (!row.employeeCode || !row.contractName || !row.month) continue;

    const empId = employeeByName.get(norm(row.employeeCode));
    if (!empId) continue;

    const contractId = contractByName.get(norm(row.contractName));
    if (!contractId) continue;

    const period = excelDateToMonth(row.month);
    if (!period) continue;

    const fte = typeof row.fte === "number" && !isNaN(row.fte) ? row.fte : 0;

    // Check if period already exists (employee + contract + periodStart)
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
        periodsUpdated++;
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
      periodsUpdated,
      notFoundNames: [...notFoundNames].slice(0, 20),
    },
    { status: 201 }
  );
}
