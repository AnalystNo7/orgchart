"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus, Minus, ArrowLeftRight, Pencil } from "lucide-react";
import { SHETIL_CONFIG } from "@/types";
import type { DiffStatus } from "@/lib/diff";
import type { ShetilType } from "@prisma/client";

export interface DiffNodeData {
  label: string;
  shetilType: ShetilType;
  headName: string | null;
  pp: number;
  opp: number;
  aup: number;
  diffStatus: DiffStatus;
  changes?: string[];
}

type DiffNodeProps = NodeProps & { data: DiffNodeData };

const diffIcons: Record<string, typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  moved: ArrowLeftRight,
};

const diffBorderStyle: Record<string, string> = {
  added: "border-dashed",
  removed: "border-dashed opacity-60",
  modified: "border-dashed",
  moved: "border-dashed",
  unchanged: "",
};

function DiffNodeComponent({ data }: DiffNodeProps) {
  const config = SHETIL_CONFIG[data.shetilType];
  const DiffIcon = diffIcons[data.diffStatus];

  return (
    <div
      className={`relative rounded-lg border-2 bg-white shadow-sm ${diffBorderStyle[data.diffStatus]}`}
      style={{ borderColor: config.color, minWidth: 160 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-300" />

      {/* Diff badge */}
      {data.diffStatus !== "unchanged" && DiffIcon && (
        <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-white shadow-sm">
          <DiffIcon className="h-3 w-3 text-neutral-700" />
        </div>
      )}

      {/* Header */}
      <div
        className="rounded-t-md px-2 py-1 text-xs font-medium text-white"
        style={{ backgroundColor: config.color }}
      >
        <span className="truncate">{data.label}</span>
      </div>

      {/* Body */}
      <div className="px-2 py-1.5 text-xs">
        {data.headName && (
          <div className="mb-0.5 truncate text-neutral-500">{data.headName}</div>
        )}
        <div className="flex gap-1.5 text-neutral-500">
          <span className="text-green-600">{data.pp}</span>/
          <span className="text-blue-600">{data.opp}</span>/
          <span className="text-red-600">{data.aup}</span>
        </div>
        {data.changes && data.changes.length > 0 && (
          <div className="mt-1 border-t pt-1 text-[10px] text-neutral-400">
            {data.changes.map((c, i) => (
              <div key={i}>{c}</div>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-neutral-300" />
    </div>
  );
}

export const DiffNode = memo(DiffNodeComponent);
