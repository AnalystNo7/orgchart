"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sigma,
  ArrowDownUp,
  ArrowLeftRight,
} from "lucide-react";
import { SHETIL_CONFIG } from "@/types";
import { NodeContextMenu } from "./NodeContextMenu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { ShetilType } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface DepartmentNodeData {
  label: string;
  shetilType: ShetilType;
  headName: string | null;
  pp: number;
  opp: number;
  aup: number;
  hasChildren: boolean;
  isExpanded: boolean;
  departmentId: string;
  parentId: string | null;
  isAggregated: boolean;
  isVertical: boolean;
  onToggleExpand: (id: string) => void;
  onSelectDepartment: (id: string) => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string, parentId: string | null) => void;
  onDeleteDepartment: (id: string) => void;
  onToggleVertical: (id: string) => void;
}

type DepartmentNodeProps = NodeProps & { data: DepartmentNodeData };

function DepartmentNodeComponent({ data }: DepartmentNodeProps) {
  const config = SHETIL_CONFIG[data.shetilType];
  const total = data.pp + data.opp + data.aup;
  const isRoot = data.parentId === null;

  return (
    <NodeContextMenu
      onAddChild={() => data.onAddChild(data.departmentId)}
      onAddSibling={() =>
        data.onAddSibling(data.departmentId, data.parentId)
      }
      onDelete={() => data.onDeleteDepartment(data.departmentId)}
      isRoot={isRoot}
    >
      <div
        className="relative rounded-lg border-2 bg-white shadow-sm transition-shadow hover:shadow-md"
        style={{ borderColor: config.color, width: 200, maxWidth: 200 }}
        onClick={() => data.onSelectDepartment(data.departmentId)}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-neutral-300"
        />

        {/* Header with Shetil color */}
        <div
          className="rounded-t-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: config.color }}
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
            <div className="flex items-center">
              {data.hasChildren && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          data.onToggleVertical(data.departmentId);
                        }}
                        className="ml-1 rounded p-0.5 hover:bg-white/20"
                      >
                        {data.isVertical ? (
                          <ArrowDownUp className="h-3 w-3" />
                        ) : (
                          <ArrowLeftRight className="h-3 w-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {data.isVertical
                        ? "Вертикальная раскладка (нажмите для горизонтальной)"
                        : "Горизонтальная раскладка (нажмите для вертикальной)"}
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onToggleExpand(data.departmentId);
                    }}
                    className="ml-1 rounded p-0.5 hover:bg-white/20"
                  >
                    {data.isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                </>
              )}
            </div>
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
            {data.isAggregated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Sigma className="h-3 w-3 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>Агрегированные данные</TooltipContent>
              </Tooltip>
            )}
            <span>
              <span
                className={cn(
                  "font-medium",
                  data.isAggregated
                    ? "italic text-green-700"
                    : "text-green-600"
                )}
              >
                {data.pp}
              </span>{" "}
              ПП
            </span>
            <span>
              <span
                className={cn(
                  "font-medium",
                  data.isAggregated ? "italic text-blue-700" : "text-blue-600"
                )}
              >
                {data.opp}
              </span>{" "}
              ОПП
            </span>
            <span>
              <span
                className={cn(
                  "font-medium",
                  data.isAggregated ? "italic text-red-700" : "text-red-600"
                )}
              >
                {data.aup}
              </span>{" "}
              АУП
            </span>
          </div>
          {total > 0 && (
            <div className="mt-0.5 text-neutral-400">Всего: {total}</div>
          )}
        </div>

        {/* Add child button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onAddChild(data.departmentId);
          }}
          className="absolute -bottom-3 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border bg-white text-neutral-400 shadow-sm transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-600"
          title="Добавить дочернее"
        >
          <Plus className="h-3 w-3" />
        </button>

        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-neutral-300"
        />
      </div>
    </NodeContextMenu>
  );
}

export const DepartmentNode = memo(DepartmentNodeComponent);
