"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  CopyPlus,
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
  onAddParent: (id: string) => void;
  onDeleteDepartment: (id: string) => void;
  onToggleVertical: (id: string) => void;
}

type DepartmentNodeProps = NodeProps & { data: DepartmentNodeData };

function DepartmentNodeComponent({ data, selected }: DepartmentNodeProps) {
  const config = SHETIL_CONFIG[data.shetilType];
  const total = data.pp + data.opp + data.aup;
  const isRoot = data.parentId === null;

  return (
    <NodeContextMenu
      onAddChild={() => data.onAddChild(data.departmentId)}
      onAddSibling={() =>
        data.onAddSibling(data.departmentId, data.parentId)
      }
      onAddParent={() => data.onAddParent(data.departmentId)}
      onDelete={() => data.onDeleteDepartment(data.departmentId)}
      isRoot={isRoot}
    >
      <div
        className={cn(
          "relative rounded-lg border-2 bg-white shadow-sm transition-shadow hover:shadow-md",
          isRoot && "shadow-md",
          // Мультивыделение: кольцо снаружи, заливка и рамка ШЕТИЛ не меняются
          selected && "ring-2 ring-brand ring-offset-2"
        )}
        style={{ borderColor: isRoot ? "#0d3b66" : config.color, width: 200, maxWidth: 200 }}
        onClick={(e) => {
          // Ctrl/Cmd+клик — сбор мультивыделения (обрабатывает ReactFlow),
          // боковую панель подразделения при этом не открываем
          if (e.ctrlKey || e.metaKey) return;
          data.onSelectDepartment(data.departmentId);
        }}
      >
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="!bg-neutral-300"
        />
        {/* Left handle for vertical layout (target — incoming edge) */}
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!h-0 !w-0 !border-0 !bg-transparent"
        />

        {/* Header — cosmic dark-blue gradient for root, shetil-colored for others */}
        <div
          className={cn(
            "rounded-t-md px-3 py-1.5 text-xs font-medium",
            isRoot
              ? "text-white"
              : "text-white"
          )}
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
            <div className="flex items-center">
              {data.hasChildren && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          data.onToggleVertical(data.departmentId);
                        }}
                        className="nopan nodrag ml-1 rounded p-0.5 hover:bg-white/20"
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
                  "font-medium text-neutral-900",
                  data.isAggregated && "italic"
                )}
              >
                {data.pp}
              </span>{" "}
              ПП
            </span>
            <span>
              <span
                className={cn(
                  "font-medium text-neutral-900",
                  data.isAggregated && "italic"
                )}
              >
                {data.opp}
              </span>{" "}
              ОПП
            </span>
            <span>
              <span
                className={cn(
                  "font-medium text-neutral-900",
                  data.isAggregated && "italic"
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

        {/* Add child button (bottom) */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            data.onAddChild(data.departmentId);
          }}
          className="nopan nodrag absolute -bottom-3 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border bg-white text-neutral-400 shadow-sm transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-600"
          title="Добавить дочернее"
        >
          <Plus className="h-3 w-3" />
        </button>

        {/* Add sibling button (right side) — hidden for root */}
        {!isRoot && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              data.onAddSibling(data.departmentId, data.parentId);
            }}
            className="nopan nodrag absolute -right-3 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-neutral-400 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
            title="Добавить параллельное"
          >
            <CopyPlus className="h-3 w-3" />
          </button>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="!bg-neutral-300"
        />
        {/* Right handle for vertical layout (source — outgoing edge) */}
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="!h-0 !w-0 !border-0 !bg-transparent"
        />
      </div>
    </NodeContextMenu>
  );
}

export const DepartmentNode = memo(DepartmentNodeComponent);
