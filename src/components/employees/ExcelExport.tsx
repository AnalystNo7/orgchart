"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { CATEGORY_LABELS, DEFAULT_COLUMN_NAMES } from "@/types";
import type { EmployeeCategory } from "@prisma/client";

interface ExcelExportProps {
  scenarioId: string;
  search?: string;
  categoryFilter?: string;
  columnNames: Record<string, string> | null;
  maxDepth: number;
}

export function ExcelExport({
  scenarioId,
  search,
  categoryFilter,
  columnNames,
  maxDepth,
}: ExcelExportProps) {
  const [exporting, setExporting] = useState(false);

  function getDisplayName(columnId: string): string {
    return columnNames?.[columnId] ?? DEFAULT_COLUMN_NAMES[columnId] ?? columnId;
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        scenarioId,
        page: "1",
        limit: "100000",
      });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/employees?${params}`);
      if (!res.ok) return;

      const json = await res.json();
      const rows = json.data as Array<{
        fullName: string;
        position: string;
        category: EmployeeCategory;
        fte: number | string;
        costRate: number | string | null;
        tariff: { name: string; rate: number | string } | null;
        department: { cfo: string | null };
        hierarchyPath: Array<{ name: string }>;
      }>;

      const exportData = rows.map((row) => {
        const obj: Record<string, string | number> = {};
        obj[getDisplayName("cfo")] = row.department.cfo ?? "";
        for (let i = 1; i < maxDepth; i++) {
          obj[getDisplayName(`hierarchy_${i}`)] = row.hierarchyPath[i]?.name ?? "";
        }
        obj[getDisplayName("position")] = row.position;
        obj[getDisplayName("fullName")] = row.fullName;
        obj[getDisplayName("fte")] = Number(row.fte);
        obj[getDisplayName("category")] = CATEGORY_LABELS[row.category] ?? row.category;
        obj["Ставка себестоимости"] = row.costRate != null ? Number(row.costRate) : "";
        obj["Тарифная ставка"] = row.tariff ? `${row.tariff.name} (${Number(row.tariff.rate)})` : "";
        return obj;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Сотрудники");
      XLSX.writeFile(wb, "сотрудники.xlsx");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={exporting}>
      {exporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      Экспорт Excel
    </Button>
  );
}
