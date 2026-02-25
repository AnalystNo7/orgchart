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
import { useOrgChartStore } from "@/lib/store";

interface DepartmentAPI {
  id: string;
  parentId: string | null;
  name: string;
  shetilType: "REVENUE" | "RESOURCE" | "SERVICE" | "BACKOFFICE";
  head: { id: string; fullName: string } | null;
  _count: { employees: number; children: number };
  metrics: { pp: number; opp: number; aup: number; totalFte: number };
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = "TB"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

const nodeTypes: NodeTypes = {
  department: DepartmentNode as unknown as NodeTypes["department"],
};

export function OrgChart() {
  const { currentScenarioId, setSelectedDepartmentId } = useOrgChartStore();
  const [departments, setDepartments] = useState<DepartmentAPI[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Fetch departments
  useEffect(() => {
    if (!currentScenarioId) return;
    fetch(`/api/departments?scenarioId=${currentScenarioId}`)
      .then((r) => r.json())
      .then((data: DepartmentAPI[]) => setDepartments(data))
      .catch(() => {});
  }, [currentScenarioId]);

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

  const onSelectDepartment = useCallback(
    (id: string) => {
      setSelectedDepartmentId(id);
    },
    [setSelectedDepartmentId]
  );

  // Build visible nodes/edges from departments and collapsed state
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (departments.length === 0) return { visibleNodes: [], visibleEdges: [] };

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

    const vNodes: Node[] = visible.map((dept) => ({
      id: dept.id,
      type: "department",
      position: { x: 0, y: 0 },
      data: {
        label: dept.name,
        shetilType: dept.shetilType,
        headName: dept.head?.fullName ?? null,
        pp: dept.metrics.pp,
        opp: dept.metrics.opp,
        aup: dept.metrics.aup,
        hasChildren: dept._count.children > 0,
        isExpanded: !collapsedIds.has(dept.id),
        departmentId: dept.id,
        onToggleExpand,
        onSelectDepartment,
      } as DepartmentNodeData as unknown as Record<string, unknown>,
    }));

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
  }, [departments, collapsedIds, onToggleExpand, onSelectDepartment]);

  // Apply layout
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
    <div className="relative h-full w-full">
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
  );
}
