"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Plus,
  Minus,
  ArrowLeftRight,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { SHETIL_CONFIG } from "@/types";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { DiffStatus } from "@/lib/diff";
import type { ShetilType } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface DiffNodeData {
  label: string;
  shetilType: ShetilType;
  headName: string | null;
  pp: number;
  opp: number;
  aup: number;
  diffStatus: DiffStatus;
  changes?: string[];
  hasChildren: boolean;
  isExpanded: boolean;
  departmentId: string;
  parentId: string | null;
  onToggleExpand: (id: string) => void;
}

type DiffNodeProps = NodeProps & { data: DiffNodeData };

const diffIcons: Record<string, typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  moved: ArrowLeftRight,
};

const diffBorderExtra: Record<string, string> = {
  added: "border-dashed",
  removed: "border-dashed opacity-60",
  modified: "border-dashed",
  moved: "border-dashed",
  unchanged: "",
};

function DiffNodeComponent({ data }: DiffNodeProps) {
  const config = SHETIL_CONFIG[data.shetilType];
  const total = data.pp + data.opp + data.aup;
  const isRoot = data.parentId === null;
  const DiffIcon = diffIcons[data.diffStatus];

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 bg-white shadow-sm transition-shadow hover:shadow-md",
        isRoot && "shadow-md",
        diffBorderExtra[data.diffStatus]
      )}
      style={{ borderColor: isRoot ? "#0d3b66" : config.color, width: 200, maxWidth: 200 }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-neutral-300"
      />

      {/* Diff badge */}
      {data.diffStatus !== "unchanged" && DiffIcon && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-white shadow-sm">
              <DiffIcon className="h-3 w-3 text-neutral-700" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {data.changes?.map((c, i) => <div key={i}>{c}</div>) ?? data.diffStatus}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Header */}
      <div
        className="rounded-t-md px-3 py-1.5 text-xs font-medium text-white"
        style={
          isRoot
            ? { background: "linear-gradient(135deg, #0a1628 0%, #0d3b66 50%, #1a5276 100%)" }
            : { backgroundColor: config.color }
        }
      >
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate">{data.label}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {data.label}
            </TooltipContent>
          </Tooltip>
          {data.hasChildren && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                data.onToggleExpand(data.departmentId);
              }}
              className="nopan nodrag ml-1 rounded p-0.5 hover:bg-white/20"
            >
              {data.isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs">
        {data.headName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mb-1 truncate text-neutral-600">
                {data.headName}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {data.headName}
            </TooltipContent>
          </Tooltip>
        )}
        <div className="flex gap-2 text-neutral-500">
          <span>
            <span className="font-medium text-neutral-900">{data.pp}</span>{" "}
            ПП
          </span>
          <span>
            <span className="font-medium text-neutral-900">{data.opp}</span>{" "}
            ОПП
          </span>
          <span>
            <span className="font-medium text-neutral-900">{data.aup}</span>{" "}
            АУП
          </span>
        </div>
        {total > 0 && (
          <div className="mt-0.5 text-neutral-400">Всего: {total}</div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-neutral-300"
      />
    </div>
  );
}

export const DiffNode = memo(DiffNodeComponent);
