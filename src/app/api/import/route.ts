import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ShetilType, EmployeeCategory } from "@prisma/client";

interface ImportRowData {
  generalDirector?: string;
  cfo: string;
  block: string;
  department: string;
  subDepartment: string;
  position: string;
  fullName: string;
  fte: number;
  category: string;
}

interface ImportRequest {
  scenarioId: string;
  modelOrgStructure: boolean;
  clearExisting: boolean;
  defaultShetilType: ShetilType;
  rows: ImportRowData[];
}

const VALID_CATEGORIES: Record<string, EmployeeCategory> = {
  PP: "PP",
  ПП: "PP",
  OPP: "OPP",
  ОПП: "OPP",
  AUP: "AUP",
  АУП: "AUP",
};

function parseCategory(value: string): EmployeeCategory {
  return VALID_CATEGORIES[value.toUpperCase().trim()] ?? "PP";
}

export async function POST(req: NextRequest) {
  const body: ImportRequest = await req.json();
  const { scenarioId, modelOrgStructure, clearExisting, defaultShetilType, rows } = body;

  if (!scenarioId || !rows || rows.length === 0) {
    return NextResponse.json(
      { error: "scenarioId и rows обязательны" },
      { status: 400 }
    );
  }

  // Verify scenario exists
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
  });
  if (!scenario) {
    return NextResponse.json({ error: "Сценарий не найден" }, { status: 404 });
  }

  if (modelOrgStructure) {
    return handleFullImport(scenarioId, clearExisting, defaultShetilType, rows);
  } else {
    return handleEmployeesOnly(scenarioId, rows);
  }
}

async function handleFullImport(
  scenarioId: string,
  clearExisting: boolean,
  defaultShetilType: ShetilType,
  rows: ImportRowData[]
) {
  // Use transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    if (clearExisting) {
      // Delete all employees first (due to headOf relation), then departments
      await tx.employee.deleteMany({ where: { scenarioId } });
      await tx.department.deleteMany({ where: { scenarioId } });
    }

    // Build department hierarchy from rows
    // Key: "block|department|subDepartment" -> departmentId
    const deptCache = new Map<string, string>();
    // Track CFO assignments: department key -> cfo value
    const deptCfo = new Map<string, string>();

    for (const row of rows) {
      const levels = [row.generalDirector, row.block, row.department, row.subDepartment].filter(
        (l): l is string => !!l && l.trim().length > 0
      );

      if (levels.length === 0) continue;

      // Collect CFO for the deepest department
      const deepestKey = levels.join("|");
      if (row.cfo && row.cfo.trim() && !deptCfo.has(deepestKey)) {
        deptCfo.set(deepestKey, row.cfo.trim());
      }
    }

    // Create departments level by level
    async function ensureDepartment(
      levelNames: string[],
      depth: number
    ): Promise<string> {
      const key = levelNames.slice(0, depth + 1).join("|");
      if (deptCache.has(key)) return deptCache.get(key)!;

      const name = levelNames[depth];
      const parentId =
        depth > 0 ? await ensureDepartment(levelNames, depth - 1) : null;

      // Check if department already exists (for append mode)
      const existing = await tx.department.findFirst({
        where: {
          scenarioId,
          name,
          parentId,
        },
      });

      if (existing) {
        deptCache.set(key, existing.id);
        // Update CFO if present
        const cfo = deptCfo.get(key);
        if (cfo && !existing.cfo) {
          await tx.department.update({
            where: { id: existing.id },
            data: { cfo },
          });
        }
        return existing.id;
      }

      const cfo = deptCfo.get(key) ?? null;
      const dept = await tx.department.create({
        data: {
          scenarioId,
          parentId,
          name,
          cfo,
          shetilType: defaultShetilType,
          sortOrder: 0,
        },
      });

      deptCache.set(key, dept.id);
      return dept.id;
    }

    // Create all departments and employees
    let employeesCreated = 0;
    let departmentsCreated = 0;

    for (const row of rows) {
      const levels = [row.generalDirector, row.block, row.department, row.subDepartment].filter(
        (l): l is string => !!l && l.trim().length > 0
      );

      if (levels.length === 0 || !row.fullName?.trim()) continue;

      const departmentId = await ensureDepartment(levels, levels.length - 1);

      await tx.employee.create({
        data: {
          scenarioId,
          departmentId,
          fullName: row.fullName.trim(),
          position: row.position?.trim() || "Не указана",
          category: parseCategory(row.category),
          fte: row.fte || 1,
        },
      });
      employeesCreated++;
    }

    departmentsCreated = deptCache.size;

    return { employeesCreated, departmentsCreated };
  });

  return NextResponse.json(result, { status: 201 });
}

async function handleEmployeesOnly(
  scenarioId: string,
  rows: ImportRowData[]
) {
  // Fetch all existing departments in the scenario
  const existingDepts = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true, parentId: true },
  });

  // Build a lookup: name -> department (prefer deepest)
  const deptByName = new Map<string, string>();
  for (const dept of existingDepts) {
    deptByName.set(dept.name.toLowerCase(), dept.id);
  }

  let imported = 0;
  let skipped = 0;
  const skippedNames: string[] = [];

  for (const row of rows) {
    if (!row.fullName?.trim()) continue;

    // Try to find matching department by name (deepest level first)
    const levels = [row.subDepartment, row.department, row.block, row.generalDirector].filter(
      (l): l is string => !!l && l.trim().length > 0
    );

    let departmentId: string | null = null;
    for (const levelName of levels) {
      const found = deptByName.get(levelName.toLowerCase().trim());
      if (found) {
        departmentId = found;
        break;
      }
    }

    if (!departmentId) {
      skipped++;
      if (skippedNames.length < 10) {
        skippedNames.push(row.fullName);
      }
      continue;
    }

    await prisma.employee.create({
      data: {
        scenarioId,
        departmentId,
        fullName: row.fullName.trim(),
        position: row.position?.trim() || "Не указана",
        category: parseCategory(row.category),
        fte: row.fte || 1,
      },
    });
    imported++;
  }

  return NextResponse.json(
    {
      employeesCreated: imported,
      departmentsCreated: 0,
      skipped,
      skippedNames,
    },
    { status: 201 }
  );
}
