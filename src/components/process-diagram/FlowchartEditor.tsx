"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Plus, Loader2, Upload, Trash2 } from "lucide-react";
import { StartNode, EndNode, TaskNode, DecisionNode, EventNode } from "./FlowchartNodes";

interface DiagramData {
  id: string;
  steps: StepData[];
  links: LinkData[];
}

interface StepData {
  id: string;
  type: string;
  label: string;
  description?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

interface LinkData {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string;
}

const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  task: TaskNode,
  decision: DecisionNode,
  event: EventNode,
};

function stepsToNodes(steps: StepData[]): Node[] {
  return steps.map((s) => ({
    id: s.id,
    type: s.type.toLowerCase(),
    position: { x: s.positionX, y: s.positionY },
    data: { label: s.label, description: s.description },
    style: { width: s.width, height: s.height },
  }));
}

function linksToEdges(links: LinkData[]): Edge[] {
  return links.map((l) => ({
    id: l.id,
    source: l.sourceId,
    target: l.targetId,
    label: l.label || undefined,
    type: "smoothstep",
    animated: false,
    style: { strokeWidth: 2 },
    labelStyle: { fontSize: 11 },
  }));
}

function nodesToSteps(nodes: Node[]): StepData[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: (n.type || "task").toUpperCase(),
    label: (n.data as { label?: string })?.label || "",
    description: (n.data as { description?: string })?.description || undefined,
    positionX: n.position.x,
    positionY: n.position.y,
    width: 150,
    height: 50,
  }));
}

function edgesToLinks(edges: Edge[]): LinkData[] {
  return edges.map((e) => ({
    id: e.id,
    sourceId: e.source,
    targetId: e.target,
    label: typeof e.label === "string" ? e.label : undefined,
  }));
}

let nodeCounter = 0;

interface FlowchartEditorProps {
  processId: string;
  diagramId: string | null;
  onDiagramCreated?: (id: string) => void;
}

export function FlowchartEditor({ processId, diagramId, onDiagramCreated }: FlowchartEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentDiagramId, setCurrentDiagramId] = useState(diagramId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing diagram
  useEffect(() => {
    if (!currentDiagramId) return;
    setLoading(true);
    fetch(`/api/diagrams/${currentDiagramId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.diagram) {
          setNodes(stepsToNodes(data.diagram.steps));
          setEdges(linksToEdges(data.diagram.links));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentDiagramId, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: "smoothstep", style: { strokeWidth: 2 } }, eds));
    },
    [setEdges]
  );

  function addNode(type: string) {
    const id = `new-${Date.now()}-${nodeCounter++}`;
    const labels: Record<string, string> = {
      start: "Начало",
      end: "Конец",
      task: "Задача",
      decision: "Условие",
      event: "Событие",
    };
    const newNode: Node = {
      id,
      type,
      position: { x: 250, y: 100 + nodes.length * 80 },
      data: { label: labels[type] || "Новый шаг" },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      let dId = currentDiagramId;

      // Create diagram if needed
      if (!dId) {
        const res = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processId, type: "FLOWCHART", name: "Flowchart" }),
        });
        const data = await res.json();
        dId = data.diagram.id;
        setCurrentDiagramId(dId);
        onDiagramCreated?.(dId!);
      }

      // Save steps and links
      await fetch(`/api/diagrams/${dId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: nodesToSteps(nodes),
          links: edgesToLinks(edges),
        }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleImportDrawio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    const cells = xml.querySelectorAll("mxCell");

    const importedNodes: Node[] = [];
    const importedEdges: Edge[] = [];

    cells.forEach((cell) => {
      const id = cell.getAttribute("id") || "";
      const value = cell.getAttribute("value") || "";
      const style = cell.getAttribute("style") || "";
      const source = cell.getAttribute("source");
      const target = cell.getAttribute("target");
      const geo = cell.querySelector("mxGeometry");

      if (source && target) {
        // Edge
        importedEdges.push({
          id: `edge-${id}`,
          source: `node-${source}`,
          target: `node-${target}`,
          label: value || undefined,
          type: "smoothstep",
          style: { strokeWidth: 2 },
        });
      } else if (geo && value) {
        // Node
        const x = parseFloat(geo.getAttribute("x") || "0");
        const y = parseFloat(geo.getAttribute("y") || "0");
        const w = parseFloat(geo.getAttribute("width") || "150");
        const h = parseFloat(geo.getAttribute("height") || "50");

        let type = "task";
        if (style.includes("ellipse") || style.includes("start")) type = "start";
        else if (style.includes("doubleEllipse") || style.includes("end")) type = "end";
        else if (style.includes("rhombus") || style.includes("diamond")) type = "decision";

        importedNodes.push({
          id: `node-${id}`,
          type,
          position: { x, y },
          data: { label: value },
          style: { width: w, height: h },
        });
      }
    });

    if (importedNodes.length > 0) {
      setNodes(importedNodes);
      setEdges(importedEdges);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClear() {
    if (!confirm("Очистить диаграмму?")) return;
    setNodes([]);
    setEdges([]);
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
  }

  return (
    <div className="h-[600px] rounded-lg border bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background />
        <Controls />
        <MiniMap />

        <Panel position="top-left">
          <div className="flex gap-1 rounded-lg bg-white p-1 shadow-md border">
            <button onClick={() => addNode("start")} className="rounded px-2 py-1 text-xs font-medium hover:bg-green-50 text-green-700" title="Начало">
              <span className="inline-block h-3 w-3 rounded-full bg-green-500 mr-1" />Start
            </button>
            <button onClick={() => addNode("task")} className="rounded px-2 py-1 text-xs font-medium hover:bg-blue-50 text-blue-700" title="Задача">
              <span className="inline-block h-3 w-3 rounded bg-blue-500 mr-1" />Task
            </button>
            <button onClick={() => addNode("decision")} className="rounded px-2 py-1 text-xs font-medium hover:bg-amber-50 text-amber-700" title="Условие">
              <span className="inline-block h-3 w-3 rotate-45 bg-amber-500 mr-1" />Decision
            </button>
            <button onClick={() => addNode("event")} className="rounded px-2 py-1 text-xs font-medium hover:bg-purple-50 text-purple-700" title="Событие">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-purple-500 mr-1" />Event
            </button>
            <button onClick={() => addNode("end")} className="rounded px-2 py-1 text-xs font-medium hover:bg-red-50 text-red-700" title="Конец">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 mr-1" />End
            </button>
          </div>
        </Panel>

        <Panel position="top-right">
          <div className="flex gap-1 rounded-lg bg-white p-1 shadow-md border">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-neutral-800 text-white hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Сохранить
            </button>
            <label className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-neutral-50 cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              Draw.io
              <input ref={fileInputRef} type="file" accept=".drawio,.xml" className="hidden" onChange={handleImportDrawio} />
            </label>
            <button onClick={handleClear} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-red-50 text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
