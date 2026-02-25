"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmployeeCategory } from "@prisma/client";

interface EmployeeFormData {
  fullName: string;
  position: string;
  category: EmployeeCategory;
  fte: number;
  departmentId: string;
}

interface Department {
  id: string;
  name: string;
}

interface EmployeeFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeFormData) => void;
  defaultValues?: Partial<EmployeeFormData>;
  title: string;
  scenarioId: string;
}

export function EmployeeForm({
  open,
  onClose,
  onSubmit,
  defaultValues,
  title,
  scenarioId,
}: EmployeeFormProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const { register, handleSubmit, setValue, watch, reset } =
    useForm<EmployeeFormData>({
      defaultValues: {
        fullName: defaultValues?.fullName ?? "",
        position: defaultValues?.position ?? "",
        category: defaultValues?.category ?? "PP",
        fte: defaultValues?.fte ?? 1.0,
        departmentId: defaultValues?.departmentId ?? "",
      },
    });

  const category = watch("category");
  const departmentId = watch("departmentId");

  useEffect(() => {
    if (!open || !scenarioId) return;
    fetch(`/api/departments?scenarioId=${scenarioId}`)
      .then((r) => r.json())
      .then((data) => setDepartments(data))
      .catch(() => {});
  }, [open, scenarioId]);

  useEffect(() => {
    if (open && defaultValues) {
      reset({
        fullName: defaultValues.fullName ?? "",
        position: defaultValues.position ?? "",
        category: defaultValues.category ?? "PP",
        fte: defaultValues.fte ?? 1.0,
        departmentId: defaultValues.departmentId ?? "",
      });
    }
  }, [open, defaultValues, reset]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>ФИО</Label>
            <Input {...register("fullName", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label>Должность</Label>
            <Input {...register("position", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label>Подразделение</Label>
            <Select
              value={departmentId}
              onValueChange={(v) => setValue("departmentId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите подразделение" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select
              value={category}
              onValueChange={(v) => setValue("category", v as EmployeeCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PP">ПП</SelectItem>
                <SelectItem value="OPP">ОПП</SelectItem>
                <SelectItem value="AUP">АУП</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>FTE</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              {...register("fte", { valueAsNumber: true })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit">Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
