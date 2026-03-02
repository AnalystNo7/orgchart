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
import { useOrgChartStore } from "@/lib/store";
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
const H_GAP = 60; // horizontal gap: parent → children in vertical mode
const V_GAP = 20; // vertical gap between siblings in vertical mode

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

  // Compute vertical subtree dimensions (space needed to the right/below)
  const subtreeSizeCache = new Map<string, { w: number; h: number }>();
  function computeSubtreeSize(nodeId: string): { w: number; h: number } {
    if (subtreeSizeCache.has(nodeId)) return subtreeSizeCache.get(nodeId)!;

    const children = (childrenMap.get(nodeId) ?? []).filter((id) =>
      manualNodeIds.has(id)
    );
    if (children.length === 0) {
      const result = { w: 0, h: 0 };
      subtreeSizeCache.set(nodeId, result);
      return result;
    }

    let totalH = 0;
    let maxChildTotalW = 0;

    children.forEach((childId, i) => {
      if (i > 0) totalH += V_GAP;
      const childSub = computeSubtreeSize(childId);
      totalH += Math.max(NODE_HEIGHT, childSub.h);
      const childW =
        NODE_WIDTH + (childSub.w > 0 ? childSub.w : 0);
      maxChildTotalW = Math.max(maxChildTotalW, childW);
    });

    const result = { w: H_GAP + maxChildTotalW, h: totalH };
    subtreeSizeCache.set(nodeId, result);
    return result;
  }

  // Set up dagre with enlarged sizes for vertical parent nodes
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });

  const dagreSizes = new Map<string, { w: number; h: number }>();

  nodes
    .filter((n) => !manualNodeIds.has(n.id))
    .forEach((node) => {
      const isVert = isEffectivelyVertical(node.id);
      const subtree = isVert
        ? computeSubtreeSize(node.id)
        : { w: 0, h: 0 };
      const w = NODE_WIDTH + subtree.w;
      const h = Math.max(NODE_HEIGHT, subtree.h);
      dagreSizes.set(node.id, { w, h });
      g.setNode(node.id, { width: w, height: h });
    });

  // Add edges only between dagre nodes
  edges
    .filter(
      (e) => !manualNodeIds.has(e.source) && !manualNodeIds.has(e.target)
    )
    .forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  // Extract dagre positions — node visual at left-top of allocated space
  const positions = new Map<string, { x: number; y: number }>();

  nodes
    .filter((n) => !manualNodeIds.has(n.id))
    .forEach((node) => {
      const dagreNode = g.node(node.id);
      const size = dagreSizes.get(node.id)!;
      positions.set(node.id, {
        x: dagreNode.x - size.w / 2,
        y: dagreNode.y - size.h / 2,
      });
    });

  // Position vertical children manually (to the right, stacked)
  function positionVerticalChildren(parentId: string) {
    const parentPos = positions.get(parentId)!;
    const children = (childrenMap.get(parentId) ?? []).filter((id) =>
      manualNodeIds.has(id)
    );

    let currentY = parentPos.y;
    const childX = parentPos.x + NODE_WIDTH + H_GAP;

    children.forEach((childId, i) => {
      if (i > 0) currentY += V_GAP;
      positions.set(childId, { x: childX, y: currentY });

      // Recursively position grandchildren
      positionVerticalChildren(childId);

      const childSub = computeSubtreeSize(childId);
      currentY += Math.max(NODE_HEIGHT, childSub.h);
    });
  }

  // Find vertical roots in dagre and position their children
  nodes
    .filter(
      (n) => !manualNodeIds.has(n.id) && isEffectivelyVertical(n.id)
    )
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
      // Child is in a vertical subtree — use right→left handles
      return {
        ...edge,
        sourceHandle: "right",
        targetHandle: "left",
        type: "step",
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
  } = useOrgChartStore();
  const [departments, setDepartments] = useState<DepartmentAPI[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Add department dialog state
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    parentId: string | null;
    mode: "child" | "sibling";
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
  }, [refreshDepartments, refreshCounter]);

  const onToggleExpand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const onCollapseAll = useCallback(() => {
    const withChildren = new Set(
      departments.filter((d) => d._count.children > 0).map((d) => d.id)
    );
    setCollapsedIds(withChildren);
  }, [departments]);

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

  const onDeleteDepartment = useCallback(
    async (departmentId: string) => {
      const childCount = departments.filter(
        (d) => d.parentId === departmentId
      ).length;

      if (childCount > 0) {
        if (
          !confirm(
            `Подразделение имеет ${childCount} дочерних элементов. Удаление приведёт к их каскадному удалению. Продолжить?`
          )
        ) {
          return;
        }
        const res = await fetch(
          `/api/departments/${departmentId}?cascade=true`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json();
          alert(data.error);
          return;
        }
      } else {
        if (!confirm("Удалить подразделение?")) return;
        const res = await fetch(`/api/departments/${departmentId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error);
          return;
        }
      }

      if (selectedDepartmentId === departmentId) {
        setSelectedDepartmentId(null);
      }
      refreshDepartments();
    },
    [
      departments,
      selectedDepartmentId,
      setSelectedDepartmentId,
      refreshDepartments,
    ]
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
    </div>
  );
}
