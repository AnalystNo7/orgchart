"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

function NodeLabel({ label }: { label: string }) {
  return <div className="truncate px-2 py-1 text-xs font-medium text-center">{label}</div>;
}

export function StartNode({ data }: NodeProps) {
  return (
    <div className="flex h-10 w-20 items-center justify-center rounded-full border-2 border-green-500 bg-green-50">
      <NodeLabel label={(data as { label: string }).label} />
      <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
    </div>
  );
}

export function EndNode({ data }: NodeProps) {
  return (
    <div className="flex h-10 w-20 items-center justify-center rounded-full border-2 border-red-500 bg-red-50">
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
      <NodeLabel label={(data as { label: string }).label} />
    </div>
  );
}

export function TaskNode({ data }: NodeProps) {
  return (
    <div className="flex min-h-[40px] min-w-[120px] items-center justify-center rounded-lg border-2 border-blue-400 bg-blue-50 px-3 py-2">
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <NodeLabel label={(data as { label: string }).label} />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </div>
  );
}

export function DecisionNode({ data }: NodeProps) {
  return (
    <div className="flex h-16 w-16 rotate-45 items-center justify-center border-2 border-amber-500 bg-amber-50">
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <div className="-rotate-45">
        <NodeLabel label={(data as { label: string }).label} />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-amber-500" />
    </div>
  );
}

export function EventNode({ data }: NodeProps) {
  return (
    <div className="flex h-10 w-24 items-center justify-center rounded-full border-2 border-purple-400 bg-purple-50">
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      <NodeLabel label={(data as { label: string }).label} />
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  );
}
