import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";

// ----------------------------------------------------------------------------
// Hybrid dagre + manual layout that supports "vertical" subtrees.
//
// Vertical mode: a department flagged as "vertical" (directly or inherited
// from an ancestor) is laid out such that its direct children stack under it
// indented to the right, instead of spreading horizontally. Descendants of a
// vertical node are also vertical (cascading).
//
// Implementation: dagre handles the horizontal top-down layout for all
// non-vertical nodes. Vertical subtrees are removed from dagre; their root is
// enlarged in dagre to reserve enough space for the stacked descendants
// (both vertically and horizontally). After dagre runs, vertical children
// are positioned manually under their parent.
//
// Edges targeting manually positioned nodes are rewritten to use
// bottom→left handles so the connector draws an L-shape instead of the
// default top→target line.
//
// This module is shared between OrgChart.tsx and PnlHeatmap.tsx so both
// views support vertical mode through the same layout engine.
// ----------------------------------------------------------------------------

export interface HybridLayoutParams {
  /** Width of a regular horizontal node. */
  nodeWidth: number;
  /** Height of a regular horizontal node. */
  nodeHeight: number;
  /**
   * Horizontal indent of vertical children from the parent's left edge
   * (how far to the right they appear).
   */
  indent: number;
  /** Vertical gap between stacked vertical siblings. */
  vGap: number;
  /**
   * Vertical gap between dagre ranks. Also used as the gap between a
   * vertical parent and its first vertical child.
   */
  rankSep: number;
  /** Horizontal gap between dagre siblings at the same rank. */
  nodeSep?: number;
}

/**
 * Minimal department shape that the layout engine needs. OrgChart and
 * PnlHeatmap both provide richer types; they just need to contain `id`
 * and `parentId`.
 */
export interface LayoutDepartment {
  id: string;
  parentId: string | null;
}

export function hybridDagreLayout(
  nodes: Node[],
  edges: Edge[],
  verticalIds: Set<string>,
  departments: LayoutDepartment[],
  params: HybridLayoutParams
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    indent: INDENT,
    vGap: V_GAP,
    rankSep: RANKSEP,
    nodeSep = 50,
  } = params;

  const visibleIdSet = new Set(nodes.map((n) => n.id));

  // Build children map from edges (only visible nodes).
  const childrenMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = childrenMap.get(edge.source) ?? [];
    list.push(edge.target);
    childrenMap.set(edge.source, list);
  });

  // Effective vertical status cascades from ancestors.
  const effectiveVerticalCache = new Map<string, boolean>();
  const deptMap = new Map(
    departments.filter((d) => visibleIdSet.has(d.id)).map((d) => [d.id, d])
  );

  function isEffectivelyVertical(id: string): boolean {
    const cached = effectiveVerticalCache.get(id);
    if (cached !== undefined) return cached;
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

  // Collect manually positioned nodes — everything under an effectively
  // vertical node (its descendants, but not the node itself).
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

  // Vertical extent = total height consumed by a node + all its stacked
  // vertical descendants. Used to reserve dagre height for the vertical
  // root.
  const verticalExtentCache = new Map<string, number>();
  function verticalExtent(nodeId: string): number {
    const cached = verticalExtentCache.get(nodeId);
    if (cached !== undefined) return cached;

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

  // Horizontal extent = maximum width a vertical subtree occupies.
  const horizontalExtentCache = new Map<string, number>();
  function horizontalExtent(nodeId: string): number {
    const cached = horizontalExtentCache.get(nodeId);
    if (cached !== undefined) return cached;

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

  // Dagre setup — every dagre node has the SAME height (NODE_HEIGHT); we
  // control Y ourselves per rank so we can make room for vertical subtrees.
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: nodeSep, ranksep: RANKSEP });

  const dagreNodes = nodes.filter((n) => !manualNodeIds.has(n.id));

  dagreNodes.forEach((node) => {
    const w = horizontalExtent(node.id);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  });

  // Only feed dagre the edges between non-manual nodes.
  edges
    .filter(
      (e) => !manualNodeIds.has(e.source) && !manualNodeIds.has(e.target)
    )
    .forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  // Compute each dagre node's own depth (rank) ignoring vertical children
  // that were already excluded above.
  const depthCache = new Map<string, number>();
  function getDagreDepth(id: string): number {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const dept = deptMap.get(id);
    if (
      !dept?.parentId ||
      !visibleIdSet.has(dept.parentId) ||
      manualNodeIds.has(dept.parentId)
    ) {
      depthCache.set(id, 0);
      return 0;
    }
    const result = getDagreDepth(dept.parentId) + 1;
    depthCache.set(id, result);
    return result;
  }

  // Per-rank max vertical extent → cumulative Y per rank. This ensures
  // that a rank containing a tall vertical subtree does not overlap the
  // next rank below.
  const rankGroups = new Map<number, string[]>();
  let maxRank = 0;
  dagreNodes.forEach((n) => {
    const d = getDagreDepth(n.id);
    maxRank = Math.max(maxRank, d);
    const group = rankGroups.get(d);
    if (group) group.push(n.id);
    else rankGroups.set(d, [n.id]);
  });

  const rankMaxExtent = new Map<number, number>();
  rankGroups.forEach((ids, rank) => {
    rankMaxExtent.set(rank, Math.max(...ids.map((id) => verticalExtent(id))));
  });

  const rankY = new Map<number, number>();
  let cumY = 0;
  for (let r = 0; r <= maxRank; r++) {
    rankY.set(r, cumY);
    cumY += (rankMaxExtent.get(r) ?? NODE_HEIGHT) + RANKSEP;
  }

  const positions = new Map<string, { x: number; y: number }>();

  dagreNodes.forEach((node) => {
    const dagreNode = g.node(node.id);
    const w = horizontalExtent(node.id);
    positions.set(node.id, {
      x: dagreNode.x - w / 2,
      y: rankY.get(getDagreDepth(node.id)) ?? 0,
    });
  });

  // Walk vertical subtrees and stack children under parent.
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

  dagreNodes
    .filter((n) => isEffectivelyVertical(n.id))
    .forEach((node) => {
      positionVerticalChildren(node.id);
    });

  // Build final nodes with computed positions.
  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));

  // Vertical children connect via bottom → left so the edge bends nicely.
  const layoutedEdges = edges.map((edge) => {
    if (manualNodeIds.has(edge.target)) {
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
