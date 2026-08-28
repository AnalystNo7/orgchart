"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, ArrowUpDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CATEGORY_LABELS, DEFAULT_COLUMN_NAMES } from "@/types";
import type { EmployeeCategory } from "@prisma/client";
import { EditableHeader } from "./EditableHeader";

export interface EmployeeRow {
  id: string;
  fullName: string;
  position: string;
  category: EmployeeCategory;
  fte: number | string;
  costRate: number | string | null;
  tariffId: string | null;
  tariff: { id: string; name: string; rate: number | string } | null;
  _count?: { contracts: number };
  department: { id: string; name: string; cfo: string | null };
  hierarchyPath: Array<{ id: string; name: string; depth: number }>;
}

interface ColumnActions {
  onEdit: (employee: EmployeeRow) => void;
  onDelete: (id: string) => void;
  onContracts: (employee: EmployeeRow) => void;
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

function TruncatedCell({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block max-w-[180px] truncate">{text}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function getColumns(options: ColumnOptions): ColumnDef<EmployeeRow>[] {
  const { actions, hierarchyMode, maxDepth, columnNames, onColumnRename } = options;
  const columns: ColumnDef<EmployeeRow>[] = [];

  function getDisplayName(columnId: string): string {
    return columnNames?.[columnId] ?? DEFAULT_COLUMN_NAMES[columnId] ?? columnId;
  }

  // 1. ЦФО
  columns.push({
    id: "cfo",
    accessorFn: (row) => row.department.cfo,
    meta: { label: getDisplayName("cfo") },
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
        meta: { label: getDisplayName(colId) },
        header: () => (
          <EditableHeader
            value={getDisplayName(colId)}
            onSave={(v) => onColumnRename(colId, v)}
          />
        ),
        cell: ({ row }) => {
          const level = row.original.hierarchyPath[i];
          return level ? (
            <TruncatedCell text={level.name} />
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
      meta: { label: getDisplayName("hierarchy_path") },
      header: () => (
        <EditableHeader
          value={getDisplayName("hierarchy_path")}
          onSave={(v) => onColumnRename("hierarchy_path", v)}
        />
      ),
      cell: ({ row }) => (
        <TruncatedCell text={row.original.hierarchyPath.map((h) => h.name).join(" → ")} />
      ),
    });
  }

  // 3. Должность
  columns.push({
    accessorKey: "position",
    meta: { label: getDisplayName("position") },
    header: () => (
      <EditableHeader
        value={getDisplayName("position")}
        onSave={(v) => onColumnRename("position", v)}
      />
    ),
    cell: ({ row }) => <TruncatedCell text={row.getValue("position")} />,
  });

  // 4. ФИО (with sort)
  columns.push({
    accessorKey: "fullName",
    meta: { label: getDisplayName("fullName") },
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
    meta: { label: getDisplayName("fte") },
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
    meta: { label: getDisplayName("category") },
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

  // 7. Ставка себестоимости
  columns.push({
    id: "costRate",
    accessorFn: (row) => row.costRate,
    meta: { label: "Ставка себестоимости" },
    header: () => <span className="whitespace-nowrap text-sm">Ставка с/с</span>,
    cell: ({ row }) => {
      const val = row.original.costRate;
      return (
        <div className="text-right">
          {val != null ? Number(val).toLocaleString("ru-RU") : "—"}
        </div>
      );
    },
  });

  // 8. Тарифная ставка
  columns.push({
    id: "tariff",
    accessorFn: (row) => row.tariff?.name,
    meta: { label: "Тарифная ставка" },
    header: () => <span className="whitespace-nowrap text-sm">Тариф</span>,
    cell: ({ row }) => {
      const tariff = row.original.tariff;
      if (!tariff) return <span className="text-neutral-300">—</span>;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm">{tariff.name}</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{tariff.name}: {Number(tariff.rate).toLocaleString("ru-RU")} руб.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  });

  // 9. Договоры (кол-во + кнопка)
  columns.push({
    id: "contracts",
    meta: { label: "Договоры" },
    header: () => <span className="whitespace-nowrap text-sm">Договоры</span>,
    cell: ({ row }) => {
      const count = row.original._count?.contracts ?? 0;
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1"
          onClick={() => actions.onContracts(row.original)}
        >
          <FileText className="h-3.5 w-3.5" />
          {count}
        </Button>
      );
    },
  });

  // 10. Actions
  columns.push({
    id: "actions",
    enableHiding: false,
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
            <DropdownMenuItem onClick={() => actions.onContracts(employee)}>
              Договоры
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
