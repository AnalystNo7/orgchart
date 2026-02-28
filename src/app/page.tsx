"use client";

import { OrgChart } from "@/components/org-chart/OrgChart";
import { DepartmentPanel } from "@/components/department-card/DepartmentPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useOrgChartStore } from "@/lib/store";

export default function DashboardPage() {
  const selectedDepartmentId = useOrgChartStore((s) => s.selectedDepartmentId);

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <div className="flex-1">
          <OrgChart />
        </div>
        {selectedDepartmentId && (
          <DepartmentPanel departmentId={selectedDepartmentId} />
        )}
      </div>
    </TooltipProvider>
  );
}
