"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

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
  onToggleExpand: (id: string) => void;
  onSelectDepartment: (id: string) => void;
}

type DepartmentNodeProps = NodeProps & { data: DepartmentNodeData };

function DepartmentNodeComponent({ data }: DepartmentNodeProps) {
  const config = SHETIL_CONFIG[data.shetilType];
  const total = data.pp + data.opp + data.aup;

  return (
    <div
      className="rounded-lg border-2 bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: config.color, minWidth: 180 }}
      onClick={() => data.onSelectDepartment(data.departmentId)}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-300" />

      {/* Header with Shetil color */}
      <div
        className="rounded-t-md px-3 py-1.5 text-xs font-medium text-white"
        style={{ backgroundColor: config.color }}
      >
        <div className="flex items-center justify-between">
          <span className="truncate">{data.label}</span>
          {data.hasChildren && (
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
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs">
        {data.headName && (
          <div className="mb-1 truncate text-neutral-600">{data.headName}</div>
        )}
        <div className="flex gap-2 text-neutral-500">
          <span>
            <span className="font-medium text-green-600">{data.pp}</span> ПП
          </span>
          <span>
            <span className="font-medium text-blue-600">{data.opp}</span> ОПП
          </span>
          <span>
            <span className="font-medium text-red-600">{data.aup}</span> АУП
          </span>
        </div>
        {total > 0 && (
          <div className="mt-0.5 text-neutral-400">Всего: {total}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-neutral-300" />
    </div>
  );
}

export const DepartmentNode = memo(DepartmentNodeComponent);
