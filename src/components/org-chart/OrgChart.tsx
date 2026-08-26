"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { DepartmentNode, type DepartmentNodeData } from "./DepartmentNode";
import { ShetilLegend } from "./ShetilLegend";
import { MetricsToolbar } from "./MetricsToolbar";
import { Network, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddDepartmentDialog } from "./AddDepartmentDialog";
import { ExcelImport } from "@/components/employees/ExcelImport";
import { BulkActionsBar } from "./BulkActionsBar";
import { DeleteDepartmentDialog } from "./DeleteDepartmentDialog";
import { AddParentDialog } from "@/components/department-card/AddParentDialog";
import { useOrgChartStore } from "@/lib/store";
import { useUndoRedoKeys } from "@/hooks/useUndoRedoKeys";
import { hybridDagreLayout } from "@/lib/layout/hybrid-layout";
import type { MetricsMode } from "@/types";
import type { ShetilType } from "@prisma/client";

interface DepartmentAPI {
  id: string;
  parentId: string | null;
  name: string;
  cfo: string | null;
  shetilType: "REVENUE" | "RESOURCE" | "SERVICE" | "BACKOFFICE";
  head: { id: string; fullName: string } | null;
  _count: { employees: number; children: number };
  metrics: { pp: number; opp: number; aup: number; totalFte: number };
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const INDENT = 30; // horizontal indent for vertical children from parent's left edge
const V_GAP = 20; // vertical gap between siblings in vertical mode
const RANKSEP = 80; // vertical gap between ranks (same as dagre ranksep)

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  verticalIds: Set<string>,
  departments: DepartmentAPI[]
): { nodes: Node[]; edges: Edge[] } {
  return hybridDagreLayout(nodes, edges, verticalIds, departments, {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    indent: INDENT,
    vGap: V_GAP,
    rankSep: RANKSEP,
    nodeSep: 50,
  });
}


// Client-side metrics aggregation
function aggregateMetrics(
  departments: DepartmentAPI[],
  deptId: string,
  mode: MetricsMode,
  selectedLevels: number[]
): { pp: number; opp: number; aup: number; totalFte: number } {
  const dept = departments.find((d) => d.id === deptId);
  if (!dept) return { pp: 0, opp: 0, aup: 0, totalFte: 0 };

  if (mode === "own") {
    return { ...dept.metrics };
  }

  const childrenMap = new Map<string, string[]>();
  departments.forEach((d) => {
    if (d.parentId) {
      const siblings = childrenMap.get(d.parentId) ?? [];
      siblings.push(d.id);
      childrenMap.set(d.parentId, siblings);
    }
  });

  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const result = { ...dept.metrics };

  function collectDescendants(parentId: string, relativeDepth: number) {
    const children = childrenMap.get(parentId) ?? [];
    children.forEach((childId) => {
      const childDepth = relativeDepth + 1;
      const child = deptMap.get(childId);
      if (!child) return;

      const shouldInclude =
        mode === "all_descendants" ||
        (mode === "selected_levels" && selectedLevels.includes(childDepth));

      if (shouldInclude) {
        result.pp += child.metrics.pp;
        result.opp += child.metrics.opp;
        result.aup += child.metrics.aup;
        result.totalFte += child.metrics.totalFte;
      }

      collectDescendants(childId, childDepth);
    });
  }

  collectDescendants(deptId, 0);
  return result;
}

const nodeTypes: NodeTypes = {
  department: DepartmentNode as unknown as NodeTypes["department"],
};

export function OrgChart() {
  const {
    currentScenarioId,
    setSelectedDepartmentId,
    selectedDepartmentId,
    metricsMode,
    selectedLevels,
    departmentOverrides,
    refreshCounter,
    verticalIds,
    toggleVertical,
    fetchUndoRedoState,
    collapsedIds,
    setCollapsedIds,
    toggleCollapsed,
    initializedScenarios,
    markScenarioInitialized,
    setEmployeeDeptFilter,
  } = useOrgChartStore();
  const router = useRouter();
  const [departments, setDepartments] = useState<DepartmentAPI[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Keyboard shortcuts for undo/redo
  useUndoRedoKeys();

  // Add department dialog state
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    parentId: string | null;
    mode: "child" | "sibling" | "root";
  } | null>(null);

  // Пустой сценарий: показываем заглушку только после первой загрузки,
  // иначе она мигает между сменой сценария и ответом API
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);

  // Мультивыделение узлов (Ctrl/Cmd+клик, рамка по Shift) — id выделенных
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

  // Add parent dialog state
  const [addParentDialog, setAddParentDialog] = useState<{
    open: boolean;
    departmentId: string;
    currentParentId: string | null;
  } | null>(null);

  // Delete department dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    departmentId: string;
    departmentName: string;
    childCount: number;
  } | null>(null);

  // Fetch departments
  const refreshDepartments = useCallback(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data: DepartmentAPI[]) => {
        setDepartments(data);
        setDepartmentsLoaded(true);
      })
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => {
    refreshDepartments();
    fetchUndoRedoState();
  }, [refreshDepartments, fetchUndoRedoState, refreshCounter]);

  // Reset stale data when scenario changes (collapse state reset handled by store)
  useEffect(() => {
    setDepartments([]);
    setDepartmentsLoaded(false);
    setMultiSelectedIds([]);
  }, [currentScenarioId]);

  // On first load of a scenario (not yet initialized this session), collapse to L1
  useEffect(() => {
    if (departments.length > 0 && currentScenarioId && !initializedScenarios.has(currentScenarioId)) {
      const roots = new Set(
        departments.filter((d) => d.parentId === null).map((d) => d.id)
      );
      const toCollapse = new Set(
        departments
          .filter((d) => !roots.has(d.id) && d._count.children > 0)
          .map((d) => d.id)
      );
      setCollapsedIds(toCollapse);
      markScenarioInitialized(currentScenarioId);
    }
  }, [departments, currentScenarioId, initializedScenarios, setCollapsedIds, markScenarioInitialized]);

  const onToggleExpand = useCallback((id: string) => {
    toggleCollapsed(id);
  }, [toggleCollapsed]);

  // Double-click on a node → navigate to Employees filtered by this department
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const dept = departments.find((d) => d.id === node.id);
    if (dept) {
      setEmployeeDeptFilter({ id: dept.id, name: dept.name });
      router.push("/references/employees");
    }
  }, [departments, setEmployeeDeptFilter, router]);

  const onExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const onCollapseAll = useCallback(() => {
    const withChildren = new Set(
      departments.filter((d) => d._count.children > 0).map((d) => d.id)
    );
    setCollapsedIds(withChildren);
  }, [departments]);

  // Expand to specific level (task 6)
  const onExpandToLevel = useCallback(
    (level: number) => {
      // Compute depth for each department (root = 0, children of root = 1, etc.)
      const depthMap = new Map<string, number>();
      const parentMap = new Map(departments.map((d) => [d.id, d.parentId]));

      function getDepth(id: string): number {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const pid = parentMap.get(id);
        if (!pid) {
          depthMap.set(id, 0);
          return 0;
        }
        const d = getDepth(pid) + 1;
        depthMap.set(id, d);
        return d;
      }

      departments.forEach((d) => getDepth(d.id));

      // Collapse nodes at depth >= level that have children
      const toCollapse = new Set(
        departments
          .filter((d) => d._count.children > 0 && getDepth(d.id) >= level)
          .map((d) => d.id)
      );
      setCollapsedIds(toCollapse);
    },
    [departments]
  );

  const onSelectDepartment = useCallback(
    (id: string) => {
      setSelectedDepartmentId(id);
    },
    [setSelectedDepartmentId]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      setMultiSelectedIds(selectedNodes.map((n) => n.id));
    },
    []
  );

  const clearMultiSelection = useCallback(() => {
    setMultiSelectedIds([]);
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [setNodes]);

  const handleBulkApplied = useCallback(() => {
    clearMultiSelection();
    refreshDepartments();
    fetchUndoRedoState();
  }, [clearMultiSelection, refreshDepartments, fetchUndoRedoState]);

  const onToggleVertical = useCallback(
    (id: string) => {
      toggleVertical(id);
    },
    [toggleVertical]
  );

  const onAddChild = useCallback((departmentId: string) => {
    setAddDialog({ open: true, parentId: departmentId, mode: "child" });
  }, []);

  const onAddSibling = useCallback(
    (_departmentId: string, parentId: string | null) => {
      setAddDialog({ open: true, parentId, mode: "sibling" });
    },
    []
  );

  const onAddParent = useCallback(
    (departmentId: string) => {
      const dept = departments.find((d) => d.id === departmentId);
      if (!dept) return;
      setAddParentDialog({
        open: true,
        departmentId,
        currentParentId: dept.parentId,
      });
    },
    [departments]
  );

  const onDeleteDepartment = useCallback(
    (departmentId: string) => {
      const dept = departments.find((d) => d.id === departmentId);
      if (!dept) return;
      const childCount = departments.filter(
        (d) => d.parentId === departmentId
      ).length;
      setDeleteDialog({
        open: true,
        departmentId,
        departmentName: dept.name,
        childCount,
      });
    },
    [departments]
  );

  const handleDeleteConfirm = useCallback(
    async (mode: "cascade" | "reparent" | "simple") => {
      if (!deleteDialog) return;
      const { departmentId } = deleteDialog;

      // Close dialog and panel immediately
      setDeleteDialog(null);
      if (selectedDepartmentId === departmentId) {
        setSelectedDepartmentId(null);
      }

      // Optimistically remove from local state
      setDepartments((prev) => {
        if (mode === "cascade") {
          const toRemove = new Set<string>();
          function collectTree(id: string) {
            toRemove.add(id);
            prev.filter((d) => d.parentId === id).forEach((d) => collectTree(d.id));
          }
          collectTree(departmentId);
          return prev.filter((d) => !toRemove.has(d.id));
        }
        if (mode === "reparent") {
          const deleted = prev.find((d) => d.id === departmentId);
          return prev
            .filter((d) => d.id !== departmentId)
            .map((d) =>
              d.parentId === departmentId
                ? { ...d, parentId: deleted?.parentId ?? null }
                : d
            );
        }
        return prev.filter((d) => d.id !== departmentId);
      });

      let url = `/api/departments/${departmentId}`;
      if (mode === "cascade") url += "?cascade=true";
      else if (mode === "reparent") url += "?reparent=true";

      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error);
      }
      refreshDepartments();
    },
    [deleteDialog, selectedDepartmentId, setSelectedDepartmentId, refreshDepartments]
  );

  async function handleAddDepartment(data: {
    name: string;
    shetilType: ShetilType;
  }) {
    if (!addDialog || !currentScenarioId) return;

    await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: currentScenarioId,
        parentId: addDialog.parentId,
        name: data.name,
        shetilType: data.shetilType,
      }),
    });

    setAddDialog(null);
    refreshDepartments();
  }

  // Build visible nodes/edges from departments and collapsed state
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (departments.length === 0)
      return { visibleNodes: [], visibleEdges: [] };

    // Find all hidden department IDs (children of collapsed nodes, recursively)
    const hiddenIds = new Set<string>();
    function hideChildren(parentId: string) {
      departments
        .filter((d) => d.parentId === parentId)
        .forEach((child) => {
          hiddenIds.add(child.id);
          hideChildren(child.id);
        });
    }
    collapsedIds.forEach((id) => hideChildren(id));

    const visible = departments.filter((d) => !hiddenIds.has(d.id));

    const vNodes: Node[] = visible.map((dept) => {
      const override = departmentOverrides[dept.id];
      const effectiveMode = override ?? metricsMode;
      const effectiveMetrics = aggregateMetrics(
        departments,
        dept.id,
        effectiveMode,
        selectedLevels
      );
      const isAggregated = effectiveMode !== "own";

      return {
        id: dept.id,
        type: "department",
        position: { x: 0, y: 0 },
        data: {
          label: dept.name,
          shetilType: dept.shetilType,
          headName: dept.head?.fullName ?? null,
          pp: effectiveMetrics.pp,
          opp: effectiveMetrics.opp,
          aup: effectiveMetrics.aup,
          hasChildren: dept._count.children > 0,
          isExpanded: !collapsedIds.has(dept.id),
          departmentId: dept.id,
          parentId: dept.parentId,
          isAggregated,
          isVertical: verticalIds.has(dept.id),
          onToggleExpand,
          onSelectDepartment,
          onAddChild,
          onAddSibling,
          onAddParent,
          onDeleteDepartment,
          onToggleVertical,
        } as DepartmentNodeData as unknown as Record<string, unknown>,
      };
    });

    const visibleIdSet = new Set(visible.map((d) => d.id));
    const vEdges: Edge[] = visible
      .filter((d) => d.parentId && visibleIdSet.has(d.parentId))
      .map((d) => ({
        id: `${d.parentId}-${d.id}`,
        source: d.parentId!,
        target: d.id,
        type: "smoothstep",
      }));

    return { visibleNodes: vNodes, visibleEdges: vEdges };
  }, [
    departments,
    collapsedIds,
    metricsMode,
    selectedLevels,
    departmentOverrides,
    verticalIds,
    onToggleExpand,
    onSelectDepartment,
    onAddChild,
    onAddSibling,
    onAddParent,
    onDeleteDepartment,
    onToggleVertical,
  ]);

  // Apply layout
  useEffect(() => {
    if (visibleNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(
      visibleNodes,
      visibleEdges,
      verticalIds,
      departments
    );
    setNodes(layouted);
    setEdges(layoutedEdges);
  }, [visibleNodes, visibleEdges, verticalIds, departments, setNodes, setEdges]);

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <MetricsToolbar
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        onExpandToLevel={onExpandToLevel}
      />
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          multiSelectionKeyCode={["Meta", "Control"]}
          selectionKeyCode="Shift"
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "#d4d4d4", strokeWidth: 1.5 },
          }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
        {departmentsLoaded && departments.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-md rounded-[var(--r-lg)] border border-line bg-white p-8 text-center shadow-card">
              <Network className="mx-auto mb-4 h-10 w-10 text-ink-300" />
              <h3 className="mb-1 font-head text-xl">В сценарии пока нет подразделений</h3>
              <p className="mb-6 text-[13px] text-ink-500">
                Начните с корневого подразделения и достраивайте структуру кнопками «+»
                на блоках — или загрузите готовую оргструктуру из Excel.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() =>
                    setAddDialog({ open: true, parentId: null, mode: "root" })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Создать корневое подразделение
                </Button>
                <Button variant="outline" onClick={() => setShowExcelImport(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Импортировать из Excel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ShetilLegend />
            {multiSelectedIds.length >= 2 && currentScenarioId && (
              <BulkActionsBar
                scenarioId={currentScenarioId}
                selectedIds={multiSelectedIds}
                onApplied={handleBulkApplied}
                onClear={clearMultiSelection}
              />
            )}
          </>
        )}
      </div>

      <ExcelImport
        open={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        scenarioId={currentScenarioId}
        onImportComplete={() => {
          setShowExcelImport(false);
          refreshDepartments();
        }}
      />

      {addDialog && (
        <AddDepartmentDialog
          open={addDialog.open}
          onClose={() => setAddDialog(null)}
          onSubmit={handleAddDepartment}
          title={
            addDialog.mode === "root"
              ? "Создать корневое подразделение"
              : addDialog.mode === "child"
                ? "Добавить дочернее подразделение"
                : "Добавить параллельное подразделение"
          }
        />
      )}

      {deleteDialog && (
        <DeleteDepartmentDialog
          open={deleteDialog.open}
          onClose={() => setDeleteDialog(null)}
          onConfirm={handleDeleteConfirm}
          childCount={deleteDialog.childCount}
          departmentName={deleteDialog.departmentName}
        />
      )}

      {addParentDialog && currentScenarioId && (
        <AddParentDialog
          open={addParentDialog.open}
          onClose={() => setAddParentDialog(null)}
          departmentId={addParentDialog.departmentId}
          currentParentId={addParentDialog.currentParentId}
          scenarioId={currentScenarioId}
          onComplete={() => {
            setAddParentDialog(null);
            refreshDepartments();
          }}
        />
      )}
    </div>
  );
}
