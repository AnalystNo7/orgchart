import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HIERARCHY_SKIP_LEVELS, HIERARCHY_MERGE_LEVELS } from "@/types";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const allDepartments = await prisma.department.findMany({
    where: { scenarioId },
    select: { id: true, name: true, parentId: true, cfo: true },
  });

  const deptMap = new Map(allDepartments.map((d) => [d.id, d]));

  function mergeLevelNames(path: string[]): string[] {
    const [a, b] = HIERARCHY_MERGE_LEVELS;
    if (path.length <= a) return path;
    const nameA = path[a] ?? "";
    const nameB = path[b] ?? "";
    const merged = nameB ? `${nameA} ${nameB}`.trim() : nameA;
    return [...path.slice(0, a), merged, ...path.slice(b + 1)];
  }

  // Build hierarchy path for each department
  function buildPath(depId: string): string[] {
    const path: string[] = [];
    let current = deptMap.get(depId);
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? deptMap.get(current.parentId) : undefined;
    }
    return mergeLevelNames(path.slice(HIERARCHY_SKIP_LEVELS));
  }

  // Collect unique values per hierarchy level + CFO
  const cfoSet = new Set<string>();
  const levelSets: Set<string>[] = [];

  for (const dept of allDepartments) {
    if (dept.cfo) cfoSet.add(dept.cfo);
    const path = buildPath(dept.id);
    path.forEach((name, i) => {
      if (!levelSets[i]) levelSets[i] = new Set();
      levelSets[i].add(name);
    });
  }

  return NextResponse.json({
    cfo: [...cfoSet].sort(),
    levels: levelSets.map((s) => [...s].sort()),
  });
}
