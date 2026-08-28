"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface HeatmapNodeData {
  label: string;
  shetilType: string;
  revenue: number;
  cost: number;
  pnl: number;
  totalPnl: number;
  childrenPnl: number;
  warningCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  thresholds: {
    deepRed: number;
    red: number;
    yellow: number;
    green: number;
    deepGreen: number;
  };
  onToggleExpand: (id: string) => void;
  onSelectDepartment: (id: string) => void;
  departmentId: string;
}

function getPnlColor(pnl: number, thresholds: HeatmapNodeData["thresholds"]): string {
  if (pnl <= thresholds.deepRed) return "#991b1b"; // red-800
  if (pnl <= thresholds.red) return "#dc2626"; // red-600
  if (pnl <= thresholds.yellow) return "#f59e0b"; // amber-500
  if (pnl <= thresholds.green) return "#22c55e"; // green-500
  return "#15803d"; // green-700
}

function getPnlBgColor(pnl: number, thresholds: HeatmapNodeData["thresholds"]): string {
  if (pnl <= thresholds.deepRed) return "rgba(153,27,27,0.15)";
  if (pnl <= thresholds.red) return "rgba(220,38,38,0.12)";
  if (pnl <= thresholds.yellow) return "rgba(245,158,11,0.12)";
  if (pnl <= thresholds.green) return "rgba(34,197,94,0.12)";
  return "rgba(21,128,61,0.15)";
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export const HeatmapNode = memo(function HeatmapNode({
  data,
  id,
}: NodeProps) {
  const d = data as unknown as HeatmapNodeData;
  const pnlColor = getPnlColor(d.totalPnl, d.thresholds);
  const bgColor = getPnlBgColor(d.totalPnl, d.thresholds);

  const shetilBorder: Record<string, string> = {
    REVENUE: "#14b8a6",
    RESOURCE: "#38bdf8",
    SERVICE: "#f59e0b",
    BACKOFFICE: "#ef4444",
  };

  const borderColor = shetilBorder[d.shetilType] ?? "#d4d4d4";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-neutral-300" />
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-300" />

      <div
        className="cursor-pointer rounded-lg border-2 shadow-sm transition-shadow hover:shadow-md"
        style={{
          width: 220,
          borderColor,
          backgroundColor: bgColor,
        }}
        onClick={() => d.onSelectDepartment(d.departmentId)}
      >
        {/* Header */}
        <div className="flex items-center gap-1 border-b border-neutral-200/50 px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1 truncate text-xs font-semibold text-neutral-800">
                {d.label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{d.label}</TooltipContent>
          </Tooltip>

          {d.warningCount > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>
                {d.warningCount} предупреждение(й)
              </TooltipContent>
            </Tooltip>
          )}

          {d.hasChildren && (
            <button
              className="rounded p-0.5 hover:bg-neutral-200/50"
              onClick={(e) => {
                e.stopPropagation();
                d.onToggleExpand(id);
              }}
            >
              {d.isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
              )}
            </button>
          )}
        </div>

        {/* P&L number */}
        <div className="flex flex-col items-center px-2 py-2">
          <span
            className="text-2xl font-bold"
            style={{ color: pnlColor }}
          >
            {formatNumber(d.totalPnl)}
          </span>
          <span className="text-[10px] text-neutral-500">P&L (итого)</span>
        </div>

        {/* Details row */}
        <div className="flex items-center justify-between border-t border-neutral-200/50 px-2 py-1.5 text-[10px] text-neutral-600">
          <div className="flex flex-col">
            <span className="text-green-600">↑ {formatNumber(d.revenue)}</span>
            <span className="text-red-500">↓ {formatNumber(d.cost)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span>Своё: {formatNumber(d.pnl)}</span>
            {d.childrenPnl !== 0 && (
              <span>Дочерние: {formatNumber(d.childrenPnl)}</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
});
