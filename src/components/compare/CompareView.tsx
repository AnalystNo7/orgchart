"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { DiffNode, type DiffNodeData } from "./DiffNode";
import { computeDiff, type DiffDepartment, type DiffSummary } from "@/lib/diff";
import { Plus, Minus, ArrowLeftRight, Pencil, ChevronsDownUp, ChevronsUpDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShetilLegend } from "@/components/org-chart/ShetilLegend";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;

function layoutTree(nodes: Node[], edges: Edge[]) {
  if (nodes.length === 0) return { nodes: [], edges };
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const layouted = nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
  return { nodes: layouted, edges };
}

const nodeTypes: NodeTypes = {
  diff: DiffNode as unknown as NodeTypes["diff"],
};

interface CompareViewProps {
  leftScenarioId: string;
  rightScenarioId: string;
}

export function CompareView({ leftScenarioId, rightScenarioId }: CompareViewProps) {
  const [leftDepts, setLeftDepts] = useState<DiffDepartment[]>([]);
  const [rightDepts, setRightDepts] = useState<DiffDepartment[]>([]);
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState<Set<string>>(new Set());
  const [rightCollapsed, setRightCollapsed] = useState<Set<string>>(new Set());
  const [initialApplied, setInitialApplied] = useState(false);

  useEffect(() => {
    setInitialApplied(false);
    setLeftCollapsed(new Set());
    setRightCollapsed(new Set());
    Promise.all([
      fetch(`/api/departments?scenarioId=${leftScenarioId}`).then((r) => r.json()),
      fetch(`/api/departments?scenarioId=${rightScenarioId}`).then((r) => r.json()),
    ]).then(([left, right]) => {
      const result = computeDiff(left, right);
      setLeftDepts(result.left);
      setRightDepts(result.right);
      setSummary(result.summary);
    });
  }, [leftScenarioId, rightScenarioId]);

  // Initial collapse: show only L1
  useEffect(() => {
    if (leftDepts.length > 0 && rightDepts.length > 0 && !initialApplied) {
      const collapseNonRoot = (depts: DiffDepartment[]) => {
        const roots = new Set(depts.filter((d) => d.parentId === null).map((d) => d.id));
        return new Set(
          depts.filter((d) => !roots.has(d.id) && d._count.children > 0).map((d) => d.id)
        );
      };
      setLeftCollapsed(collapseNonRoot(leftDepts));
      setRightCollapsed(collapseNonRoot(rightDepts));
      setInitialApplied(true);
    }
  }, [leftDepts, rightDepts, initialApplied]);

  // Depth computation helper
  const computeDepthMap = useCallback((depts: DiffDepartment[]) => {
    const depthMap = new Map<string, number>();
    const parentMap = new Map(depts.map((d) => [d.id, d.parentId]));
    function getDepth(id: string): number {
      if (depthMap.has(id)) return depthMap.get(id)!;
      const pid = parentMap.get(id);
      if (!pid) { depthMap.set(id, 0); return 0; }
      const d = getDepth(pid) + 1;
      depthMap.set(id, d);
      return d;
    }
    depts.forEach((d) => getDepth(d.id));
    return depthMap;
  }, []);

  const onExpandAll = useCallback(() => {
    setLeftCollapsed(new Set());
    setRightCollapsed(new Set());
  }, []);

  const onCollapseAll = useCallback(() => {
    setLeftCollapsed(new Set(leftDepts.filter((d) => d._count.children > 0).map((d) => d.id)));
    setRightCollapsed(new Set(rightDepts.filter((d) => d._count.children > 0).map((d) => d.id)));
  }, [leftDepts, rightDepts]);

  const onExpandToLevel = useCallback(
    (level: number) => {
      const leftDepths = computeDepthMap(leftDepts);
      const rightDepths = computeDepthMap(rightDepts);
      setLeftCollapsed(
        new Set(leftDepts.filter((d) => d._count.children > 0 && (leftDepths.get(d.id) ?? 0) >= level).map((d) => d.id))
      );
      setRightCollapsed(
        new Set(rightDepts.filter((d) => d._count.children > 0 && (rightDepths.get(d.id) ?? 0) >= level).map((d) => d.id))
      );
    },
    [leftDepts, rightDepts, computeDepthMap]
  );

  const onToggleLeftExpand = useCallback((id: string) => {
    setLeftCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onToggleRightExpand = useCallback((id: string) => {
    setRightCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function buildGraph(
    depts: DiffDepartment[],
    collapsedIds: Set<string>,
    onToggleExpand: (id: string) => void
  ) {
    // Find hidden IDs
    const hiddenIds = new Set<string>();
    function hideChildren(parentId: string) {
      depts
        .filter((d) => d.parentId === parentId)
        .forEach((child) => {
          hiddenIds.add(child.id);
          hideChildren(child.id);
        });
    }
    collapsedIds.forEach((id) => hideChildren(id));

    const visible = depts.filter((d) => !hiddenIds.has(d.id));

    const nodes: Node[] = visible.map((d) => ({
      id: d.id,
      type: "diff" as const,
      position: { x: 0, y: 0 },
      data: {
        label: d.name,
        shetilType: d.shetilType,
        headName: d.head?.fullName ?? null,
        pp: d.metrics.pp,
        opp: d.metrics.opp,
        aup: d.metrics.aup,
        diffStatus: d.diffStatus,
        changes: d.changes,
        hasChildren: d._count.children > 0,
        isExpanded: !collapsedIds.has(d.id),
        departmentId: d.id,
        parentId: d.parentId,
        onToggleExpand,
      } as DiffNodeData as unknown as Record<string, unknown>,
    }));

    const visibleIdSet = new Set(visible.map((d) => d.id));
    const edges: Edge[] = visible
      .filter((d) => d.parentId && visibleIdSet.has(d.parentId))
      .map((d) => ({
        id: `${d.parentId}-${d.id}`,
        source: d.parentId!,
        target: d.id,
        type: "smoothstep",
        style: { stroke: "#d4d4d4", strokeWidth: 1.5 },
      }));

    return layoutTree(nodes, edges);
  }

  const leftGraph = useMemo(
    () => buildGraph(leftDepts, leftCollapsed, onToggleLeftExpand),
    [leftDepts, leftCollapsed, onToggleLeftExpand]
  );
  const rightGraph = useMemo(
    () => buildGraph(rightDepts, rightCollapsed, onToggleRightExpand),
    [rightDepts, rightCollapsed, onToggleRightExpand]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-neutral-50 px-4 py-2">
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" title="Показать до уровня">
                <ChevronsUpDown className="mr-1 h-4 w-4" />
                Уровень
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExpandToLevel(1)}>
                L1 — только блоки
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExpandToLevel(2)}>
                L2 — управления
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExpandToLevel(3)}>
                L3 — подразделения
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExpandToLevel(4)}>
                L4 — дочерние
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExpandAll}>
                Все уровни
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapseAll}
            title="Свернуть всё"
          >
            <ChevronsDownUp className="mr-1 h-4 w-4" />
            Свернуть
          </Button>
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1">
        <div className="relative flex-1 border-r">
          <div className="border-b bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500">
            BASELINE
          </div>
          <div className="h-[calc(100%-28px)]">
            <ReactFlow
              nodes={leftGraph.nodes}
              edges={leftGraph.edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: { stroke: "#d4d4d4", strokeWidth: 1.5 },
              }}
            >
              <Controls position="top-left" />
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </div>
          <ShetilLegend />
        </div>
        <div className="relative flex-1">
          <div className="border-b bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500">
            СЦЕНАРИЙ
          </div>
          <div className="h-[calc(100%-28px)]">
            <ReactFlow
              nodes={rightGraph.nodes}
              edges={rightGraph.edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: { stroke: "#d4d4d4", strokeWidth: 1.5 },
              }}
            >
              <Controls position="top-left" />
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="flex items-center gap-6 border-t bg-neutral-50 px-6 py-3 text-sm">
          <span className="flex items-center gap-1.5 text-green-600">
            <Plus className="h-4 w-4" /> Добавлено: {summary.added}
          </span>
          <span className="flex items-center gap-1.5 text-red-600">
            <Minus className="h-4 w-4" /> Удалено: {summary.removed}
          </span>
          <span className="flex items-center gap-1.5 text-blue-600">
            <ArrowLeftRight className="h-4 w-4" /> Перемещено: {summary.moved}
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <Pencil className="h-4 w-4" /> Изменено: {summary.modified}
          </span>
        </div>
      )}
    </div>
  );
}
