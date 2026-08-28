"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface DeleteDepartmentDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: "cascade" | "reparent" | "simple") => void;
  childCount: number;
  departmentName: string;
}

export function DeleteDepartmentDialog({
  open,
  onClose,
  onConfirm,
  childCount,
  departmentName,
}: DeleteDepartmentDialogProps) {
  const [mode, setMode] = useState<"cascade" | "reparent">("reparent");

  const hasChildren = childCount > 0;

  function handleConfirm() {
    if (!hasChildren) {
      onConfirm("simple");
    } else {
      onConfirm(mode);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setMode("reparent");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить подразделение</DialogTitle>
          <DialogDescription>
            {hasChildren
              ? `Подразделение «${departmentName}» имеет ${childCount} дочерних элементов. Выберите режим удаления.`
              : `Вы уверены, что хотите удалить подразделение «${departmentName}»?`}
          </DialogDescription>
        </DialogHeader>

        {hasChildren && (
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "cascade" | "reparent")}
            className="space-y-3"
          >
            <div className="flex items-start gap-2 rounded-md border p-3">
              <RadioGroupItem value="reparent" id="delete-reparent" className="mt-0.5" />
              <div>
                <Label htmlFor="delete-reparent" className="cursor-pointer font-medium">
                  Сохранить дочерние подразделения
                </Label>
                <p className="text-xs text-neutral-500">
                  Дочерние подразделения будут перемещены на уровень выше
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-red-200 p-3">
              <RadioGroupItem value="cascade" id="delete-cascade" className="mt-0.5" />
              <div>
                <Label htmlFor="delete-cascade" className="cursor-pointer font-medium text-red-700">
                  Удалить вместе с дочерними
                </Label>
                <p className="text-xs text-neutral-500">
                  Все {childCount} дочерних подразделений будут удалены безвозвратно
                </p>
              </div>
            </div>
          </RadioGroup>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
          >
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
