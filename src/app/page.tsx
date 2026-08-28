"use client";

import { OrgChart } from "@/components/org-chart/OrgChart";
import { DepartmentPanel } from "@/components/department-card/DepartmentPanel";
import { PnlHeatmap } from "@/components/pnl/PnlHeatmap";
import { PnlDrillDown } from "@/components/pnl/PnlDrillDown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOrgChartStore } from "@/lib/store";
import { LayoutDashboard, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const selectedDepartmentId = useOrgChartStore((s) => s.selectedDepartmentId);
  const viewMode = useOrgChartStore((s) => s.viewMode);
  const setViewMode = useOrgChartStore((s) => s.setViewMode);
  const pnlDrillDownDeptId = useOrgChartStore((s) => s.pnlDrillDownDeptId);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* View switcher */}
        <div className="flex items-center gap-1 border-b px-4 py-2">
          <span className="mr-2 text-sm text-neutral-500">Вид:</span>
          <Button
            variant={viewMode === "orgchart" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("orgchart")}
          >
            <LayoutDashboard className="mr-1.5 h-4 w-4" />
            Оргструктура
          </Button>
          <Button
            variant={viewMode === "pnl-heatmap" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("pnl-heatmap")}
          >
            <Flame className="mr-1.5 h-4 w-4" />
            P&L Heatmap
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {viewMode === "orgchart" ? (
            <>
              <div className="flex-1">
                <OrgChart />
              </div>
              {selectedDepartmentId && (
                <DepartmentPanel departmentId={selectedDepartmentId} />
              )}
            </>
          ) : (
            <>
              <div className="flex-1">
                <PnlHeatmap />
              </div>
              {pnlDrillDownDeptId && <PnlDrillDown />}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
