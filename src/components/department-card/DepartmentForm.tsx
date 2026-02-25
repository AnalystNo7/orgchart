"use client";

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
}

interface EmployeeFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeFormData) => void;
  defaultValues?: Partial<EmployeeFormData>;
  title: string;
}

export function EmployeeFormDialog({
  open,
  onClose,
  onSubmit,
  defaultValues,
  title,
}: EmployeeFormDialogProps) {
  const { register, handleSubmit, setValue, watch } = useForm<EmployeeFormData>({
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      position: defaultValues?.position ?? "",
      category: defaultValues?.category ?? "PP",
      fte: defaultValues?.fte ?? 1.0,
    },
  });

  const category = watch("category");

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
            <Label>Категория</Label>
            <Select value={category} onValueChange={(v) => setValue("category", v as EmployeeCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PP">ПП — Производственный</SelectItem>
                <SelectItem value="OPP">ОПП — Обеспечивающий</SelectItem>
                <SelectItem value="AUP">АУП — Административный</SelectItem>
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
