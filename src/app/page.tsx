"use client";

import { OrgChart } from "@/components/org-chart/OrgChart";
import { DepartmentPanel } from "@/components/department-card/DepartmentPanel";
import { useOrgChartStore } from "@/lib/store";

export default function DashboardPage() {
  const selectedDepartmentId = useOrgChartStore((s) => s.selectedDepartmentId);

  return (
    <div className="flex h-full">
      <div className="flex-1">
        <OrgChart />
      </div>
      {selectedDepartmentId && (
        <DepartmentPanel departmentId={selectedDepartmentId} />
      )}
    </div>
  );
}
