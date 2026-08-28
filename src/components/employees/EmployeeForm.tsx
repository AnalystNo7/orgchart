"use client";

import { useEffect, useMemo, useState } from "react";
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
  cfo?: string;
}

interface Department {
  id: string;
  name: string;
  cfo: string | null;
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
  const [selectedCfo, setSelectedCfo] = useState<string>("");
  const { register, handleSubmit, setValue, watch, reset } =
    useForm<Omit<EmployeeFormData, "cfo">>({
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

  const uniqueCfoValues = useMemo(() => {
    const cfoSet = new Set<string>();
    departments.forEach((d) => {
      if (d.cfo) cfoSet.add(d.cfo);
    });
    return Array.from(cfoSet).sort();
  }, [departments]);

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
      setSelectedCfo(defaultValues.cfo ?? "");
    }
  }, [open, defaultValues, reset]);

  // Auto-fill ЦФО when department changes
  useEffect(() => {
    if (departmentId) {
      const dept = departments.find((d) => d.id === departmentId);
      if (dept?.cfo) {
        setSelectedCfo(dept.cfo);
      }
    }
  }, [departmentId, departments]);

  function handleFormSubmit(data: Omit<EmployeeFormData, "cfo">) {
    onSubmit({ ...data, cfo: selectedCfo || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
            <Label>ЦФО</Label>
            <Select
              value={selectedCfo}
              onValueChange={setSelectedCfo}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите ЦФО" />
              </SelectTrigger>
              <SelectContent>
                {uniqueCfoValues.map((cfo) => (
                  <SelectItem key={cfo} value={cfo}>
                    {cfo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500">
              ЦФО обновит значение для всего подразделения
            </p>
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
