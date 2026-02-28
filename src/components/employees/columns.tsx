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
import { CATEGORY_LABELS } from "@/types";
import type { EmployeeCategory } from "@prisma/client";

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
}

const categoryColors: Record<EmployeeCategory, string> = {
  PP: "bg-green-100 text-green-800",
  OPP: "bg-blue-100 text-blue-800",
  AUP: "bg-red-100 text-red-800",
};

export function getColumns(options: ColumnOptions): ColumnDef<EmployeeRow>[] {
  const { actions, hierarchyMode, maxDepth, levelNames } = options;
  const columns: ColumnDef<EmployeeRow>[] = [];

  // CFO column
  columns.push({
    id: "cfo",
    accessorFn: (row) => row.department.cfo,
    header: "ЦФО",
    cell: ({ row }) => (
      <span className="text-sm text-neutral-600">
        {row.original.department.cfo ?? "—"}
      </span>
    ),
  });

  // Hierarchy columns
  if (hierarchyMode === "detailed") {
    for (let i = 0; i < maxDepth; i++) {
      const levelName = levelNames[i] ?? `L${i + 1}`;
      columns.push({
        id: `hierarchy_${i}`,
        accessorFn: (row) => row.hierarchyPath[i]?.name ?? "",
        header: levelName,
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
      header: "Иерархия",
      cell: ({ row }) => (
        <span className="text-sm text-neutral-600">
          {row.original.hierarchyPath.map((h) => h.name).join(" → ")}
        </span>
      ),
    });
  }

  // ФИО
  columns.push({
    accessorKey: "fullName",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-4"
      >
        ФИО
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("fullName")}</span>
    ),
  });

  // Должность
  columns.push({
    accessorKey: "position",
    header: "Должность",
  });

  // Категория
  columns.push({
    accessorKey: "category",
    header: "Кат.",
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

  // FTE
  columns.push({
    accessorKey: "fte",
    header: () => <div className="text-right">FTE</div>,
    cell: ({ row }) => (
      <div className="text-right">
        {Number(row.getValue("fte")).toFixed(1)}
      </div>
    ),
  });

  // Actions
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
