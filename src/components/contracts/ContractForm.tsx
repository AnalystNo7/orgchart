"use client";

import { useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
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

interface ContractFormData {
  name: string;
  type: "REVENUE" | "EXPENSE";
  status: "CONCLUDED" | "PLANNED";
  amount: number | null;
  expectedAmount: number | null;
  amountAutoCalc: boolean;
  periodStart: string;
  periodEnd: string;
  description: string;
}

interface ContractFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ContractFormData) => void;
  defaultValues?: Partial<ContractFormData>;
  title: string;
  contractId?: string;
}

export function ContractForm({
  open,
  onClose,
  onSubmit,
  defaultValues,
  title,
  contractId,
}: ContractFormProps) {
  const { register, handleSubmit, setValue, watch, reset } =
    useForm<ContractFormData>({
      defaultValues: {
        name: "",
        type: "REVENUE",
        status: "CONCLUDED",
        amount: null,
        expectedAmount: null,
        amountAutoCalc: false,
        periodStart: "",
        periodEnd: "",
        description: "",
        ...defaultValues,
      },
    });

  const contractType = watch("type");
  const contractStatus = watch("status");
  const amountAutoCalc = watch("amountAutoCalc");

  const fetchCalculatedAmount = useCallback(async () => {
    if (!contractId || !amountAutoCalc) return;
    try {
      const res = await fetch(`/api/contracts/${contractId}/calculate-amount`);
      if (res.ok) {
        const data = await res.json();
        if (contractStatus === "CONCLUDED") {
          setValue("amount", data.calculatedAmount);
        } else {
          setValue("expectedAmount", data.calculatedAmount);
        }
      }
    } catch {
      // ignore fetch errors
    }
  }, [contractId, amountAutoCalc, contractStatus, setValue]);

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        type: "REVENUE",
        status: "CONCLUDED",
        amount: null,
        expectedAmount: null,
        amountAutoCalc: false,
        periodStart: "",
        periodEnd: "",
        description: "",
        ...defaultValues,
      });
    }
  }, [open, defaultValues, reset]);

  useEffect(() => {
    if (open && amountAutoCalc && contractId) {
      fetchCalculatedAmount();
    }
  }, [open, amountAutoCalc, contractId, fetchCalculatedAmount]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Наименование</Label>
            <Input {...register("name", { required: true })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Вид договора</Label>
              <Select
                value={contractType}
                onValueChange={(v) => setValue("type", v as "REVENUE" | "EXPENSE")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REVENUE">Доходный</SelectItem>
                  <SelectItem value="EXPENSE">Расходный</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Признак</Label>
              <Select
                value={contractStatus}
                onValueChange={(v) => setValue("status", v as "CONCLUDED" | "PLANNED")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONCLUDED">Заключённый</SelectItem>
                  <SelectItem value="PLANNED">Планируемый</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {contractStatus === "CONCLUDED" ? "Сумма договора (руб.)" : "Ожидаемая сумма (руб.)"}
              </Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-calc-switch" className="text-xs text-muted-foreground">
                  Авторасчёт
                </Label>
                <Switch
                  id="auto-calc-switch"
                  checked={amountAutoCalc}
                  onCheckedChange={(checked) => {
                    setValue("amountAutoCalc", checked);
                    if (checked && contractId) {
                      fetchCalculatedAmount();
                    }
                  }}
                />
              </div>
            </div>
            {amountAutoCalc ? (
              contractId ? (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  {(contractStatus === "CONCLUDED" ? watch("amount") : watch("expectedAmount")) != null
                    ? Number(contractStatus === "CONCLUDED" ? watch("amount") : watch("expectedAmount")).toLocaleString("ru-RU") + " ₽"
                    : "Нет сотрудников с тарифной ставкой"}
                  <span className="ml-2 text-xs text-muted-foreground">(К-1 × FTE × раб. часы)</span>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Сумма будет рассчитана после сохранения и добавления сотрудников
                </div>
              )
            ) : (
              <MoneyInput
                value={contractStatus === "CONCLUDED" ? watch("amount") : watch("expectedAmount")}
                onChange={(v) =>
                  contractStatus === "CONCLUDED"
                    ? setValue("amount", v)
                    : setValue("expectedAmount", v)
                }
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Дата начала</Label>
              <Input type="date" {...register("periodStart", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>Дата окончания</Label>
              <Input type="date" {...register("periodEnd", { required: true })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Описание</Label>
            <Input {...register("description")} />
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
