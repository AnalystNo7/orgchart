"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, DEFAULT_COLUMN_NAMES } from "@/types";
import type { EmployeeCategory } from "@prisma/client";
import { EditableHeader } from "./EditableHeader";

export interface EmployeeRow {
  id: string;
  fullName: string;
  position: string;
  category: EmployeeCategory;
  fte: number | string;
  department: { id: string; name: string; cfo: string | null };
  hierarchyPath: Array<{ id: string; name: string; depth: number }>;
}

interface ColumnActions {
  onEdit: (employee: EmployeeRow) => void;
  onDelete: (id: string) => void;
}

interface ColumnOptions {
  actions: ColumnActions;
  hierarchyMode: "detailed" | "compact";
  maxDepth: number;
  levelNames: string[];
  columnNames: Record<string, string> | null;
  onColumnRename: (columnId: string, name: string) => void;
}

const categoryColors: Record<EmployeeCategory, string> = {
  PP: "bg-green-100 text-green-800",
  OPP: "bg-blue-100 text-blue-800",
  AUP: "bg-red-100 text-red-800",
};

export function getColumns(options: ColumnOptions): ColumnDef<EmployeeRow>[] {
  const { actions, hierarchyMode, maxDepth, levelNames, columnNames, onColumnRename } = options;
  const columns: ColumnDef<EmployeeRow>[] = [];

  function getDisplayName(columnId: string): string {
    return columnNames?.[columnId] ?? DEFAULT_COLUMN_NAMES[columnId] ?? columnId;
  }

  // 1. ЦФО
  columns.push({
    id: "cfo",
    accessorFn: (row) => row.department.cfo,
    header: () => (
      <EditableHeader
        value={getDisplayName("cfo")}
        onSave={(v) => onColumnRename("cfo", v)}
      />
    ),
    cell: ({ row }) => (
      <span className="text-sm text-neutral-600">
        {row.original.department.cfo ?? "—"}
      </span>
    ),
  });

  // 2. Hierarchy columns
  if (hierarchyMode === "detailed") {
    for (let i = 0; i < maxDepth; i++) {
      const colId = `hierarchy_${i}`;
      columns.push({
        id: colId,
        accessorFn: (row) => row.hierarchyPath[i]?.name ?? "",
        header: () => (
          <EditableHeader
            value={getDisplayName(colId)}
            onSave={(v) => onColumnRename(colId, v)}
          />
        ),
        cell: ({ row }) => {
          const level = row.original.hierarchyPath[i];
          return level ? (
            <span className="text-sm">{level.name}</span>
          ) : (
            <span className="text-neutral-300">—</span>
          );
        },
      });
    }
  } else {
    columns.push({
      id: "hierarchy_path",
      accessorFn: (row) => row.hierarchyPath.map((h) => h.name).join(" → "),
      header: () => (
        <EditableHeader
          value={getDisplayName("hierarchy_path")}
          onSave={(v) => onColumnRename("hierarchy_path", v)}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-neutral-600">
          {row.original.hierarchyPath.map((h) => h.name).join(" → ")}
        </span>
      ),
    });
  }

  // 3. Должность
  columns.push({
    accessorKey: "position",
    header: () => (
      <EditableHeader
        value={getDisplayName("position")}
        onSave={(v) => onColumnRename("position", v)}
      />
    ),
  });

  // 4. ФИО (with sort)
  columns.push({
    accessorKey: "fullName",
    header: ({ column }) => (
      <div className="flex items-center gap-1">
        <EditableHeader
          value={getDisplayName("fullName")}
          onSave={(v) => onColumnRename("fullName", v)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-6 w-6 p-0"
        >
          <ArrowUpDown className="h-3 w-3" />
        </Button>
      </div>
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("fullName")}</span>
    ),
  });

  // 5. FTE
  columns.push({
    accessorKey: "fte",
    header: () => (
      <div className="text-right">
        <EditableHeader
          value={getDisplayName("fte")}
          onSave={(v) => onColumnRename("fte", v)}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-right">
        {Number(row.getValue("fte")).toFixed(1)}
      </div>
    ),
  });

  // 6. Тип занятости
  columns.push({
    accessorKey: "category",
    header: () => (
      <EditableHeader
        value={getDisplayName("category")}
        onSave={(v) => onColumnRename("category", v)}
      />
    ),
    cell: ({ row }) => {
      const cat = row.getValue("category") as EmployeeCategory;
      return (
        <Badge variant="secondary" className={categoryColors[cat]}>
          {CATEGORY_LABELS[cat]}
        </Badge>
      );
    },
    filterFn: (row, _, filterValue) => {
      if (!filterValue) return true;
      return row.getValue("category") === filterValue;
    },
  });

  // 7. Actions
  columns.push({
    id: "actions",
    cell: ({ row }) => {
      const employee = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => actions.onEdit(employee)}>
              Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => actions.onDelete(employee.id)}
            >
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  });

  return columns;
}
