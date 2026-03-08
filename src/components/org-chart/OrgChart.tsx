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
import dagre from "dagre";
import { DepartmentNode, type DepartmentNodeData } from "./DepartmentNode";
import { ShetilLegend } from "./ShetilLegend";
import { MetricsToolbar } from "./MetricsToolbar";
import { AddDepartmentDialog } from "./AddDepartmentDialog";
import { DeleteDepartmentDialog } from "./DeleteDepartmentDialog";
import { AddParentDialog } from "@/components/department-card/AddParentDialog";
import { useOrgChartStore } from "@/lib/store";
import { useUndoRedoKeys } from "@/hooks/useUndoRedoKeys";
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

/**
 * Hybrid layout: dagre for horizontal subtrees, manual positioning for vertical.
 *
 * Vertical subtrees are removed from dagre. The vertical parent node is enlarged
 * in dagre to reserve space for its subtree (extends to the right and below).
 * After dagre runs, vertical children are placed manually.
 */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  verticalIds: Set<string>,
  departments: DepartmentAPI[]
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const visibleIdSet = new Set(nodes.map((n) => n.id));

  // Build children map from edges (only visible nodes)
  const childrenMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = childrenMap.get(edge.source) ?? [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  });

  // Determine effective vertical status (cascading from ancestors)
  const effectiveVerticalCache = new Map<string, boolean>();
  const deptMap = new Map(
    departments.filter((d) => visibleIdSet.has(d.id)).map((d) => [d.id, d])
  );

  function isEffectivelyVertical(id: string): boolean {
    if (effectiveVerticalCache.has(id))
      return effectiveVerticalCache.get(id)!;
    let result = false;
    if (verticalIds.has(id)) {
      result = true;
    } else {
      const dept = deptMap.get(id);
      if (dept?.parentId && visibleIdSet.has(dept.parentId)) {
        result = isEffectivelyVertical(dept.parentId);
      }
    }
    effectiveVerticalCache.set(id, result);
    return result;
  }

  // Collect manually positioned nodes (children of effectively vertical nodes)
  const manualNodeIds = new Set<string>();
  function collectManualDescendants(parentId: string) {
    const children = childrenMap.get(parentId) ?? [];
    children.forEach((childId) => {
      manualNodeIds.add(childId);
      collectManualDescendants(childId);
    });
  }

  nodes.forEach((node) => {
    if (isEffectivelyVertical(node.id) && !manualNodeIds.has(node.id)) {
      collectManualDescendants(node.id);
    }
  });

  // Compute vertical extent: total height of node + all stacked vertical descendants
  const verticalExtentCache = new Map<string, number>();
  function verticalExtent(nodeId: string): number {
    if (verticalExtentCache.has(nodeId)) return verticalExtentCache.get(nodeId)!;

    const children = (childrenMap.get(nodeId) ?? []).filter((id) =>
      manualNodeIds.has(id)
    );
    if (children.length === 0) {
      verticalExtentCache.set(nodeId, NODE_HEIGHT);
      return NODE_HEIGHT;
    }

    let childrenH = 0;
    children.forEach((childId, i) => {
      if (i > 0) childrenH += V_GAP;
      childrenH += verticalExtent(childId);
    });

    const result = NODE_HEIGHT + RANKSEP + childrenH;
    verticalExtentCache.set(nodeId, result);
    return result;
  }

  // Compute horizontal extent: total width of node + all indented descendants
  const horizontalExtentCache = new Map<string, number>();
  function horizontalExtent(nodeId: string): number {
    if (horizontalExtentCache.has(nodeId)) return horizontalExtentCache.get(nodeId)!;

    const children = (childrenMap.get(nodeId) ?? []).filter((id) =>
      manualNodeIds.has(id)
    );
    if (children.length === 0) {
      horizontalExtentCache.set(nodeId, NODE_WIDTH);
      return NODE_WIDTH;
    }

    let maxChildW = 0;
    children.forEach((childId) => {
      maxChildW = Math.max(maxChildW, horizontalExtent(childId));
    });

    const result = Math.max(NODE_WIDTH, INDENT + maxChildW);
    horizontalExtentCache.set(nodeId, result);
    return result;
  }

  // Set up dagre — height = NODE_HEIGHT for ALL nodes (dagre only handles X + rank)
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: RANKSEP });

  const dagreNodes = nodes.filter((n) => !manualNodeIds.has(n.id));

  dagreNodes.forEach((node) => {
    const w = horizontalExtent(node.id);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  });

  // Add edges only between dagre nodes
  edges
    .filter(
      (e) => !manualNodeIds.has(e.source) && !manualNodeIds.has(e.target)
    )
    .forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  // Compute dagre depth (rank) for each dagre node
  const depthCache = new Map<string, number>();
  function getDagreDepth(id: string): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const dept = deptMap.get(id);
    if (!dept?.parentId || !visibleIdSet.has(dept.parentId) || manualNodeIds.has(dept.parentId)) {
      depthCache.set(id, 0);
      return 0;
    }
    const result = getDagreDepth(dept.parentId) + 1;
    depthCache.set(id, result);
    return result;
  }

  // Group dagre nodes by rank, find max verticalExtent per rank
  const rankGroups = new Map<number, string[]>();
  let maxRank = 0;
  dagreNodes.forEach((n) => {
    const d = getDagreDepth(n.id);
    maxRank = Math.max(maxRank, d);
    const group = rankGroups.get(d);
    if (group) {
      group.push(n.id);
    } else {
      rankGroups.set(d, [n.id]);
    }
  });

  const rankMaxExtent = new Map<number, number>();
  rankGroups.forEach((ids, rank) => {
    rankMaxExtent.set(rank, Math.max(...ids.map((id) => verticalExtent(id))));
  });

  // Cumulative Y positions per rank
  const rankY = new Map<number, number>();
  let cumY = 0;
  for (let r = 0; r <= maxRank; r++) {
    rankY.set(r, cumY);
    cumY += (rankMaxExtent.get(r) ?? NODE_HEIGHT) + RANKSEP;
  }

  // Position dagre nodes: X from dagre, Y from rank computation
  const positions = new Map<string, { x: number; y: number }>();

  dagreNodes.forEach((node) => {
    const dagreNode = g.node(node.id);
    const w = horizontalExtent(node.id);
    positions.set(node.id, {
      x: dagreNode.x - w / 2,
      y: rankY.get(getDagreDepth(node.id)) ?? 0,
    });
  });

  // Position vertical children below parent, indented
  function positionVerticalChildren(parentId: string) {
    const parentPos = positions.get(parentId)!;
    const children = (childrenMap.get(parentId) ?? []).filter((id) =>
      manualNodeIds.has(id)
    );

    let currentY = parentPos.y + NODE_HEIGHT + RANKSEP;
    const childX = parentPos.x + INDENT;

    children.forEach((childId, i) => {
      if (i > 0) currentY += V_GAP;
      positions.set(childId, { x: childX, y: currentY });
      positionVerticalChildren(childId);
      currentY += verticalExtent(childId);
    });
  }

  // Find vertical roots in dagre and position their children
  dagreNodes
    .filter((n) => isEffectivelyVertical(n.id))
    .forEach((node) => {
      positionVerticalChildren(node.id);
    });

  // Build final nodes with positions
  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));

  // Build edges with correct handles for vertical children
  const layoutedEdges = edges.map((edge) => {
    if (manualNodeIds.has(edge.target)) {
      // Child is in a vertical subtree — use bottom→left handles
      return {
        ...edge,
        sourceHandle: "bottom",
        targetHandle: "left",
        type: "smoothstep",
      };
    }
    return edge;
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
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
    collapseInitialized,
    setCollapseInitialized,
  } = useOrgChartStore();
  const [departments, setDepartments] = useState<DepartmentAPI[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Keyboard shortcuts for undo/redo
  useUndoRedoKeys();

  // Add department dialog state
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    parentId: string | null;
    mode: "child" | "sibling";
  } | null>(null);

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
      .then((data: DepartmentAPI[]) => setDepartments(data))
      .catch(() => {});
  }, [currentScenarioId]);

  useEffect(() => {
    refreshDepartments();
    fetchUndoRedoState();
  }, [refreshDepartments, fetchUndoRedoState, refreshCounter]);

  // Reset stale data when scenario changes (collapse state reset handled by store)
  useEffect(() => {
    setDepartments([]);
  }, [currentScenarioId]);

  // On first load, collapse all except root → show only L1 (direct children of root)
  useEffect(() => {
    if (departments.length > 0 && !collapseInitialized) {
      const roots = new Set(
        departments.filter((d) => d.parentId === null).map((d) => d.id)
      );
      const toCollapse = new Set(
        departments
          .filter((d) => !roots.has(d.id) && d._count.children > 0)
          .map((d) => d.id)
      );
      setCollapsedIds(toCollapse);
      setCollapseInitialized(true);
    }
  }, [departments, collapseInitialized, setCollapsedIds, setCollapseInitialized]);

  const onToggleExpand = useCallback((id: string) => {
    toggleCollapsed(id);
  }, [toggleCollapsed]);

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
        <ShetilLegend />
      </div>

      {addDialog && (
        <AddDepartmentDialog
          open={addDialog.open}
          onClose={() => setAddDialog(null)}
          onSubmit={handleAddDepartment}
          title={
            addDialog.mode === "child"
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
