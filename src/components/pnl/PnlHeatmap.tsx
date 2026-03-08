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
import { HeatmapNode, type HeatmapNodeData } from "./HeatmapNode";
import { PnlFilterPanel } from "./PnlFilterPanel";
import { PnlLegend } from "./PnlLegend";
import { useOrgChartStore } from "@/lib/store";

interface DepartmentAPI {
  id: string;
  parentId: string | null;
  name: string;
  shetilType: "REVENUE" | "RESOURCE" | "SERVICE" | "BACKOFFICE";
  _count: { children: number };
}

interface PnlDataItem {
  departmentId: string;
  departmentName?: string;
  shetilType?: string;
  isEarning?: boolean;
  revenue: number;
  cost: number;
  pnl: number;
  childrenPnl?: number;
  totalPnl?: number;
  warningCount?: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

const nodeTypes: NodeTypes = {
  heatmap: HeatmapNode as unknown as NodeTypes["heatmap"],
};

export function PnlHeatmap() {
  const {
    currentScenarioId,
    pnlDisplayMode,
    setPnlDrillDownDeptId,
    collapsedIds,
    setCollapsedIds,
    toggleCollapsed,
    initializedScenarios,
    markScenarioInitialized,
  } = useOrgChartStore();

  const [departments, setDepartments] = useState<DepartmentAPI[]>([]);
  const [pnlData, setPnlData] = useState<PnlDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);

  // Period state
  const currentYear = new Date().getFullYear();
  const [periodStart, setPeriodStart] = useState(
    `${currentYear}-01-01`
  );
  const [periodEnd, setPeriodEnd] = useState(
    `${currentYear}-12-31`
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Thresholds for color scale (persisted to localStorage)
  const [thresholds, setThresholdsRaw] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pnlThresholds");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {
      deepRed: -500000,
      red: -100000,
      yellow: 0,
      green: 500000,
      deepGreen: 1000000,
    };
  });
  const setThresholds = useCallback((t: typeof thresholds) => {
    setThresholdsRaw(t);
    localStorage.setItem("pnlThresholds", JSON.stringify(t));
  }, []);

  // Fetch departments
  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data: DepartmentAPI[]) => {
        setDepartments(data);
      })
      .catch(() => {});
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

  // Expand/Collapse controls
  const onExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, [setCollapsedIds]);

  const onCollapseAll = useCallback(() => {
    const withChildren = new Set(
      departments.filter((d) => d._count.children > 0).map((d) => d.id)
    );
    setCollapsedIds(withChildren);
  }, [departments, setCollapsedIds]);

  const onExpandToLevel = useCallback(
    (level: number) => {
      const depthMap = new Map<string, number>();
      const parentMap = new Map(departments.map((d) => [d.id, d.parentId]));

      function getDepth(id: string): number {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const pid = parentMap.get(id);
        if (!pid) { depthMap.set(id, 0); return 0; }
        const d = getDepth(pid) + 1;
        depthMap.set(id, d);
        return d;
      }

      departments.forEach((d) => getDepth(d.id));

      const toCollapse = new Set(
        departments
          .filter((d) => d._count.children > 0 && getDepth(d.id) >= level)
          .map((d) => d.id)
      );
      setCollapsedIds(toCollapse);
    },
    [departments, setCollapsedIds]
  );

  // Calculate P&L
  const runCalculation = useCallback(async () => {
    if (!currentScenarioId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pnl?scenarioId=${currentScenarioId}&mode=${pnlDisplayMode}&periodStart=${periodStart}&periodEnd=${periodEnd}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        console.error("[PnlHeatmap] API error:", json);
        return;
      }
      setPnlData(json.data ?? []);
      setCalculatedAt(json.calculatedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[PnlHeatmap] Fetch error:", msg);
    } finally {
      setLoading(false);
    }
  }, [currentScenarioId, pnlDisplayMode, periodStart, periodEnd]);

  // Auto-calculate on mode/period change
  useEffect(() => {
    if (currentScenarioId && departments.length > 0) {
      runCalculation();
    }
  }, [currentScenarioId, pnlDisplayMode, periodStart, periodEnd, departments.length, runCalculation]);

  // Build pnl data map
  const pnlMap = useMemo(() => {
    const m = new Map<string, PnlDataItem>();
    pnlData.forEach((d) => m.set(d.departmentId, d));
    return m;
  }, [pnlData]);

  const onSelectDepartment = useCallback(
    (id: string) => {
      setPnlDrillDownDeptId(id);
    },
    [setPnlDrillDownDeptId]
  );

  // Build visible nodes/edges
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (departments.length === 0)
      return { visibleNodes: [], visibleEdges: [] };

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
      const pnl = pnlMap.get(dept.id);
      return {
        id: dept.id,
        type: "heatmap",
        position: { x: 0, y: 0 },
        data: {
          label: dept.name,
          shetilType: dept.shetilType,
          revenue: pnl?.revenue ?? 0,
          cost: pnl?.cost ?? 0,
          pnl: pnl?.pnl ?? 0,
          totalPnl: pnl?.totalPnl ?? 0,
          childrenPnl: pnl?.childrenPnl ?? 0,
          warningCount: pnl?.warningCount ?? 0,
          hasChildren: dept._count.children > 0,
          isExpanded: !collapsedIds.has(dept.id),
          thresholds,
          onToggleExpand,
          onSelectDepartment,
          departmentId: dept.id,
        } as HeatmapNodeData as unknown as Record<string, unknown>,
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
  }, [departments, collapsedIds, pnlMap, thresholds, onToggleExpand, onSelectDepartment]);

  // Layout
  useEffect(() => {
    if (visibleNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(
      visibleNodes,
      visibleEdges
    );
    setNodes(layouted);
    setEdges(layoutedEdges);
  }, [visibleNodes, visibleEdges, setNodes, setEdges]);

  if (!currentScenarioId) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-400">
        Выберите сценарий
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <PnlFilterPanel
        periodStart={periodStart}
        periodEnd={periodEnd}
        setPeriodStart={setPeriodStart}
        setPeriodEnd={setPeriodEnd}
        loading={loading}
        calculatedAt={calculatedAt}
        onRecalculate={runCalculation}
        thresholds={thresholds}
        setThresholds={setThresholds}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        onExpandToLevel={onExpandToLevel}
      />
      {error && (
        <div className="mx-4 mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Ошибка расчёта: {error}
        </div>
      )}
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
        <PnlLegend thresholds={thresholds} setThresholds={setThresholds} />
      </div>
    </div>
  );
}
