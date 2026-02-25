"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Plus, Minus, ArrowLeftRight, Pencil } from "lucide-react";

const NODE_WIDTH = 170;
const NODE_HEIGHT = 80;

function layoutTree(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 60 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

function buildNodesEdges(depts: DiffDepartment[]) {
  const nodes: Node[] = depts.map((d) => ({
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
    } as DiffNodeData as unknown as Record<string, unknown>,
  }));

  const idSet = new Set(depts.map((d) => d.id));
  const edges: Edge[] = depts
    .filter((d) => d.parentId && idSet.has(d.parentId))
    .map((d) => ({
      id: `${d.parentId}-${d.id}`,
      source: d.parentId!,
      target: d.id,
      type: "smoothstep",
      style: { stroke: "#d4d4d4", strokeWidth: 1 },
    }));

  const layouted = layoutTree(nodes, edges);
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

  useEffect(() => {
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

  const leftGraph = useMemo(() => buildNodesEdges(leftDepts), [leftDepts]);
  const rightGraph = useMemo(() => buildNodesEdges(rightDepts), [rightDepts]);

  return (
    <div className="flex h-full flex-col">
      {/* Split view */}
      <div className="flex flex-1">
        <div className="flex-1 border-r">
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
            >
              <Controls position="top-left" />
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </div>
        </div>
        <div className="flex-1">
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
          <span className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Добавлено: {summary.added}
          </span>
          <span className="flex items-center gap-1.5">
            <Minus className="h-4 w-4" /> Удалено: {summary.removed}
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4" /> Перемещено: {summary.moved}
          </span>
          <span className="flex items-center gap-1.5">
            <Pencil className="h-4 w-4" /> Изменено: {summary.modified}
          </span>
        </div>
      )}
    </div>
  );
}
