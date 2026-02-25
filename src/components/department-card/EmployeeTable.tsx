"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { CATEGORY_LABELS } from "@/types";
import type { EmployeeCategory } from "@prisma/client";

interface Employee {
  id: string;
  fullName: string;
  position: string;
  category: EmployeeCategory;
  fte: number | string;
}

interface EmployeeTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

export function DepartmentEmployeeTable({
  employees,
  onEdit,
  onDelete,
}: EmployeeTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(id);
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (employees.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-neutral-400">
        Нет сотрудников
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ФИО</TableHead>
          <TableHead>Должность</TableHead>
          <TableHead>Кат.</TableHead>
          <TableHead className="text-right">FTE</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((emp) => (
          <TableRow key={emp.id}>
            <TableCell className="font-medium">{emp.fullName}</TableCell>
            <TableCell>{emp.position}</TableCell>
            <TableCell>{CATEGORY_LABELS[emp.category]}</TableCell>
            <TableCell className="text-right">{Number(emp.fte).toFixed(1)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(emp)}>
                    <Pencil className="mr-2 h-3 w-3" />
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => handleDelete(emp.id)}
                    disabled={deletingId === emp.id}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
