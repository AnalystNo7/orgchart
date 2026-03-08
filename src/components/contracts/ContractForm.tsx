"use client";

import { useEffect } from "react";
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

interface ContractFormData {
  name: string;
  type: "REVENUE" | "EXPENSE";
  status: "CONCLUDED" | "PLANNED";
  amount: number | null;
  expectedAmount: number | null;
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
}

export function ContractForm({
  open,
  onClose,
  onSubmit,
  defaultValues,
  title,
}: ContractFormProps) {
  const { register, handleSubmit, setValue, watch, reset } =
    useForm<ContractFormData>({
      defaultValues: {
        name: "",
        type: "REVENUE",
        status: "CONCLUDED",
        amount: null,
        expectedAmount: null,
        periodStart: "",
        periodEnd: "",
        description: "",
        ...defaultValues,
      },
    });

  const contractType = watch("type");
  const contractStatus = watch("status");

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        type: "REVENUE",
        status: "CONCLUDED",
        amount: null,
        expectedAmount: null,
        periodStart: "",
        periodEnd: "",
        description: "",
        ...defaultValues,
      });
    }
  }, [open, defaultValues, reset]);

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

          {contractStatus === "CONCLUDED" && (
            <div className="space-y-2">
              <Label>Сумма договора (руб.)</Label>
              <MoneyInput
                value={watch("amount")}
                onChange={(v) => setValue("amount", v)}
              />
            </div>
          )}

          {contractStatus === "PLANNED" && (
            <div className="space-y-2">
              <Label>Ожидаемая сумма (руб.)</Label>
              <MoneyInput
                value={watch("expectedAmount")}
                onChange={(v) => setValue("expectedAmount", v)}
              />
            </div>
          )}

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
