"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
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

interface Tariff {
  id: string;
  name: string;
  rate: number | string;
}

interface EmployeeFormData {
  fullName: string;
  position: string;
  category: EmployeeCategory;
  fte: number;
  departmentId: string;
  cfo?: string;
  costRate?: number | null;
  tariffId?: string | null;
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
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [selectedCfo, setSelectedCfo] = useState<string>("");
  const [selectedTariffId, setSelectedTariffId] = useState<string>("");
  const { register, handleSubmit, setValue, watch, reset } =
    useForm<Omit<EmployeeFormData, "cfo" | "tariffId">>({
      defaultValues: {
        fullName: defaultValues?.fullName ?? "",
        position: defaultValues?.position ?? "",
        category: defaultValues?.category ?? "PP",
        fte: defaultValues?.fte ?? 1.0,
        departmentId: defaultValues?.departmentId ?? "",
        costRate: defaultValues?.costRate ?? null,
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
    if (!open) return;
    if (scenarioId) {
      fetch(`/api/departments?scenarioId=${scenarioId}`)
        .then((r) => r.json())
        .then((data) => setDepartments(data))
        .catch(() => {});
    }
    fetch("/api/tariffs")
      .then((r) => r.json())
      .then((data) => setTariffs(data))
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
        costRate: defaultValues.costRate ?? null,
      });
      setSelectedCfo(defaultValues.cfo ?? "");
      setSelectedTariffId(defaultValues.tariffId ?? "");
    }
  }, [open, defaultValues, reset]);

  useEffect(() => {
    if (departmentId) {
      const dept = departments.find((d) => d.id === departmentId);
      if (dept?.cfo) {
        setSelectedCfo(dept.cfo);
      }
    }
  }, [departmentId, departments]);

  function handleFormSubmit(data: Omit<EmployeeFormData, "cfo" | "tariffId">) {
    onSubmit({
      ...data,
      cfo: selectedCfo || undefined,
      tariffId: selectedTariffId || null,
    });
  }

  const selectedTariff = tariffs.find((t) => t.id === selectedTariffId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto overflow-x-hidden">
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
            <Select value={selectedCfo} onValueChange={setSelectedCfo}>
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
          <div className="space-y-2">
            <Label>Ставка себестоимости (руб.)</Label>
            <MoneyInput
              value={watch("costRate")}
              onChange={(v) => setValue("costRate", v)}
              placeholder="Не указана"
            />
          </div>
          <div className="space-y-2">
            <Label>Тарифная ставка</Label>
            <Select
              value={selectedTariffId || "none"}
              onValueChange={(v) => setSelectedTariffId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Не выбрана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрана</SelectItem>
                {tariffs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
