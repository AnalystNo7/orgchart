export type DiffStatus = "unchanged" | "added" | "removed" | "modified" | "moved";

export interface DiffDepartment {
  id: string;
  name: string;
  parentId: string | null;
  shetilType: string;
  originId: string | null;
  metrics: { pp: number; opp: number; aup: number; totalFte: number };
  head: { fullName: string } | null;
  _count: { employees: number; children: number };
  diffStatus: DiffStatus;
  changes?: string[];
}

interface DeptInput {
  id: string;
  name: string;
  parentId: string | null;
  shetilType: string;
  originId: string | null;
  metrics: { pp: number; opp: number; aup: number; totalFte: number };
  head: { fullName: string } | null;
  _count: { employees: number; children: number };
}

export function computeDiff(
  leftDepts: DeptInput[],
  rightDepts: DeptInput[]
): { left: DiffDepartment[]; right: DiffDepartment[]; summary: DiffSummary } {
  // Build origin maps
  const leftByOrigin = new Map<string, DeptInput>();
  const rightByOrigin = new Map<string, DeptInput>();

  for (const d of leftDepts) {
    const key = d.originId ?? d.id;
    leftByOrigin.set(key, d);
  }
  for (const d of rightDepts) {
    const key = d.originId ?? d.id;
    rightByOrigin.set(key, d);
  }

  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, moved: 0 };

  // Process left (baseline) departments
  const left: DiffDepartment[] = leftDepts.map((d) => {
    const key = d.originId ?? d.id;
    const match = rightByOrigin.get(key);

    if (!match) {
      summary.removed++;
      return { ...d, diffStatus: "removed" as const };
    }

    return { ...d, diffStatus: "unchanged" as const };
  });

  // Process right (scenario) departments
  const right: DiffDepartment[] = rightDepts.map((d) => {
    const key = d.originId ?? d.id;
    const match = leftByOrigin.get(key);

    if (!match) {
      summary.added++;
      return { ...d, diffStatus: "added" as const };
    }

    // Check for changes
    const changes: string[] = [];
    if (d.name !== match.name) changes.push(`Переименовано: ${match.name} → ${d.name}`);
    if (d.shetilType !== match.shetilType) changes.push(`Тип: ${match.shetilType} → ${d.shetilType}`);

    const leftParentOrigin = match.parentId
      ? (leftDepts.find((ld) => ld.id === match.parentId)?.originId ?? match.parentId)
      : null;
    const rightParentOrigin = d.parentId
      ? (rightDepts.find((rd) => rd.id === d.parentId)?.originId ?? d.parentId)
      : null;

    if (leftParentOrigin !== rightParentOrigin) {
      summary.moved++;
      changes.push("Перемещено в другое подразделение");
      return { ...d, diffStatus: "moved" as const, changes };
    }

    const empDiff = d._count.employees - match._count.employees;
    if (empDiff !== 0) {
      changes.push(`Сотрудников: ${empDiff > 0 ? "+" : ""}${empDiff}`);
    }

    if (changes.length > 0) {
      summary.modified++;
      return { ...d, diffStatus: "modified" as const, changes };
    }

    return { ...d, diffStatus: "unchanged" as const };
  });

  return { left, right, summary };
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  moved: number;
}
